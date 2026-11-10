#!/usr/bin/env python3
"""Refresh data/opportunities.json — vendor opportunities across ALL of Florida and Georgia.

Runs every 6 hours in GitHub Actions (not literally live). Standard library only.

How it finds events (every source is wrapped on its own; a broken or blocked site is
reported in data/opportunities.json -> sources[] and never stops the run):
  * colleges/universities — Localist API feeds, CampusLabs "Engage" RSS, city/county
    CivicPlus calendar RSS, WordPress "The Events Calendar" REST, newsroom JSON-LD
  * cities/counties/tourism — CivicPlus + tribe + palmcoast patterns
  * marketplaces — VendorsMap city pages
  * the whole state, beyond any known calendar — the SEARCH source: Google results via
    Serper when the SEARCH_API_KEY secret is set (or the SEARCH_ENGINE = google), else
    DuckDuckGo HTML. Each query is its own row so the Sources panel shows it.
  * on top of that, a VET pass opens each new lead's own page and pulls the real
    registration link, fee, apply-by date, contact and event date out of it.

Add a source: one line in SOURCES below (name, kind, url-or-host, type, city, county, state).
Kinds: localist | engage | civic | tribe | rss | jsonld | palmcoast | search | vetted.
"""
import concurrent.futures as cf
import base64, hashlib, html, json, os, re, ssl, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, date, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/New_York")
TODAY = datetime.now(TZ).date()
HORIZON = TODAY + timedelta(days=210)
OUT = "data/opportunities.json"
SEED = "data/opportunities_seed.json"
VETTED = "data/opportunities_vetted.json"
UA = "Mozilla/5.0 (compatible; JaySteelLogistics/1.0; +https://jaysteeljewelry.github.io/jaysteel-market-logistics-app/)"
HEADERS = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"}
SEARCH_API_KEY = os.environ.get("SEARCH_API_KEY", "").strip()
SEARCH_ENGINE = os.environ.get("SEARCH_ENGINE", "").strip().lower()

BOTH = ("FL", "GA")

