#!/usr/bin/env python3
"""Refresh data/opportunities.json — public vendor opportunities for JAY STEEL JEWELRY.

Runs every 6 hours in GitHub Actions (not literally live). Standard library only.
Every source is wrapped on its own: a broken or blocked site is reported in
data/opportunities.json -> sources[], and never stops the run.
Add a source by adding one line to SOURCES below.
"""
import concurrent.futures as cf
import hashlib, html, json, os, re, sys, urllib.request
from datetime import datetime, date, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/New_York")
TODAY = datetime.now(TZ).date()
HORIZON = TODAY + timedelta(days=200)
OUT = "data/opportunities.json"
SEED = "data/opportunities_seed.json"
# Nov 9 2026: an honest bot UA on purpose. A Chrome-style UA from GitHub's runners made the CivicPlus city sites time out (WAF tarpit).
UA = "Mozilla/5.0 (compatible; JaySteelLogistics/1.0; +https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/)"
HEADERS = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"}
VETTED = "data/opportunities_vetted.json"

# name, kind, url, type, city, county, state
SOURCES = [
    # --- colleges & universities (Campus Labs Engage RSS) ---
    ("UNF Events", "localist", "https://events.unf.edu", "college", "Jacksonville", "Duval", "FL"),
    ("FSCJ Events", "localist", "https://events.fscj.edu", "college", "Jacksonville", "Duval", "FL"),
    ("Stetson University (Engage)", "engage", "https://stetson.campuslabs.com/engage/events.rss", "college", "DeLand", "Volusia", "FL"),
    ("University of Florida (Engage)", "engage", "https://ufl.campuslabs.com/engage/events.rss", "college", "Gainesville", "Alachua", "FL"),
    # Tried 2026-10-18 with no public feed found (add one here if they publish it):
    # JU, Flagler College, Edward Waters, Embry-Riddle, Bethune-Cookman, Daytona State.
    # Nov 9 2026: Georgia sources removed (Luis works Florida only).
    # --- cities & counties (CivicPlus calendar RSS) ---
    ("City of Jacksonville Beach", "civic", "https://www.jacksonvillebeach.org", "city", "Jacksonville Beach", "Duval", "FL"),
    ("City of Fernandina Beach", "civic", "https://www.fbfl.us", "city", "Fernandina Beach", "Nassau", "FL"),
    ("Nassau County", "civic", "https://www.nassaucountyfl.com", "county", "Fernandina Beach", "Nassau", "FL"),
    ("City of Green Cove Springs", "civic", "https://www.greencovesprings.com", "city", "Green Cove Springs", "Clay", "FL"),
    ("City of St. Augustine", "civic", "https://www.citystaug.com", "city", "St. Augustine", "St. Johns", "FL"),
    ("City of St. Augustine Beach", "civic", "https://www.staugbch.com", "city", "St. Augustine Beach", "St. Johns", "FL"),
    ("City of Palatka", "civic", "https://www.palatka-fl.gov", "city", "Palatka", "Putnam", "FL"),
    ("City of Flagler Beach", "civic", "https://www.cityofflaglerbeach.com", "city", "Flagler Beach", "Flagler", "FL"),
    ("City of Bunnell", "civic", "https://www.bunnellcity.us", "city", "Bunnell", "Flagler", "FL"),
    ("City of Daytona Beach", "civic", "https://www.codb.us", "city", "Daytona Beach", "Volusia", "FL"),
    ("City of Ormond Beach", "civic", "https://www.ormondbeach.org", "city", "Ormond Beach", "Volusia", "FL"),
    ("City of Port Orange", "civic", "https://www.port-orange.org", "city", "Port Orange", "Volusia", "FL"),
    ("City of New Smyrna Beach", "civic", "https://www.cityofnsb.com", "city", "New Smyrna Beach", "Volusia", "FL"),
    ("City of DeLand", "civic", "https://www.deland.org", "city", "DeLand", "Volusia", "FL"),
    # Nov 9 2026: Palm Coast left CivicPlus (own site: /events + /CityCalendar JSON); claycountygov.com blocks all
    # scripts (Akamai 403), so Clay comes from the county tourism calendar; Volusia's calendar feed is eventfeed.php.
    ("City of Palm Coast", "palmcoast", "https://www.palmcoast.gov", "city", "Palm Coast", "Flagler", "FL"),
    ("Clay County (Explore Clay)", "tribe", "https://exploreclay.com", "county", "Green Cove Springs", "Clay", "FL"),
    ("Volusia County", "rss", "https://www.volusia.org/resources/eventfeed.php", "county", "DeLand", "Volusia", "FL"),
    # --- marketplaces ---
    # Nov 9 2026: Eventbrite's search pages answer every script with a human-verification wall (405), so they are
    # dropped here; Eventbrite events still arrive through Tab's daily vetted pipeline (web search + organizer page check).
    ("VendorsMap: Jacksonville", "jsonld", "https://vendorsmap.com/cities/jacksonville-fl", "market", "Jacksonville", "Duval", "FL"),
    ("VendorsMap: St. Augustine", "jsonld", "https://vendorsmap.com/cities/st-augustine", "market", "St. Augustine", "St. Johns", "FL"),
    ("Verified by Tab (organizer pages, statewide)", "vetted", VETTED, "market", "", "", "FL"),
]

