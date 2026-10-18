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
UA = "Mozilla/5.0 (compatible; JaySteelLogistics/1.0; +https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/)"

# name, kind, url, type, city, county, state
SOURCES = [
    # --- colleges & universities (Campus Labs Engage RSS) ---
    ("UNF Events", "localist", "https://events.unf.edu", "college", "Jacksonville", "Duval", "FL"),
    ("FSCJ Events", "localist", "https://events.fscj.edu", "college", "Jacksonville", "Duval", "FL"),
    ("Stetson University (Engage)", "engage", "https://stetson.campuslabs.com/engage/events.rss", "college", "DeLand", "Volusia", "FL"),
    ("University of Florida (Engage)", "engage", "https://ufl.campuslabs.com/engage/events.rss", "college", "Gainesville", "Alachua", "FL"),
    ("Georgia State University (Engage)", "engage", "https://gsu.campuslabs.com/engage/events.rss", "college", "Atlanta", "Fulton", "GA"),
    ("Georgia State University Calendar", "localist", "https://calendar.gsu.edu", "college", "Atlanta", "Fulton", "GA"),
    ("Georgia Tech (Engage)", "engage", "https://gatech.campuslabs.com/engage/events.rss", "college", "Atlanta", "Fulton", "GA"),
    ("Kennesaw State (Engage)", "engage", "https://kennesaw.campuslabs.com/engage/events.rss", "college", "Kennesaw", "Cobb", "GA"),
    ("Kennesaw State Calendar", "localist", "https://calendar.kennesaw.edu", "college", "Kennesaw", "Cobb", "GA"),
    ("Agnes Scott College Calendar", "localist", "https://calendar.agnesscott.edu", "college", "Decatur", "DeKalb", "GA"),
    ("University of North Georgia (Engage)", "engage", "https://ung.campuslabs.com/engage/events.rss", "college", "Gainesville / Oakwood", "Hall", "GA"),
    # Tried 2026-10-18 with no public feed found (add one here if they publish it):
    # JU, Flagler College, Edward Waters, Embry-Riddle, Bethune-Cookman, Daytona State, Emory, Morehouse,
    # Spelman, Clark Atlanta, Morris Brown, SCAD Atlanta, Atlanta Technical, Georgia Gwinnett, Brenau, Lanier Tech.
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
    ("City of Gainesville, GA", "civic", "https://www.gainesville.org", "city", "Gainesville", "Hall", "GA"),
    ("Hall County, GA", "civic", "https://www.hallcounty.org", "county", "Gainesville", "Hall", "GA"),
    ("City of Flowery Branch", "civic", "https://www.flowerybranchga.org", "city", "Flowery Branch", "Hall", "GA"),
    ("City of Palm Coast", "civic", "https://www.palmcoast.gov", "city", "Palm Coast", "Flagler", "FL"),
    ("Clay County", "civic", "https://www.claycountygov.com", "county", "Green Cove Springs", "Clay", "FL"),
    ("Volusia County", "civic", "https://www.volusia.org", "county", "DeLand", "Volusia", "FL"),
    # --- marketplaces (often block automated reads; reported if so) ---
    ("Eventbrite: vendor events near Jacksonville", "eventbrite", "https://www.eventbrite.com/d/fl--jacksonville/vendor/", "market", "Jacksonville", "Duval", "FL"),
    ("Eventbrite: vendor events near Daytona Beach", "eventbrite", "https://www.eventbrite.com/d/fl--daytona-beach/vendor/", "market", "Daytona Beach", "Volusia", "FL"),
    ("Eventbrite: vendor events near Atlanta", "eventbrite", "https://www.eventbrite.com/d/ga--atlanta/vendor/", "market", "Atlanta", "Fulton", "GA"),
    ("VendorsMap: Jacksonville", "jsonld", "https://vendorsmap.com/events/florida/jacksonville", "market", "Jacksonville", "Duval", "FL"),
]

OPP = re.compile(r"\b(vendors?|market\s?(?:day|place)?s?|marketplace|bazaar|pop[- ]?ups?|flea|craft(?:s| fair| show)?|artisans?|makers?|expo|tabling|festival|fest|holiday (?:shop|market|fair|bazaar)|small business|art (?:walk|show|fair)|first friday|christmas|tree lighting|parade|night market|block party|showcase|fair)\b", re.I)
VENDOR = re.compile(r"\bvendors?\b|\bbooths?\b|\bpop[- ]?ups?\b|\bbazaar\b|\bmarket\b|\bmarketplace\b|\bflea\b|\bcraft\b|\bartisans?\b", re.I)
NOPE = re.compile(r"\b(career|job|internship|graduate school|study abroad|grad|meeting|board|commission|council|hearing|workshop|webinar|cancell?ed|postponed|orientation|info session|seminar|lecture|recital|exam|interview|science fair|health fair|benefits fair|financial aid|resume|recruit(?:ing|ment)|panel|research|deployment|professional selling)\b", re.I)
TABLING = re.compile(r"\btabling\b|\btable\b", re.I)
TAG = re.compile(r"<[^>]+>")

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")

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

p_eventbrite = p_jsonld
PARSERS = {"engage": p_engage, "localist": p_localist, "civic": p_civic, "eventbrite": p_eventbrite, "jsonld": p_jsonld}

def run(src):
    try:
        items = PARSERS[src[1]](src)
        return src, items, None
    except Exception as e:  # one broken site never breaks the run
        return src, [], f"{type(e).__name__}: {str(e)[:160]}"

def main():
    prev = {}
    if os.path.exists(OUT):
        try:
            for it in json.load(open(OUT)).get("items", []):
                prev[it["id"]] = it.get("firstSeen")
        except Exception:
            pass
    seed = json.load(open(SEED)) if os.path.exists(SEED) else {"items": []}
    items, report = [], []
    with cf.ThreadPoolExecutor(12) as ex:
        for src, got, err in ex.map(run, SOURCES):
            report.append({"source": src[0], "type": src[3], "state": src[6], "county": src[5], "url": src[2],
                           "ok": err is None, "items": len(got), "error": err})
            items.extend(got)
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
        if it.get("date") and it["date"] < now:
            it = dict(it); it.pop("date")
        it["firstSeen"] = prev.get(it["id"]) or it.get("firstSeen") or now
        (uniq if it.get("date") else ongoing).append(it)
    uniq.sort(key=lambda x: (x["date"], x["title"]))
    new_ids = [it["id"] for it in uniq if it["firstSeen"] == now and it["id"] not in prev and it.get("origin") != "seed"]
    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "refresh": "every 6 hours (GitHub Actions), not live",
        "coverage": "NE Florida (Nassau, Duval, Clay, St. Johns, Baker, Putnam, Flagler, Volusia) + Georgia (Atlanta area, Flowery Branch / Hall County)",
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
                        "color": 0xE91E63, "description": "\n".join(lines)[:4000],
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