# name, kind, url, type, city, county, state
# name, kind, url, type, city, county, state
SOURCES = [
    # ---------- colleges & universities (Localist API) ----------
    ("UNF Events", "localist", "https://events.unf.edu", "college", "Jacksonville", "Duval", "FL"),
    ("FSCJ Events", "localist", "https://events.fscj.edu", "college", "Jacksonville", "Duval", "FL"),
    # ---------- colleges & universities (CampusLabs Engage RSS — live-verified) ----------
    ("Stetson University (Engage)", "engage", "https://stetson.campuslabs.com/engage/events.rss", "college", "DeLand", "Volusia", "FL"),
    ("University of Florida (Engage)", "engage", "https://ufl.campuslabs.com/engage/events.rss", "college", "Gainesville", "Alachua", "FL"),
    ("UCF (Engage)", "engage", "https://ucf.campuslabs.com/engage/events.rss", "college", "Orlando", "Orange", "FL"),
    ("FAU (Engage)", "engage", "https://fau.campuslabs.com/engage/events.rss", "college", "Boca Raton", "Palm Beach", "FL"),
    ("FIU (Engage)", "engage", "https://fiu.campuslabs.com/engage/events.rss", "college", "Miami", "Miami-Dade", "FL"),
    ("Miami Dade College (Engage)", "engage", "https://mdc.campuslabs.com/engage/events.rss", "college", "Miami", "Miami-Dade", "FL"),
    ("Seminole State (Engage)", "engage", "https://seminolestate.campuslabs.com/engage/events.rss", "college", "Sanford", "Seminole", "FL"),
    ("Palm Beach State (Engage)", "engage", "https://palmbeachstate.campuslabs.com/engage/events.rss", "college", "Lake Worth", "Palm Beach", "FL"),
    ("Georgia Tech (Engage)", "engage", "https://gatech.campuslabs.com/engage/events.rss", "college", "Atlanta", "Fulton", "GA"),
    ("UGA (Engage)", "engage", "https://uga.campuslabs.com/engage/events.rss", "college", "Athens", "Clarke", "GA"),
    ("Georgia State (Engage)", "engage", "https://gsu.campuslabs.com/engage/events.rss", "college", "Atlanta", "Fulton", "GA"),
    ("Kennesaw State (Engage)", "engage", "https://kennesaw.campuslabs.com/engage/events.rss", "college", "Kennesaw", "Cobb", "GA"),
    ("Georgia College (Engage)", "engage", "https://gcsu.campuslabs.com/engage/events.rss", "college", "Milledgeville", "Baldwin", "GA"),
    ("Columbus State (Engage)", "engage", "https://columbusstate.campuslabs.com/engage/events.rss", "college", "Columbus", "Muscogee", "GA"),
    ("North Georgia (Engage)", "engage", "https://ung.campuslabs.com/engage/events.rss", "college", "Dahlonega", "Lumpkin", "GA"),
    # ---------- cities & counties — Northeast Florida (CivicPlus / RSS / tribe) ----------
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
    ("City of Palm Coast", "palmcoast", "https://www.palmcoast.gov", "city", "Palm Coast", "Flagler", "FL"),
    ("Clay County (Explore Clay)", "tribe", "https://exploreclay.com", "county", "Green Cove Springs", "Clay", "FL"),
    ("Volusia County", "rss", "https://www.volusia.org/resources/eventfeed.php", "county", "DeLand", "Volusia", "FL"),
    # ---------- cities & counties — rest of Florida (live-verified) ----------
    ("City of Fort Myers", "civic", "https://www.cityftmyers.com", "city", "Fort Myers", "Lee", "FL"),
    ("City of Hollywood", "civic", "https://www.hollywoodfl.org", "city", "Hollywood", "Broward", "FL"),
    ("City of Boca Raton", "civic", "https://www.myboca.us", "city", "Boca Raton", "Palm Beach", "FL"),
    ("City of Destin", "civic", "https://www.cityofdestin.com", "city", "Destin", "Okaloosa", "FL"),
    ("City of Pensacola", "civic", "https://www.cityofpensacola.com", "city", "Pensacola", "Escambia", "FL"),
    ("City of Vero Beach", "civic", "https://www.covb.org", "city", "Vero Beach", "Indian River", "FL"),
    # ---------- cities & counties — Georgia (live-verified) ----------
    ("Athens-Clarke County", "civic", "https://www.accgov.com", "city", "Athens", "Clarke", "GA"),
    ("City of Augusta", "civic", "https://www.augustaga.gov", "city", "Augusta", "Richmond", "GA"),
    ("City of Savannah", "civic", "https://www.savannahga.gov", "city", "Savannah", "Chatham", "GA"),
    ("City of Gainesville GA", "civic", "https://www.gainesville.org", "city", "Gainesville", "Hall", "GA"),
    ("City of Lawrenceville", "civic", "https://www.lawrencevillega.org", "city", "Lawrenceville", "Gwinnett", "GA"),
    ("City of Marietta", "civic", "https://www.mariettaga.gov", "city", "Marietta", "Cobb", "GA"),
    ("City of Hinesville", "civic", "https://www.cityofhinesville.org", "city", "Hinesville", "Liberty", "GA"),
    # ---------- marketplaces (JSON-LD) ----------
    ("VendorsMap: Jacksonville", "jsonld", "https://vendorsmap.com/cities/jacksonville-fl", "market", "Jacksonville", "Duval", "FL"),
    ("VendorsMap: St. Augustine", "jsonld", "https://vendorsmap.com/cities/st-augustine", "market", "St. Augustine", "St. Johns", "FL"),
    ("VendorsMap: Orlando", "jsonld", "https://vendorsmap.com/cities/orlando-fl", "market", "Orlando", "Orange", "FL"),
    ("VendorsMap: Tampa", "jsonld", "https://vendorsmap.com/cities/tampa-fl", "market", "Tampa", "Hillsborough", "FL"),
    ("VendorsMap: Miami", "jsonld", "https://vendorsmap.com/cities/miami-fl", "market", "Miami", "Miami-Dade", "FL"),
    ("VendorsMap: Atlanta", "jsonld", "https://vendorsmap.com/cities/atlanta-ga", "market", "Atlanta", "Fulton", "GA"),
    ("VendorsMap: Savannah", "jsonld", "https://vendorsmap.com/cities/savannah-ga", "market", "Savannah", "Chatham", "GA"),
    ("VendorsMap: Athens", "jsonld", "https://vendorsmap.com/cities/athens-ga", "market", "Athens", "Clarke", "GA"),
    ("VendorsMap: Augusta", "jsonld", "https://vendorsmap.com/cities/augusta-ga", "market", "Augusta", "Richmond", "GA"),
    ("VendorsMap: Brunswick", "jsonld", "https://vendorsmap.com/cities/brunswick-ga", "market", "Brunswick", "Glynn", "GA"),
    # ---------- autonomous web search (Google via Serper when SEARCH_API_KEY is set, else Bing, else DuckDuckGo) ----------
    ("Search: FL college & campus markets", "search", "college markets", "college", "", "Jacksonville", "FL"),
    ("Search: FL tabling calls", "search", "vendor tabling", "tabling", "", "", "FL"),
    ("Search: FL community markets", "search", "community market vendor", "market", "", "", "FL"),
    ("Search: FL maker markets", "search", "maker market vendor application", "market", "", "", "FL"),
    ("Search: FL holiday markets", "search", "holiday market vendor application", "market", "", "", "FL"),
    ("Search: FL farmers markets", "search", "farmers market vendor application", "market", "", "", "FL"),
    ("Search: FL craft fairs", "search", "craft fair vendor application", "market", "", "", "FL"),
    ("Search: GA college & campus markets", "search", "college market vendor", "college", "", "", "GA"),
    ("Search: GA tabling calls", "search", "campus vendor tabling", "tabling", "", "", "GA"),
    ("Search: GA community markets", "search", "community market vendor application", "market", "", "", "GA"),
    ("Search: GA holiday markets", "search", "holiday market vendor application", "market", "", "", "GA"),
    ("Search: GA farmers markets", "search", "farmers market vendor application", "market", "", "", "GA"),
    ("Search: Jacksonville markets", "search", "Jacksonville FL market vendor application", "market", "Jacksonville", "Duval", "FL"),
    ("Search: Orlando markets", "search", "Orlando FL market vendor application", "market", "Orlando", "Orange", "FL"),
    ("Search: Tampa bay markets", "search", "Tampa FL market vendor booth application", "market", "Tampa", "Hillsborough", "FL"),
    ("Search: south Florida markets", "search", "South Florida market vendor application pop up", "market", "", "", "FL"),
    ("Search: Atlanta markets", "search", "Atlanta GA market vendor application", "market", "Atlanta", "Fulton", "GA"),
    ("Search: Savannah markets", "search", "Savannah GA market vendor application", "market", "Savannah", "Chatham", "GA"),
    ("Search: Augusta markets", "search", "Augusta GA vendor market application", "market", "Augusta", "Richmond", "GA"),
    ("Search: college market days GA", "search", "Georgia college market day vendor application", "college", "", "", "GA"),
    ("Verified by Tab (organizer pages, statewide)", "vetted", VETTED, "market", "", "", "FL"),
]