OPP = re.compile(r"\b(vendors?|market\s?(?:day|place)?s?|marketplace|bazaar|pop[- ]?ups?|flea|craft(?:s| fair| show)?|artisans?|makers?|expo|tabling|festival|fest|holiday (?:shop|market|fair|bazaar)|small business|art (?:walk|show|fair)|first friday|christmas|tree lighting|parade|night market|block party|showcase|fair)\b", re.I)
VENDOR = re.compile(r"\bvendors?\b|\bbooths?\b|\bpop[- ]?ups?\b|\bbazaar\b|\bmarket\b|\bmarketplace\b|\bflea\b|\bcraft\b|\bartisans?\b", re.I)
NOPE = re.compile(r"\b(career|job|internship|graduate school|study abroad|grad|meeting|board|commission|council|hearing|workshop|webinar|cancell?ed|postponed|orientation|info session|seminar|lecture|recital|exam|interview|science fair|health fair|benefits fair|financial aid|resume|recruit(?:ing|ment)|panel|research|deployment|professional selling)\b", re.I)
TABLING = re.compile(r"\btabling\b|\btable\b", re.I)
TAG = re.compile(r"<[^>]+>")

def fetch(url, timeout=30, data=None, headers=None, tries=3):
    """Browser-like GET (or POST when data is given), 3 tries with backoff; 4xx other than 429 fail at once."""
    import time, urllib.error
    last = None
    for n in range(tries):
        req = urllib.request.Request(url, data=data, headers={**HEADERS, **(headers or {})}, method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
        except urllib.error.HTTPError as e:
            last = e
            if e.code < 500 and e.code != 429: raise
        except Exception as e:
            last = e
        time.sleep(2 * (n + 1))
    raise last

def clean(s):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", s or ""))).strip()

STRONG = re.compile(r"\b(vendors?|market(?:s| ?day| ?place)?|marketplace|bazaar|pop[- ]?ups?|flea|craft (?:fair|show|market)|artisans?|makers? (?:market|fair)|night market|holiday (?:market|bazaar|shop|fair)|small business|expo)\b", re.I)
SELL = re.compile(r"\bvendors?\b|\bvendor (?:booth|table|space)s?\b|\blocal (?:small )?business(?:es)?\b|\bsmall business(?:es)?\b", re.I)

def keep(title, desc="", kind="city"):
    if NOPE.search(title):
        return False
    if kind == "college":
        return bool(STRONG.search(title) or SELL.search(desc or ""))
    return bool(OPP.search(title) or SELL.search(desc or ""))

def mk(src, title, d, url, t=None, location=None, desc=""):
    name, kind, _, typ, city, county, state = src
    if not d or d < TODAY or d > HORIZON:
        return None
    full = f"{title} {desc}"
    if typ == "college" and TABLING.search(full):
        typ2 = "tabling"
    elif typ in ("city", "county") and re.search(r"\bmarket\b|\bbazaar\b|\bflea\b", title, re.I):
        typ2 = "market"
    else:
        typ2 = typ
    return {
        "id": hashlib.sha1(f"{name}|{title}|{d}".encode()).hexdigest()[:12],
        "title": title[:140], "date": d.isoformat(), "time": t, "location": (location or "")[:120] or None,
        "city": city, "county": county, "state": state, "type": typ2, "source": name, "url": url,
        "vendorMatch": bool(VENDOR.search(full)),
    }

def p_engage(src):
    root = ET.fromstring(fetch(src[2]).encode())
    out = []
    for it in root.iter("item"):
        title = clean(it.findtext("title")); desc = clean(it.findtext("description"))
        if not keep(title, desc, src[3]):
            continue
        st = it.find("{events}start")
        if st is None or not st.text:
            continue
        dt = parsedate_to_datetime(st.text).astimezone(TZ)
        loc = it.findtext("{events}location")
        x = mk(src, title, dt.date(), it.findtext("link"), dt.strftime("%-I:%M %p"), loc, desc)
        if x: out.append(x)
    return out

def p_localist(src):
    out = []
    for page in range(1, 6):
        j = json.loads(fetch(f"{src[2]}/api/2/events?days=180&pp=100&page={page}"))
        for wrap in j.get("events", []):
            e = wrap.get("event", {})
            title = clean(e.get("title")); desc = clean(e.get("description_text") or e.get("description") or "")[:600]
            if not keep(title, desc, src[3]):
                continue
            for inst in e.get("event_instances", [])[:3]:
                s = inst.get("event_instance", {}).get("start")
                if not s: continue
                dt = datetime.fromisoformat(s).astimezone(TZ)
                x = mk(src, title, dt.date(), e.get("localist_url") or e.get("url"), None if inst["event_instance"].get("all_day") else dt.strftime("%-I:%M %p"), e.get("location_name"), desc)
                if x: out.append(x)
        if page >= (j.get("page", {}).get("total") or 1):
            break
    return out

def p_civic(src):
    txt = fetch(src[2].rstrip("/") + "/RSSFeed.aspx?ModID=58&CID=All-calendar.xml")
    root = ET.fromstring(txt.encode())
    out = []
    for it in root.iter("item"):
        title = clean(it.findtext("title")); desc = clean(it.findtext("description"))
        if not keep(title, desc, src[3]):
            continue
        dtxt = None; ttxt = None; loc = None
        for ch in it:
            tag = ch.tag.split("}")[-1]
            if tag == "EventDates": dtxt = (ch.text or "").strip()
            elif tag == "EventTimes": ttxt = (ch.text or "").strip()
            elif tag == "Location": loc = clean(ch.text)
        if not dtxt: continue
        m = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})", dtxt)
        if not m: continue
        d = datetime.strptime(m.group(1), "%B %d, %Y").date()
        x = mk(src, title, d, it.findtext("link"), ttxt, loc, desc)
        if x: out.append(x)
    return out

