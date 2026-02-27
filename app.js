// --- Global state ---
let allEvents = [];
let filteredEvents = [];
let selectedRouteEventIds = new Set();
let map;
let markers = [];

// --- Utility: parse ISO date safely ---
function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// --- Initialize map (Leaflet) ---
function initMap() {
  // Center roughly between North FL and GA
  map = L.map("map").setView([30.5, -82.0], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

// --- Render markers based on filteredEvents ---
function renderMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  filteredEvents.forEach(evt => {
    if (!evt.latitude || !evt.longitude) return;

    const marker = L.marker([evt.latitude, evt.longitude]).addTo(map);
    marker.bindPopup(`
      <strong>${evt.name}</strong><br/>
      ${evt.venue}<br/>
      ${evt.city}, ${evt.state}<br/>
      ${formatDate(evt.start)} – ${formatTime(evt.start)}
    `);
    markers.push(marker);
  });

  if (filteredEvents.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.3));
  }
}

// --- Render event list cards ---
function renderEventList() {
  const container = document.getElementById("eventList");
  container.innerHTML = "";

  if (filteredEvents.length === 0) {
    container.innerHTML = "<p>No events match your filters.</p>";
    return;
  }

  filteredEvents
    .slice()
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .forEach(evt => {
      const card = document.createElement("div");
      card.className = "event-card";

      const header = document.createElement("div");
      header.className = "event-card-header";

      const title = document.createElement("div");
      title.className = "event-title";
      title.textContent = evt.name;
      header.appendChild(title);

      const badges = document.createElement("div");
      badges.className = "badges";

      const typeBadge = document.createElement("span");
      typeBadge.className = `badge badge-type-${evt.type}`;
      typeBadge.textContent = typeLabel(evt.type);
      badges.appendChild(typeBadge);

      const statusBadge = document.createElement("span");
      statusBadge.className = "badge badge-status";
      statusBadge.textContent = capitalize(evt.status);
      badges.appendChild(statusBadge);

      header.appendChild(badges);
      card.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "event-meta";
      meta.innerHTML = `
        <small>${evt.venue}</small>
        <small>${evt.address || ""} ${evt.city}, ${evt.state}</small>
        <small>${formatDate(evt.start)} &middot; ${formatTime(evt.start)}–${formatTime(evt.end)}</small>
        ${evt.feeDescription ? `<small>Fee: ${evt.feeDescription}</small>` : ""}
      `;
      card.appendChild(meta);

      if (evt.notes) {
        const notesEl = document.createElement("div");
        notesEl.className = "event-notes";
        notesEl.innerHTML = `<small>${evt.notes}</small>`;
        card.appendChild(notesEl);
      }

      const actions = document.createElement("div");
      actions.className = "event-actions";

      // Calendar button (ICS download)
      const calBtn = document.createElement("button");
      calBtn.className = "btn-calendar";
      calBtn.textContent = "Add to calendar (.ics)";
      calBtn.addEventListener("click", () => downloadICS(evt));
      actions.appendChild(calBtn);

      // Email button (mailto)
      if (evt.organizerEmail && evt.organizerEmail.trim() !== "") {
        const emailBtn = document.createElement("button");
        emailBtn.className = "btn-email";
        emailBtn.textContent = "Email to apply";
        emailBtn.addEventListener("click", () => openMailto(evt));
        actions.appendChild(emailBtn);
      }

      // Route button
      const routeBtn = document.createElement("button");
      routeBtn.className = "btn-route";
      routeBtn.textContent = selectedRouteEventIds.has(evt.id)
        ? "In route (click to remove)"
        : "Add to route";
      routeBtn.addEventListener("click", () => toggleRoute(evt.id));
      actions.appendChild(routeBtn);

      // Apply link
      if (evt.applicationURL) {
        const applyLink = document.createElement("a");
        applyLink.className = "btn-apply";
        applyLink.textContent = "Open application page";
        applyLink.href = evt.applicationURL;
        applyLink.target = "_blank";
        applyLink.rel = "noopener noreferrer";
        actions.appendChild(applyLink);
      }

      card.appendChild(actions);
      container.appendChild(card);
    });
}