OPP = re.compile(r"\b(vendors?|market\s?(?:day|place)?s?|marketplace|bazaar|pop[- ]?ups?|flea|craft(?:s| fair| show)?|artisans?|makers?|expo|tabling|festival|fest|holiday (?:shop|market|fair|bazaar)|small business|art (?:walk|show|fair)|first friday|christmas|tree lighting|parade|night market|block party|showcase|fair)\b", re.I)
VENDOR = re.compile(r"\bvendors?\b|\bbooths?\b|\bpop[- ]?ups?\b|\bbazaar\b|\bmarket\b|\bmarketplace\b|\bflea\b|\bcraft\b|\bartisans?\b", re.I)
NOPE = re.compile(r"\b(career|job|internship|graduate school|study abroad|grad|meeting|board|commission|council|hearing|workshop|webinar|cancell?ed|postponed|orientation|info session|seminar|lecture|recital|exam|interview|science fair|health fair|benefits fair|financial aid|resume|recruit(?:ing|ment)|panel|research|deployment|professional selling|how to|ideas to|easy craft|diy|youtube|pinterest|things to make|crafts for kids|craft ideas)\b", re.I)
TABLING = re.compile(r"\btabling\b|\btable\b", re.I)
TAG = re.compile(r"<[^>]+>")
STRONG = re.compile(r"\b(vendors?|market(?:s| ?day| ?place)?|marketplace|bazaar|pop[- ]?ups?|flea|craft (?:fair|show|market)|artisans?|makers? (?:market|fair)|night market|holiday (?:market|bazaar|shop|fair)|small business|expo)\b", re.I)
SELL = re.compile(r"\bvendors?\b|\bvendor (?:booth|table|space)s?\b|\blocal (?:small )?business(?:es)?\b|\bsmall business(?:es)?\b", re.I)
# registration link hints (used by the vet pass)
REG_HINT = re.compile(r"apply|regist|booth|vendor app|sign ?-?up|ticket|reserve|join (?:us )?as|fill(?: out)? (?:an? |the )?form|get a (?:booth|spot)", re.I)
MONEY = re.compile(r"\$\s?(\d{2,4}(?:\.\d{2})?)|(\$\d+)|booth fee|vendor fee|fee(?:s)?[: ]?\s*\$", re.I)
FEE_DOLLAR = re.compile(r"\$\s?(\d{1,4}(?:[.,]\d{2})?)", re.I)
DEADLINE = re.compile(r"(?:apply|registration|apps|applications|entries|deadline|due|closes?)\b[^.\n]{0,60}?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4}|20\d\d)?|((?:0?[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/]\d{2,4})", re.I)
TITLE_SIG = re.compile(r"\b(market|marketplace|festival|fest|fair|bazaar|pop[- ]?ups?|tabling|vendor|booth|application|registration|night market|holiday market|craft (?:show|fair|market)|artisan|maker(?:s|'s)? ?market|community market)\b", re.I)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}")
JSONLD = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S)