def _jsonld_events(txt):
    for blob in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', txt, re.S):
        try:
            data = json.loads(blob)
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            o = stack.pop()
            if isinstance(o, dict):
                if "itemListElement" in o: stack.extend(o["itemListElement"])
                if "item" in o and isinstance(o["item"], dict): stack.append(o["item"])
                if str(o.get("@type", "")).endswith("Event") and o.get("startDate"):
                    yield o
            elif isinstance(o, list):
                stack.extend(o)

def p_jsonld(src):
    out = []
    for e in _jsonld_events(fetch(src[2])):
        title = clean(e.get("name"))
        try:
            d = datetime.fromisoformat(e["startDate"][:10]).date()
        except Exception:
            continue
        loc = e.get("location") or {}
        locname = loc.get("name") if isinstance(loc, dict) else None
        x = mk(src, title, d, e.get("url") or src[2], None, locname, clean(e.get("description"))[:300])
        if x: out.append(x)
    return out

def p_rss(src):
    """Plain RSS 2.0 calendar feed whose pubDate is the event start (Volusia's eventfeed.php)."""
    txt = fetch(src[2])
    if "\u00e2\u0080" in txt:  # Volusia labels its UTF-8 feed ISO-8859-1
        txt = txt.encode("latin-1", "replace").decode("utf-8", "replace")
    out = []
    for blk in re.findall(r"<item>(.*?)</item>", txt, re.S):
        g = lambda tag: (re.search(rf"<{tag}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>", blk, re.S) or [None, ""])[1]
        title = clean(g("title")); desc = clean(g("description"))[:600]
        if not title or not keep(title, desc, src[3]):
            continue
        try:
            dt = parsedate_to_datetime(g("pubDate").strip()).astimezone(TZ)
        except Exception:
            continue
        link = g("link").strip().replace("//about-us", "/about-us").replace("http://", "https://")
        x = mk(src, title, dt.date(), link or src[2], None, None, desc)
        if x: out.append(x)
    return out