// --- Filters ---
function applyFilters() {
  const state = document.getElementById("stateFilter").value;
  const type = document.getElementById("typeFilter").value;
  const status = document.getElementById("statusFilter").value;
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const startFilter = parseDate(document.getElementById("startDateFilter").value);
  const endFilter = parseDate(document.getElementById("endDateFilter").value);

  filteredEvents = allEvents.filter(evt => {
    if (state && evt.state !== state) return false;
    if (type && evt.type !== type) return false;
    if (status && evt.status !== status) return false;
    if (startFilter && evt.start && evt.start < startFilter) return false;
    if (endFilter && evt.start && evt.start > endFilter) return false;

    if (search) {
      const haystack = [
        evt.name,
        evt.venue,
        evt.city,
        evt.state,
        evt.notes || ""
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  renderEventList();
  renderMarkers();
}

function clearFilters() {
  document.getElementById("stateFilter").value = "";
  document.getElementById("typeFilter").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("startDateFilter").value = "";
  document.getElementById("endDateFilter").value = "";
  applyFilters();
}

// --- ICS generation (client-side) ---
function downloadICS(evt) {
  // Minimal, valid iCalendar content.[web:55][web:51][web:105]
  const dtstamp = toICSDate(new Date());
  const dtstart = toICSDate(evt.start);
  const dtend = toICSDate(evt.end || evt.start);
  const uid = `${evt.id}@jaysteel-logistics`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jay Steel//Market Logistics Planner//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICS(evt.name)}`,
    `LOCATION:${escapeICS(
      `${evt.venue}, ${evt.address || ""} ${evt.city}, ${evt.state}`
    )}`,
    `DESCRIPTION:${escapeICS(buildDescription(evt))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(evt.name)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toICSDate(date) {
  if (!date) return "";
  const pad = n => String(n).padStart(2, "0");
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  // UTC timestamp.[web:55]
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function escapeICS(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildDescription(evt) {
  let desc = `Vendor event: ${evt.name}\\nVenue: ${evt.venue}\\nLocation: ${evt.address || ""} ${evt.city}, ${evt.state}`;
  if (evt.feeDescription) {
    desc += `\\nFee: ${evt.feeDescription}`;
  }
  if (evt.applicationURL) {
    desc += `\\nApplication: ${evt.applicationURL}`;
  }
  if (evt.notes) {
    desc += `\\nNotes: ${evt.notes}`;
  }
  return desc;
}

// --- Email (mailto with pre-filled subject/body) ---
function openMailto(evt) {
  if (!evt.organizerEmail) return;

  const subject = `Vendor Application – ${evt.name} – Jay Steel Jewelry`;
  const body = `
Hello,

I’d like to apply as a vendor for ${evt.name} at ${evt.venue} in ${evt.city}, ${evt.state}.

Business: Jay Steel Jewelry
Products: Stainless steel, gold-filled, sterling silver jewelry, student-friendly price points.

Could you please share:
• Vendor fee and what’s included
• Table size and whether power is available
• Estimated attendance and typical audience
• Any licensing or insurance requirements

Thank you,
[Your Name]
Jay Steel Jewelry
`;

  // Encode subject and body per mailto rules.[web:60][web:106]
  const params = new URLSearchParams({
    subject,
    body
  });
  const url = `mailto:${encodeURIComponent(evt.organizerEmail)}?${params.toString()}`;
  window.location.href = url;
}

// --- Route planning (Google Maps multi-stop) ---
function toggleRoute(eventId) {
  if (selectedRouteEventIds.has(eventId)) {
    selectedRouteEventIds.delete(eventId);
  } else {
    selectedRouteEventIds.add(eventId);
  }
  renderEventList();
}

function openRouteInGoogleMaps() {
  const events = allEvents.filter(e => selectedRouteEventIds.has(e.id));
  if (events.length === 0) {
    alert("Add at least one event to the route first.");
    return;
  }

  // Build a multi-stop directions URL.[web:95][web:101]
  const base = "https://www.google.com/maps/dir/";
  const parts = events.map(evt =>
    encodeURIComponent(`${evt.venue} ${evt.address || ""} ${evt.city} ${evt.state}`)
  );
  const url = base + parts.join("/");
  window.open(url, "_blank", "noopener");
}

// --- Helpers ---
function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function typeLabel(type) {
  switch (type) {
    case "campus":
      return "Campus";
    case "farmersMarket":
      return "Farmers market";
    case "craftFair":
      return "Craft fair";
    case "festival":
      return "Festival";
    default:
      return type;
  }
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

// --- Load events & initialize ---
async function loadEvents() {
  const res = await fetch("events.json");
  const data = await res.json();

  allEvents = data.map(evt => ({
    ...evt,
    start: parseDate(evt.start),
    end: parseDate(evt.end)
  }));
  filteredEvents = allEvents.slice();
}

function initFilters() {
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("stateFilter").addEventListener("change", applyFilters);
  document.getElementById("typeFilter").addEventListener("change", applyFilters);
  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("startDateFilter").addEventListener("change", applyFilters);
  document.getElementById("endDateFilter").addEventListener("change", applyFilters);

  document.getElementById("clearFiltersBtn").addEventListener("click", clearFilters);
  document.getElementById("openRouteBtn").addEventListener("click", openRouteInGoogleMaps);
}

window.addEventListener("DOMContentLoaded", async () => {
  initMap();
  initFilters();
  await loadEvents();
  applyFilters();
});