def fetch(url, timeout=25, data=None, headers=None, tries=3):
    """Browser-like GET (or POST when data is given), 3 tries with backoff; 4xx other than 429 fail at once.
    TLS: tries a verified handshake first, then a public-read (unverified) context — some city/college sites
    serve odd cert chains and this is read-only public calendar fetching, so a strict failure would be worse."""
    last = None
    for n in range(tries):
        req = urllib.request.Request(url, data=data, headers={**HEADERS, **(headers or {})},
                                     method="POST" if data is not None else "GET")
        for verified in (True, False):
            ctx = ssl.create_default_context() if verified else ssl._create_unverified_context()
            try:
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                    return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
            except urllib.error.HTTPError as e:
                last = e
                if e.code < 500 and e.code != 429:
                    raise
                break
            except (urllib.error.URLError, OSError) as e:
                last = e
                if verified and isinstance(getattr(e, "reason", e), ssl.SSLCertVerificationError):
                    continue  # TLS trust problem on this host → retry once unverified
                break
        time.sleep(2 * (n + 1))
    raise last if last else urllib.error.URLError("fetch failed")


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", s or ""))).strip()


def keep(title, desc="", kind="city"):
    if NOPE.search(title):
        return False
    if kind == "college":
        return bool(STRONG.search(title) or SELL.search(desc or "") or re.search(r"\btabling\b", title, re.I))
    return bool(OPP.search(title) or SELL.search(desc or "") or re.search(r"\btabling\b", title, re.I))


def mk(src, title, d, url, t=None, location=None, desc=""):
    name, kind, _, typ, city, county, state = src
    if d is not None and (d < TODAY or d > HORIZON):
        return None
    full = f"{title} {desc}"
    if typ == "college" and TABLING.search(full):
        typ2 = "tabling"
    elif typ in ("city", "county") and re.search(r"\bmarket\b|\bbazaar\b|\bflea\b", title, re.I):
        typ2 = "market"
    else:
        typ2 = typ
    return {
        "id": hashlib.sha1(f"{name}|{title}|{d or ''}".encode()).hexdigest()[:12],
        "title": title[:140], "date": d.isoformat() if d else None, "time": t, "location": (location or "")[:120] or None,
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
        if x:
            x["feed"] = "engage"
            out.append(x)
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
                if not s:
                    continue
                dt = datetime.fromisoformat(s).astimezone(TZ)
                x = mk(src, title, dt.date(), e.get("localist_url") or e.get("url"), None if inst["event_instance"].get("all_day") else dt.strftime("%-I:%M %p"), e.get("location_name"), desc)
                if x:
                    x["feed"] = "localist"
                    out.append(x)
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
            if tag == "EventDates":
                dtxt = (ch.text or "").strip()
            elif tag == "EventTimes":
                ttxt = (ch.text or "").strip()
            elif tag == "Location":
                loc = clean(ch.text)
        if not dtxt:
            continue
        m = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})", dtxt)
        if not m:
            continue
        d = datetime.strptime(m.group(1), "%B %d, %Y").date()
        x = mk(src, title, d, it.findtext("link"), ttxt, loc, desc)
        if x:
            x["feed"] = "civic"
            out.append(x)
    return out