def p_tribe(src):
    """WordPress 'The Events Calendar' REST API (/wp-json/tribe/events/v1/events)."""
    out = []
    for page in range(1, 6):
        j = json.loads(fetch(f"{src[2].rstrip('/')}/wp-json/tribe/events/v1/events?per_page=50&page={page}"
                             f"&start_date={TODAY.isoformat()}&end_date={HORIZON.isoformat()}", headers={"Accept": "application/json"}))
        for e in j.get("events", []):
            title = clean(e.get("title")); desc = clean(e.get("description"))[:600]
            if not keep(title, desc, src[3]):
                continue
            try:
                d = datetime.fromisoformat(e["start_date"]).date()
            except Exception:
                continue
            v = e.get("venue") if isinstance(e.get("venue"), dict) else {}
            t = None if e.get("all_day") else datetime.fromisoformat(e["start_date"]).strftime("%-I:%M %p")
            x = mk(src, title, d, e.get("url") or src[2], t, clean(v.get("venue")), desc)
            if x:
                if v.get("city"): x["city"] = clean(v["city"])
                out.append(x)
        if page >= (j.get("total_pages") or 1):
            break
    return out

def p_palmcoast(src):
    """City of Palm Coast's own site (left CivicPlus in 2026): the /events list page + the CityCalendar JSON."""
    out = []
    page = fetch(src[2] + "/events")
    for m in re.finditer(r'<h1><a[^>]+href="([^"]+)"[^>]*>(.*?)</a></h1>\s*<strong>([A-Z][a-z]+), (\d{1,2}) (\d{4}) (\d{1,2}:\d\d [AP]M)', page):
        href, title = m.group(1), clean(m.group(2))
        if not keep(title, "", src[3]): continue
        d = datetime.strptime(f"{m.group(3)} {m.group(4)} {m.group(5)}", "%B %d %Y").date()
        x = mk(src, title, d, src[2] + href if href.startswith("/") else href, m.group(6).lstrip("0"), None, "")
        if x: out.append(x)
    raw = fetch(f"{src[2]}/CityCalendar/Home/CalEvent?start={TODAY.isoformat()}&end={HORIZON.isoformat()}&_showAll=true",
                data=b'{"_showAll":true}', headers={"Accept": "application/json", "Content-Type": "application/json"})
    cal = json.loads(raw)
    while isinstance(cal, str): cal = json.loads(cal)
    for e in cal or []:
        title = clean(e.get("title")); desc = clean(e.get("body"))[:600]
        if (e.get("raw") or {}).get("IsCityMeeting") or (e.get("raw") or {}).get("IsCancelled"): continue
        if not keep(title, desc, src[3]): continue
        try:
            dt = datetime.fromisoformat(e["start"][:19])
        except Exception:
            continue
        x = mk(src, title, dt.date(), src[2] + (e.get("url") or "/CityCalendar"), dt.strftime("%-I:%M %p"), clean(e.get("location")), desc)
        if x: out.append(x)
    return out

def p_vetted(src):
    """Row for Tab's daily vetted pipeline (data/opportunities_vetted.json, merged into Find markets by the app).
    Counted here so the panel shows it; its items are NOT copied into opportunities.json (the app merges them)."""
    v = json.load(open(src[2]))
    n = sum(1 for i in (v.get("items") or []) + (v.get("ongoing") or []) if (i.get("state") or "FL") == "FL")
    return [None] * n

p_eventbrite = p_jsonld
PARSERS = {"engage": p_engage, "localist": p_localist, "civic": p_civic, "eventbrite": p_eventbrite, "jsonld": p_jsonld,
           "rss": p_rss, "tribe": p_tribe, "palmcoast": p_palmcoast, "vetted": p_vetted}

def run(src):
    try:
        items = PARSERS[src[1]](src)
        return src, items, None
    except Exception as e:  # one broken site never breaks the run
        return src, [], f"{type(e).__name__}: {str(e)[:160]}"