def _jsonld_events(txt):
    for blob in JSONLD.findall(txt):
        try:
            data = json.loads(blob)
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            o = stack.pop()
            if isinstance(o, dict):
                if "itemListElement" in o:
                    stack.extend(o["itemListElement"])
                if "item" in o and isinstance(o["item"], dict):
                    stack.append(o["item"])
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
        if not x:
            continue
        if e.get("offers"):
            try:
                o = e["offers"][0] if isinstance(e["offers"], list) else e["offers"]
                pr = o.get("price")
                if isinstance(pr, (int, float)) or pr == "0":
                    x["fee"] = "Free" if pr == 0 else f"${pr}"
                if o.get("url"):
                    x["registration_url"] = o["url"]
            except Exception:
                pass
        if e.get("url") and not x.get("registration_url"):
            x["registration_url"] = e["url"]
        out.append(x)
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
        if x:
            x["feed"] = "rss"
            out.append(x)
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
                if v.get("city"):
                    x["city"] = clean(v["city"])
                x["feed"] = "tribe"
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
        if not keep(title, "", src[3]):
            continue
        d = datetime.strptime(f"{m.group(3)} {m.group(4)} {m.group(5)}", "%B %d %Y").date()
        x = mk(src, title, d, src[2] + href if href.startswith("/") else href, m.group(6).lstrip("0"), None, "")
        if x:
            x["feed"] = "palmcoast"
            out.append(x)
    raw = fetch(f"{src[2]}/CityCalendar/Home/CalEvent?start={TODAY.isoformat()}&end={HORIZON.isoformat()}&_showAll=true",
                data=b'{"_showAll":true}', headers={"Accept": "application/json", "Content-Type": "application/json"})
    cal = json.loads(raw)
    while isinstance(cal, str):
        cal = json.loads(cal)
    for e in cal or []:
        title = clean(e.get("title")); desc = clean(e.get("body"))[:600]
        if (e.get("raw") or {}).get("IsCityMeeting") or (e.get("raw") or {}).get("IsCancelled"):
            continue
        if not keep(title, desc, src[3]):
            continue
        try:
            dt = datetime.fromisoformat(e["start"][:19])
        except Exception:
            continue
        x = mk(src, title, dt.date(), src[2] + (e.get("url") or "/CityCalendar"), dt.strftime("%-I:%M %p"), clean(e.get("location")), desc)
        if x:
            x["feed"] = "palmcoast"
            out.append(x)
    return out


def p_vetted(src):
    """Row for Tab's daily vetted pipeline (data/opportunities_vetted.json, merged into Find markets by the app)."""
    v = json.load(open(src[2]))
    n = sum(1 for i in (v.get("items") or []) + (v.get("ongoing") or []) if (i.get("state") or "FL") in BOTH)
    return [None] * n


def p_search(src):
    """Autonomous web search. Google (via Serper) when SEARCH_API_KEY is set or SEARCH_ENGINE=google,
    otherwise DuckDuckGo HTML. Returns leads with no date yet — the VET pass fills them in."""
    _, _, section, typ, city, county, state = src
    queries = {
        "college markets": f'"vendor" market "college" "{state or "Florida"}" application 2026',
        "vendor tabling": f'"vendor tabling" OR "booth tabling" {state or "Florida"} 2026',
        "community market vendor": f'"community market" "vendor application" {state or "Florida"}',
        "maker market vendor application": f'"maker market" "vendor application" {state or "Florida"}',
        "holiday market vendor application": f'"holiday market" "vendor application" {state or "Florida"} 2026',
        "farmers market vendor application": f'"farmers market" "vendor application" {state or "Florida"}',
        "craft fair vendor application": f'"craft fair" "vendor application" {state or "Florida"}',
        "campus vendor tabling": f'"campus" market "vendor" tabling {state or "Florida"} application',
        "college market days GA": "Georgia college \"market day\" \"vendor\" application 2026",
    }
    q = queries.get(section, section + f" {state or ''}")
    if city:
        q = f'"apply to be a vendor" OR "vendor application" {city} {state or "FL"} market'
    out = []
    try:
        for title, url, sni in search(q):
            if not url or not keep(title, sni, typ) or not search_ok(title, url, sni):
                continue
            # search-only gate: the title itself must be a market/vendor/application page, and the
            # lead must read like a real opportunity (application, booth, tabling…)
            if not TITLE_SIG.search(title):
                continue
            if not (SELL.search(sni) or re.search(r"vendor|apply|regist|booth|tabl(?:e|ing)", title + " " + url, re.I)):
                continue
            time.sleep(0.4)  # be gentle with the search engines across the small search pool
            x = {
                "id": hashlib.sha1(f"search|{url}".encode()).hexdigest()[:12],
                "title": title[:140], "date": None, "time": None, "location": None,
                "city": city or "", "county": county or "", "state": state or "",
                "type": typ, "source": src[0], "url": url, "vendorMatch": True,
                "origin": "search", "notes": (sni or "")[:200] or None,
            }
            out.append(x)
    except Exception as e:
        raise RuntimeError(f"search {section}: {type(e).__name__}: {str(e)[:120]}") 
    return out