def main():
    prev, prev_doc = {}, {}
    if os.path.exists(OUT):
        try:
            prev_doc = json.load(open(OUT))
            for it in prev_doc.get("items", []):
                prev[it["id"]] = it.get("firstSeen")
        except Exception:
            pass
    prev_rows = {r.get("source"): r for r in prev_doc.get("sources", [])}
    prev_items = {}
    for it in prev_doc.get("items", []):
        prev_items.setdefault(it.get("source"), []).append(it)
    now_utc = datetime.now(timezone.utc)
    seed = json.load(open(SEED)) if os.path.exists(SEED) else {"items": []}
    items, report = [], []
    # City/county CivicPlus sites share one host network that throttles bursts from one IP (GitHub runners saw
    # timeouts on ~1 run in 4 since Nov 1), so they run 3 at a time; everything else runs in parallel.
    civic = [s for s in SOURCES if s[1] == "civic"]; other = [s for s in SOURCES if s[1] != "civic"]
    with cf.ThreadPoolExecutor(8) as ex, cf.ThreadPoolExecutor(3) as exc:
        futs = [ex.submit(run, s) for s in other] + [exc.submit(run, s) for s in civic]
        results = {r[0][0]: r for r in (f.result() for f in futs)}
    for s in SOURCES:
        src, got, err = results[s[0]]
        row = {"source": src[0], "type": src[3], "state": src[6], "county": src[5], "url": src[2],
               "ok": err is None, "items": len(got), "error": err}
        if err is None:
            row["lastOk"] = now_utc.strftime("%Y-%m-%dT%H:%MZ")
        else:
            # Last-good fallback: a site that didn't answer this scan keeps its last good read for up to 3 days,
            # shown as "kept from last read" instead of a red X. Older than that, the error shows.
            pr = prev_rows.get(src[0]) or {}
            last = pr.get("lastOk") or (prev_doc.get("updated") if pr.get("ok") else None)
            try:
                age = now_utc - datetime.strptime(last, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc) if last else None
            except Exception:
                age = None
            if age is not None and age <= timedelta(days=3):
                got = [dict(x) for x in prev_items.get(src[0], []) if x.get("date", "") >= TODAY.isoformat()]
                row.update({"ok": True, "stale": True, "lastOk": last, "items": len(got), "error": None, "note": err})
        report.append(row)
        items.extend(x for x in got if x)
    now = TODAY.isoformat()
    seen, uniq = set(), []
    for it in sorted(items, key=lambda x: (x["date"], x["title"])):
        k = (it["title"].lower(), it["date"])
        if k in seen: continue
        seen.add(k)
        it["firstSeen"] = prev.get(it["id"]) or now
        uniq.append(it)
    ongoing = []
    for it in seed.get("items", []):
        if (it.get("state") or "FL") != "FL":
            continue  # Nov 9 2026: Florida only
        if it.get("date") and it["date"] < now:
            if str(it.get("id", "")).startswith(("fl6-", "ga-")) and (it.get("end_date") or it["date"]) < now:
                continue  # Nov 2026 statewide/GA one-off dates: drop once past instead of turning ongoing
            it = dict(it); it.pop("date")
        it["firstSeen"] = prev.get(it["id"]) or it.get("firstSeen") or now
        (uniq if it.get("date") else ongoing).append(it)
    uniq.sort(key=lambda x: (x["date"], x["title"]))
    new_ids = [it["id"] for it in uniq if it["firstSeen"] == now and it["id"] not in prev and it.get("origin") != "seed"]
    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "refresh": "every 6 hours (GitHub Actions), not live",
        "coverage": "Florida statewide (all 67 counties as found)",
        "sources": report, "items": uniq, "ongoing": ongoing, "newThisRun": new_ids,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    ok = sum(1 for r in report if r["ok"] and r["items"])
    print(f"{len(uniq)} dated + {len(ongoing)} ongoing items; {ok}/{len(report)} sources returned data; {len(new_ids)} new")
    for r in report:
        print(("OK  " if r["ok"] else "ERR ") + f'{r["items"]:4d}  {r["source"]}' + (f'  — {r["error"]}' if r["error"] else ""))

def post_discord(out, had_previous):
    """One compact card per run, only for NEW vendor-type items, only after the first run."""
    hook = os.environ.get("DISCORD_OPPORTUNITIES_WEBHOOK_URL", "").strip()
    if not hook or not had_previous:
        return
    new = [it for it in out["items"] if it["id"] in set(out["newThisRun"]) and it.get("vendorMatch")][:8]
    if not new:
        return
    app = "https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/#/opportunities"
    lines = []
    for it in new:
        d = datetime.fromisoformat(it["date"]).strftime("%a %b %-d")
        lines.append(f"• **{d}** — [{it['title'][:80]}]({it['url']}) · {it['city']}, {it['state']}")
    body = {"username": "JAY STEEL Logistics", "allowed_mentions": {"parse": []},
            "embeds": [{"title": f"🔎 {len(new)} new vendor opportunit{'y' if len(new) == 1 else 'ies'}", "url": app,
                        "color": 0xC9CED6, "description": "\n".join(lines)[:4000],
                        "footer": {"text": "Found by the Opportunities scan · every 6 h · tap the title to apply"}}]}
    req = urllib.request.Request(hook.split("?")[0], data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "User-Agent": UA})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        print(f"Posted {len(new)} new items to Discord")
    except Exception as e:
        print("Discord post failed:", e)

if __name__ == "__main__":
    had_previous = os.path.exists(OUT)
    main()
    try:
        post_discord(json.load(open(OUT)), had_previous)
    except Exception as e:
        print("Discord step skipped:", e)