def search(q):
    """Return [(title, url, snippet)] for a query. Order: Google (Serper) when a key exists,
    then Bing HTML, then DuckDuckGo HTML — an autonomous search with a working no-key fallback."""
    if SEARCH_API_KEY or SEARCH_ENGINE in ("serper", "google"):
        body = json.dumps({"q": q, "gl": "us", "hl": "en", "num": 20}).encode()
        j = json.loads(fetch("https://google.serper.dev/search", data=body, timeout=30,
                             headers={"Content-Type": "application/json", "X-API-KEY": SEARCH_API_KEY}))
        rows = [(clean(o.get("title")), o.get("link"), clean(o.get("snippet"))) for o in j.get("organic", []) if o.get("link")]
        if rows:
            return rows
    try:
        bing = bing_results(fetch("https://www.bing.com/search?q=" + urllib.parse.quote(q) + "&count=20&setlang=en"))
        if bing:
            return bing
    except Exception:
        pass
    try:
        txt = fetch("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(q), timeout=30)
        rows = ddg_results(txt)
        if rows:
            return rows
    except Exception:
        pass
    return []


def real_url(href):
    """Bing wraps results in /ck/a?u=<base64> redirects — unwrap to the real URL."""
    href = html.unescape(href)
    if "bing.com/ck/a" in href or "bing.com/" in href.lower():
        q = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
        u = q.get("u") or []
        if u:
            try:
                b64 = urllib.parse.unquote(u[-1])
                b64 += "=" * (-len(b64) % 4)
                return base64.b64decode(b64).decode("utf-8", "replace")
            except Exception:
                pass
    return href


def bing_results(txt):
    """Parse Bing's HTML results into [(title, url, snippet)]. Pure function — unit tested."""
    out = []
    for blk in re.findall(r"<li class=\"b_algo\".*?</li>", txt, re.S):
        hm = re.search(r"<h2[^>]*><a[^>]+href=\"([^\"]+)\"[^>]*>(.*?)</a></h2>", blk, re.S)
        if not hm:
            continue
        title = clean(hm.group(2))
        if not title:
            continue
        url = real_url(hm.group(1).strip())
        if not url.startswith(("http://", "https://")):
            continue
        sni = ""
        sm = re.search(r"<p[^>]*>(.*?)</p>", blk, re.S)
        if sm:
            sni = clean(re.sub(r"<[^>]+>", " ", sm.group(1)))
        out.append((title, url, sni[:220]))
    return out[:20]


def ddg_results(txt):
    """Parse DuckDuckGo's HTML result page into [(title, url, snippet)]. Pure function — unit tested."""
    out = []
    for m in re.finditer(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</a>', txt, re.S):
        href, title, sni = m.group(1), clean(m.group(2)), clean(m.group(3))
        if href.startswith("//"):
            href = "https:" + href
        if "uddg=" in href:  # DuckDuckGo /l/?uddg= redirects point at the real URL
            href = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("uddg", [href])[0]
        out.append((title, href.strip(), sni[:220]))
    return out[:20]


def name_key(s):
    return re.sub(r"\b(the|a|an)\b", " ", re.sub(r"[^a-z0-9]+", " ", (s or "").lower())).strip()


def search_ok(title, url, sni):
    """Quality gate for web-search leads: no definition/dictionary spam, no junk hosts,
    US-friendly TLDs, no heavy foreign-language pages."""
    if len(name_key(title)) < 8:
        return False
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return False
    if re.search(r"(youtube|pinterest|instagram|tiktok|wikihow|twitch|reddit|quora|facebook\.com/share|britannica)", host):
        return False
    if host.rstrip(".").rsplit(".", 1)[-1] not in ("com", "org", "gov", "edu", "net", "us", "co", "io"):
        return False
    hay = title + " " + (sni or "")
    if re.search(r"\b(what is|definition|meaning|explained|types of|vs\.?)\b", hay, re.I):
        return False
    if len(re.findall(r"[à-ÿ]", hay)) > 2:  # strong foreign-language signal (á á ñ ü …)
        return False
    return True


def _abs(url, base):
    if not url:
        return None
    return urllib.parse.urljoin(base, url) if url.startswith(("/", "?")) else url


def vet_one(it):
    """Fetch a lead's organizer page and pull the real facts: date, registration link, fee, deadline, contact."""
    url = (it.get("url") or "").strip()
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        txt = fetch(url, timeout=22)
    except Exception:
        return None
    return vet_parse(txt, url, it)


def vet_parse(txt, url, it):
    """Extract facts from a lead's page HTML. Pure-ish function — unit tested with fixtures."""
    upd = {}
    # schema.org Event via JSON-LD
    for e in _jsonld_events(txt):
        title = clean(e.get("name") or "")
        if not title or not (VENDOR.search(title) or SELL.search(txt[:4000])):
            continue
        try:
            d = datetime.fromisoformat(e["startDate"][:10]).date()
        except Exception:
            d = None
        if d and TODAY <= d <= HORIZON:
            upd["date"] = d.isoformat()
            upd["t"] = (e.get("startDate") or "")[11:16] or None
        if e.get("location"):
            loc = e.get("location")
            if isinstance(loc, dict):
                name = loc.get("name")
                a = loc.get("address") or {}
                if isinstance(a, dict) and (a.get("addressLocality") or a.get("addressRegion")):
                    upd["city"] = a.get("addressLocality") or it.get("city")
                    upd["state"] = a.get("addressRegion") or it.get("state")
                if name:
                    upd["location"] = clean(name)
        offers = e.get("offers")
        try:
            o = offers[0] if isinstance(offers, list) and offers else (offers if isinstance(offers, dict) else None)
            if o:
                pr = o.get("price")
                if isinstance(pr, (int, float)) or pr == "0":
                    upd["fee"] = "Free" if pr == 0 else f"${pr}"
                if o.get("url"):
                    upd.setdefault("registration_url", _abs(o["url"], url))
        except Exception:
            pass
        if e.get("url"):
            upd.setdefault("registration_url", e.get("url"))
        break
    # meta + body fallbacks
    if "date" not in upd:
        m = re.search(r'property="(?:startDate|article:published_time)"[^>]*content="(\d{4}-\d{2}-\d{2})', txt) or \
            re.search(r'"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"', txt)
        if m:
            try:
                d = datetime.fromisoformat(m.group(1)[:10]).date()
            except Exception:
                d = None
            if d and TODAY <= d <= HORIZON:
                upd["date"] = d.isoformat()
    if "registration_url" not in upd:
        for m in re.finditer(r"<a[^>]+href=\"([^\"]+)\"[^>]*>(.*?)</a>|<a[^>]+href='([^']+)'[^>]*>(.*?)</a>", txt, re.I | re.S):
            href = (m.group(1) or m.group(3) or "").strip()
            label = clean(m.group(2) or m.group(4) or "")
            if REG_HINT.search(label + " " + href) and not re.search(r"\.(png|jpe?g|css|js)(\?|$)", href, re.I):
                upd["registration_url"] = _abs(href, url)
                break
    if "fee" not in upd:
        m = FEE_DOLLAR.search(txt[:6000])
        if m:
            upd["fee"] = "$" + m.group(1)
        elif re.search(r"\bfree\b", txt[:6000], re.I):
            upd["fee"] = "Free"
    if not upd.get("deadline"):
        m = DEADLINE.search(txt[:9000])
        if m:
            if m.group(1):
                try:
                    dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3) or TODAY.year}", "%b %d %Y").date()
                except Exception:
                    dt = None
                if dt:
                    upd["deadline"] = dt.isoformat()
            elif m.group(4):
                try:
                    dt = datetime.strptime(m.group(4), "%m/%d/%Y").date()
                except Exception:
                    dt = None
                if dt:
                    upd["deadline"] = dt.isoformat()
    if "email" not in upd:
        m = EMAIL.search(txt[:4000])
        if m and not m.group(0).lower().endswith((".png", ".jpg", ".gif")):
            upd["email"] = m.group(0)
    if "phone" not in upd:
        m = PHONE.search(txt[:4000])
        if m:
            upd["phone"] = m.group(0).strip()
    if any(k in upd for k in ("date", "registration_url", "fee", "deadline", "email", "phone")):
        upd["verified"] = True
        upd["verifiedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    return upd


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

    # run every source on its own. CivicPlus sites share one throttled host and the web-search
    # engines rate-limit, so those pools stay small; everything else runs at higher concurrency.
    civic = [s for s in SOURCES if s[1] == "civic"]
    search_src = [s for s in SOURCES if s[1] == "search"]
    other = [s for s in SOURCES if s[1] not in ("civic", "search")]
    with cf.ThreadPoolExecutor(10) as ex, cf.ThreadPoolExecutor(3) as exc, cf.ThreadPoolExecutor(2) as exs:
        futs = [ex.submit(run, s) for s in other] + [exc.submit(run, s) for s in civic] + [exs.submit(run, s) for s in search_src]
        results = {r[0][0]: r for r in (f.result() for f in futs)}

    report, raw = [], []
    for s in SOURCES:
        src, got, err = results[s[0]]
        row = {"source": src[0], "type": src[3], "state": src[6], "county": src[5], "url": src[2],
               "ok": err is None, "items": len(got), "error": err}
        if err is None:
            row["lastOk"] = now_utc.strftime("%Y-%m-%dT%H:%MZ")
        else:
            # last-good fallback: keep a site's last good read for up to 3 days instead of a red X
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
        raw.extend(x for x in got if x)

    # dedupe: same url OR same normalized title+date
    seen, uniq = set(), []
    for it in sorted(raw, key=lambda x: (x.get("date") or "z", x["title"])):
        k = it.get("url") and ("u|" + it["url"].rstrip("/"))
        if not k:
            k = ("n|" + name_key(it["title"])) + ("|" + (it.get("date") or ""))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(it)

    # ---- AUTONOMOUS VET: open each new-ish lead's own page, extract facts ----
    vetted_now = 0
    now_s = now_utc.strftime("%Y-%m-%dT%H:%MZ")
    vet_targets = [it for it in uniq if it.get("url") and it.get("origin") in ("search", None)
                   and (datetime.strptime(it["verifiedAt"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc) < now_utc - timedelta(days=14)
                        if it.get("verifiedAt") else True)][:45]
    with cf.ThreadPoolExecutor(6) as ex:
        futs_v = {ex.submit(vet_one, it): it for it in vet_targets}
        for f in cf.as_completed(futs_v):
            it = futs_v[f]
            try:
                upd = f.result()
            except Exception:
                upd = None
            if not upd:
                continue
            for k, v in upd.items():
                it[k] = v
            it["verifiedAt"] = it.get("verifiedAt") or now_s
            it.setdefault("firstSeen", now_s)
            vetted_now += 1

    now = TODAY.isoformat()
    uniq_out, ongoing = [], []
    for it in uniq:
        it["firstSeen"] = prev.get(it["id"]) or it.get("firstSeen") or now
        if it.get("date"):
            uniq_out.append(it)
        else:
            ongoing.append(it)
    for it in seed.get("items", []):
        if (it.get("state") or "FL") not in BOTH:
            continue
        if it.get("date") and it["date"] < now:
            if str(it.get("id", "")).startswith(("fl6-", "ga-")) and (it.get("end_date") or it["date"]) < now:
                continue
            it = dict(it); it.pop("date")
        it["firstSeen"] = prev.get(it["id"]) or it.get("firstSeen") or now
        (uniq_out if it.get("date") else ongoing).append(it)

    uniq_out.sort(key=lambda x: (x["date"], x["title"]))
    seen2, uniq_final = set(), []
    for it in uniq_out:
        k = (name_key(it["title"]), it["date"])
        if k in seen2:
            continue
        seen2.add(k)
        uniq_final.append(it)
    new_ids = [it["id"] for it in uniq_final if it["firstSeen"] == now and it["id"] not in prev and it.get("origin") != "seed"]

    out = {
        "updated": now_s,
        "refresh": "every 6 hours (GitHub Actions), not live",
        "coverage": "Florida + Georgia statewide (colleges, cities, counties, marketplaces, web search)",
        "sources": report, "items": uniq_final, "ongoing": ongoing, "newThisRun": new_ids,
        "vettedThisRun": vetted_now,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    ok = sum(1 for r in report if r["ok"] and r["items"])
    print(f"{len(uniq_final)} dated + {len(ongoing)} ongoing items; {ok}/{len(report)} sources returned data; "
          f"{len(new_ids)} new; {vetted_now} vetted this run")
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
        reg = " · [apply](" + it["registration_url"] + ")" if it.get("registration_url") else ""
        lines.append(f"• **{d}** — [{it['title'][:80]}]({it['url']}){reg} · {it['city']}, {it['state']}")
    body = {"username": "JAY STEEL Logistics", "allowed_mentions": {"parse": []},
            "embeds": [{"title": f"🔎 {len(new)} new vendor opportunit{'y' if len(new) == 1 else 'ies'}", "url": app,
                        "color": 0xC9CED6, "description": "\n".join(lines)[:4000],
                        "footer": {"text": "Found by the Opportunities scan · search + vetted · every 6 h · tap the title to apply"}}]}
    req = urllib.request.Request(hook.split("?")[0], data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "User-Agent": UA})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        print(f"Posted {len(new)} new items to Discord")
    except Exception as e:
        print("Discord post failed:", e)


PARSERS = {"engage": p_engage, "localist": p_localist, "civic": p_civic, "eventbrite": p_jsonld, "jsonld": p_jsonld,
           "rss": p_rss, "tribe": p_tribe, "palmcoast": p_palmcoast, "search": p_search, "vetted": p_vetted}

if __name__ == "__main__":
    had_previous = os.path.exists(OUT)
    main()
    try:
        post_discord(json.load(open(OUT)), had_previous)
    except Exception as e:
        print("Discord step skipped:", e)
