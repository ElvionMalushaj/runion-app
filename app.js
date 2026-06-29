const STORAGE_KEY = "runion:runs";
const THEME_KEY = "runion:theme";
const MIN_ACCURACY_METERS = 80;
const MIN_POINT_DISTANCE_METERS = 4;

const sampleRuns = [
  { id: "r-101", title: "Morning Run", date: "2026-06-29T06:52:00.000Z", distanceMeters: 8200, durationSeconds: 2490, elevation: 44, calories: 548, avgHr: 151, route: "Tiergarten Loop" },
  { id: "r-100", title: "Intervalle", date: "2026-06-27T17:24:00.000Z", distanceMeters: 6400, durationSeconds: 2040, elevation: 22, calories: 426, avgHr: 164, route: "Kanal Sprint" },
  { id: "r-099", title: "Long Run", date: "2026-06-23T08:18:00.000Z", distanceMeters: 16400, durationSeconds: 5580, elevation: 118, calories: 1102, avgHr: 147, route: "Grunewald" },
];

const plans = [
  { name: "5K", goal: "Sub 25", weeks: 6, progress: 64, next: "Easy run, 35 min", type: "Base" },
  { name: "10 km", goal: "Sub 52", weeks: 10, progress: 38, next: "4 x 1 km @ 5:00", type: "Tempo" },
  { name: "Half Marathon", goal: "1:55 h", weeks: 14, progress: 22, next: "Long run 14 km", type: "Endurance" },
  { name: "Marathon", goal: "Strong finish", weeks: 18, progress: 12, next: "Recovery run", type: "Adaptive AI" },
];

const community = [
  { name: "Noah", run: "12,4 km", kudos: 42, comment: "Negative Split im Park" },
  { name: "Mira", run: "8.1 km", kudos: 31, comment: "New 5K personal best" },
  { name: "Sam", run: "21.1 km", kudos: 66, comment: "Half marathon test complete" },
];

const state = {
  route: "home",
  mode: "idle",
  watchId: null,
  points: [],
  distanceMeters: 0,
  startedAt: null,
  elapsedBeforePause: 0,
  timerId: null,
  signal: "Ready",
  signalType: "idle",
};

const screen = document.querySelector("#screen");
const screenTitle = document.querySelector("#screenTitle");
const greeting = document.querySelector("#greeting");
const themeToggle = document.querySelector("#themeToggle");

const titles = {
  home: "Home",
  activities: "Activities",
  record: "Run Tracking",
  plans: "Training Plans",
  community: "Community",
  profile: "Profile",
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => setSignal("Offline-Cache fehlt", "warn"));
  });
}

document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "dark";
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
});

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) navigate(routeButton.dataset.route);

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "start") startRun();
  if (action === "pause") pauseRun();
  if (action === "stop") stopRun();
  if (action === "mock") addMockPoint();
  if (action === "clear") clearRuns();
});

function navigate(route) {
  state.route = route;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route);
  });
  render();
}

function render() {
  screenTitle.textContent = titles[state.route];
  greeting.textContent = getGreeting();
  const views = { home: homeView, activities: activitiesView, record: recordView, plans: plansView, community: communityView, profile: profileView };
  screen.innerHTML = views[state.route]();
  if (state.route === "record") {
    drawRoute();
    updateRecordStats();
  }
  if (state.route === "activities") drawStatsChart();
}

function getGreeting() {
  const hour = new Date().getHours();
  const dayPart = hour < 11 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${dayPart}, Lena`;
}

function homeView() {
  const runs = getRuns();
  const today = runs[0];
  const weekKm = getWeekKm(runs);
  return `
    <article class="hero-card">
      <div class="brand-line">
        <div>
          <p class="eyebrow">Today</p>
          <h2>${today ? today.title : "Ready for the first run"}</h2>
        </div>
        <span class="pill"><span class="signal-dot active"></span>${Math.round(weekKm)} km this week</span>
      </div>
      <div class="hero-stats">
        <div class="metric-card large"><small>Activity</small><strong>${today ? formatDistance(today.distanceMeters) : "0.0"}</strong><small>km today</small></div>
        <div class="metric-card"><small>Streak</small><strong>9</strong><small>days</small></div>
        <div class="metric-card"><small>Load</small><strong>72</strong><small>optimal</small></div>
        <div class="metric-card"><small>VO2max</small><strong>49</strong><small>ml/kg/min</small></div>
        <div class="metric-card"><small>Recovery</small><strong>83%</strong><small>ready</small></div>
      </div>
    </article>
    <div class="quick-actions">
      <button class="primary-button" type="button" data-route="record">Quick Start</button>
      <button class="ghost-button" type="button" data-route="plans">View Plan</button>
    </div>
    ${weatherCard()}
    ${coachCard()}
    ${activityList(runs.slice(0, 3), "Recent Activities")}
    ${challengeStrip()}
  `;
}

function recordView() {
  return `
    <section class="run-grid" aria-label="Run metrics">
      <article class="metric-card large"><small>Distance</small><strong id="distance">0.00</strong><small>km</small></article>
      <article class="metric-card"><small>Time</small><strong id="duration">00:00</strong><small>h:mm:ss</small></article>
      <article class="metric-card"><small>Pace</small><strong id="pace">--:--</strong><small>min/km</small></article>
      <article class="metric-card"><small>Avg Pace</small><strong id="avgPace">--:--</strong><small>min/km</small></article>
      <article class="metric-card"><small>Calories</small><strong id="calories">0</strong><small>kcal</small></article>
      <article class="metric-card"><small>Heart</small><strong id="heartRate">--</strong><small>bpm</small></article>
    </section>
    <section class="run-map" aria-label="Live-Route">
      <canvas id="routeCanvas" width="720" height="460"></canvas>
      <div class="map-empty" id="routeEmpty">The GPS route appears when the run starts.</div>
    </section>
    <div class="quick-actions">
      <button class="primary-button" type="button" data-action="start" ${state.mode === "running" ? "disabled" : ""}>${state.mode === "paused" ? "Resume" : "Start"}</button>
      <button class="ghost-button" type="button" data-action="pause" ${state.mode !== "running" ? "disabled" : ""}>Pause</button>
      <button class="danger-button" type="button" data-action="stop" ${state.mode === "idle" ? "disabled" : ""}>Save</button>
    </div>
    <div class="quick-actions">
      <button class="ghost-button" type="button" data-action="mock">Test Point</button>
      <button class="ghost-button" type="button" data-action="clear">Clear History</button>
    </div>
    <article class="card">
      <div class="card-header"><h2>Live-Features</h2><span class="pill"><span class="signal-dot ${state.signalType === "active" ? "active" : state.signalType === "warn" ? "warn" : ""}"></span>${state.signal}</span></div>
      <ul class="mini-list">
        <li><strong>Auto-Pause</strong><span>unter 2 km/h</span></li>
        <li><strong>Voice prompts</strong><span>every kilometer</span></li>
        <li><strong>Wearables</strong><span>Apple Health, Health Connect, Garmin, Polar</span></li>
      </ul>
    </article>
  `;
}

function activitiesView() {
  const runs = getRuns();
  return `
    <div class="tabs" aria-label="Time range"><button class="tab active">Week</button><button class="tab">Month</button><button class="tab">Year</button><button class="tab">All Time</button></div>
    <section class="grid-2">
      <article class="metric-card"><small>Total Distance</small><strong>${formatDistance(sum(runs, "distanceMeters"))}</strong><small>km</small></article>
      <article class="metric-card"><small>Run Time</small><strong>${formatHours(sum(runs, "durationSeconds"))}</strong><small>hours</small></article>
      <article class="metric-card"><small>Avg Pace</small><strong>${formatPace(sum(runs, "distanceMeters"), sum(runs, "durationSeconds"))}</strong><small>min/km</small></article>
      <article class="metric-card"><small>5K PR</small><strong>24:36</strong><small>personal best</small></article>
    </section>
    <article class="card"><div class="card-header"><h2>Fitness Trend</h2><span class="muted">6 weeks</span></div><canvas class="chart" id="statsChart" width="680" height="220"></canvas></article>
    <article class="card"><div class="card-header"><h2>Route Heatmap</h2><span class="muted">Berlin</span></div><div class="heatmap">${heatCells()}</div></article>
    ${activityList(runs, "Run History")}
  `;
}

function plansView() {
  return `
    <div class="tabs"><button class="tab active">Adaptive</button><button class="tab">5 km</button><button class="tab">10 km</button><button class="tab">HM</button><button class="tab">Marathon</button></div>
    ${plans.map((plan) => `
      <article class="plan-card">
        <div class="card-header"><div><p class="card-kicker">${plan.type}</p><h2>${plan.name} - ${plan.goal}</h2></div><span class="pill">${plan.weeks} weeks</span></div>
        <div class="progress" aria-label="${plan.progress} percent complete"><span style="width:${plan.progress}%"></span></div>
        <div class="plan-meta">${plan.progress}% complete - Next workout: ${plan.next}</div>
      </article>
    `).join("")}
    <article class="card"><div class="card-header"><h2>Calendar</h2><span class="muted">July 2026</span></div><div class="calendar">${calendarDays()}</div></article>
  `;
}

function communityView() {
  return `
    <section class="grid-2">
      <article class="challenge-card"><p class="card-kicker">Challenge</p><h2>120 km in July</h2><div class="progress"><span style="width:58%"></span></div><p class="muted">69.6 km complete</p></article>
      <article class="challenge-card"><p class="card-kicker">Level</p><h2>Level 18</h2><div class="badge-row"><span class="badge">5K</span><span class="badge">10K</span><span class="badge">HM</span></div></article>
    </section>
    <article class="card"><div class="card-header"><h2>Friends</h2><button class="ghost-button" type="button">Add</button></div><ul class="leader-list">${community.map((item, index) => `<li class="leader-row"><div><strong>${index + 1}. ${item.name}</strong><br><span>${item.comment}</span></div><div class="activity-metrics"><span class="tag">${item.run}</span><span class="tag">${item.kudos} Likes</span></div></li>`).join("")}</ul></article>
    <article class="card"><div class="card-header"><h2>Groups</h2><span class="muted">3 active</span></div><ul class="mini-list"><li><strong>Berlin Runners</strong><span>1,284 members</span></li><li><strong>Sub 50 Club</strong><span>Leaderboard live</span></li><li><strong>Lunch Break Crew</strong><span>Shared challenge</span></li></ul></article>
  `;
}

function profileView() {
  return `
    <section class="profile-panel">
      <div class="profile-head"><div class="profile-avatar">LM</div><div><p class="card-kicker">Lena Mueller</p><h2>1,248 km - 86 runs</h2><p class="muted">Berlin - Privacy: private by default</p></div></div>
    </section>
    <section class="grid-3"><article class="metric-card"><small>5 km</small><strong>24:36</strong></article><article class="metric-card"><small>10 km</small><strong>51:12</strong></article><article class="metric-card"><small>HM</small><strong>1:56</strong></article></section>
    <article class="card"><div class="card-header"><h2>Health</h2><span class="muted">Health Connect</span></div><div class="health-grid"><div class="zone"><small>Sleep</small><strong class="stat-value">7:42</strong></div><div class="zone"><small>HRV</small><strong class="stat-value">62</strong></div><div class="zone"><small>Load</small><strong class="stat-value">84</strong></div></div></article>
    <article class="card"><div class="card-header"><h2>Achievements</h2><span class="muted">12 badges</span></div><div class="badge-row"><span class="badge">PR</span><span class="badge">30</span><span class="badge">VO2</span><span class="badge">AI</span></div></article>
    <article class="card"><div class="card-header"><h2>Settings</h2><span class="muted">GDPR</span></div><div class="privacy-row"><strong>Data export</strong><span class="tag">GPX/FIT/JSON</span></div><div class="privacy-row"><strong>Cloud sync</strong><span class="tag">End-to-end planned</span></div></article>
  `;
}

function weatherCard() {
  return `<article class="card"><div class="card-header"><h2>Weather</h2><span class="pill">18 C - Wind 12 km/h</span></div><div class="weather-row"><strong>Light rain possible</strong><span class="tag">Jacket + cap</span></div></article>`;
}

function coachCard() {
  return `<article class="coach-card"><div class="card-header"><div><p class="card-kicker">AI Coach</p><h2>Keep it easy today</h2></div><span class="pill">Low risk</span></div><p class="muted">Your last run was strong, but training load is rising. Recommendation: 35 minutes in Zone 2, then mobility. 10K prediction: 50:48.</p></article>`;
}

function challengeStrip() {
  return `<section class="grid-2"><article class="challenge-card"><p class="card-kicker">Monthly</p><h2>Green July</h2><div class="progress"><span style="width:58%"></span></div></article><article class="challenge-card"><p class="card-kicker">Reward</p><h2>Carbon Badge</h2><div class="badge-row"><span class="badge">18</span><span class="badge">S</span></div></article></section>`;
}

function activityList(runs, title) {
  return `<article class="card"><div class="card-header"><h2>${title}</h2><span class="muted">${runs.length} runs</span></div><ul class="activity-list">${runs.map((run) => `<li class="activity-row"><div class="activity-main"><strong>${run.title}</strong><span>${formatDate(run.date)} - ${run.route || "Live Route"}</span></div><div class="activity-metrics"><span class="tag">${formatDistance(run.distanceMeters)} km</span><span class="tag">${formatPace(run.distanceMeters, run.durationSeconds)} /km</span><span class="tag">${run.avgHr || 148} bpm</span></div></li>`).join("")}</ul></article>`;
}

function startRun() {
  if (state.mode === "idle") {
    state.points = [];
    state.distanceMeters = 0;
    state.elapsedBeforePause = 0;
  }
  state.startedAt = Date.now();
  clearInterval(state.timerId);
  state.timerId = setInterval(updateRecordStats, 1000);
  setSignal("Finding GPS", "active");
  state.mode = "running";
  startWatching();
  render();
}

function pauseRun() {
  if (!state.startedAt) return;
  state.elapsedBeforePause += Date.now() - state.startedAt;
  state.startedAt = null;
  clearInterval(state.timerId);
  stopWatching();
  setSignal("Paused", "idle");
  state.mode = "paused";
  render();
}

function stopRun() {
  const elapsed = currentElapsedSeconds();
  const run = {
    id: crypto.randomUUID(),
    title: "Live Run",
    date: new Date().toISOString(),
    distanceMeters: state.distanceMeters,
    durationSeconds: elapsed,
    elevation: Math.round(state.distanceMeters * 0.006),
    calories: Math.round(state.distanceMeters * 0.066),
    avgHr: 146 + Math.round(Math.random() * 18),
    route: "GPS-Aufzeichnung",
    points: state.points,
  };
  const runs = [run, ...loadStoredRuns()].slice(0, 40);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  clearInterval(state.timerId);
  stopWatching();
  state.mode = "idle";
  state.startedAt = null;
  state.elapsedBeforePause = 0;
  state.distanceMeters = 0;
  state.points = [];
  setSignal("Saved", "idle");
  navigate("activities");
}

function startWatching() {
  if (!navigator.geolocation) {
    setSignal("Kein GPS", "warn");
    return;
  }
  state.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 12000,
  });
}

function stopWatching() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

function onPosition(position) {
  const { latitude, longitude, accuracy, altitude } = position.coords;
  if (accuracy > MIN_ACCURACY_METERS) {
    setSignal(`Low accuracy ${Math.round(accuracy)} m`, "warn");
    return;
  }
  setSignal(`GPS ${Math.round(accuracy)} m`, "active");
  addPoint({ lat: latitude, lng: longitude, altitude, accuracy, timestamp: position.timestamp });
}

function onPositionError(error) {
  const messages = { 1: "Location blocked", 2: "GPS unavailable", 3: "GPS timed out" };
  setSignal(messages[error.code] || "GPS-Fehler", "warn");
}

function addPoint(point) {
  const last = state.points.at(-1);
  if (last) {
    const segment = haversineDistance(last, point);
    if (segment < MIN_POINT_DISTANCE_METERS) return;
    state.distanceMeters += segment;
  }
  state.points.push(point);
  updateRecordStats();
  syncRunButtons();
  drawRoute();
}

function addMockPoint() {
  if (state.mode === "idle") startRun();
  const last = state.points.at(-1) || { lat: 52.52, lng: 13.405 };
  addPoint({
    lat: last.lat + 0.0003 + Math.random() * 0.00035,
    lng: last.lng + 0.0002 + Math.random() * 0.00035,
    accuracy: 6,
    timestamp: Date.now(),
  });
  setSignal("Testpunkt", "active");
}

function updateRecordStats() {
  if (state.route !== "record") return;
  const elapsed = currentElapsedSeconds();
  setText("#distance", formatDistance(state.distanceMeters));
  setText("#duration", formatDuration(elapsed));
  setText("#pace", formatPace(state.distanceMeters, elapsed));
  setText("#avgPace", formatPace(state.distanceMeters, elapsed));
  setText("#calories", String(Math.round(state.distanceMeters * 0.066)));
  setText("#heartRate", state.mode === "running" ? String(142 + Math.round(Math.random() * 16)) : "--");
  syncRunButtons();
}

function syncRunButtons() {
  if (state.route !== "record") return;
  const startButton = document.querySelector("[data-action='start']");
  const pauseButton = document.querySelector("[data-action='pause']");
  const stopButton = document.querySelector("[data-action='stop']");
  if (startButton) {
    startButton.disabled = state.mode === "running";
    startButton.textContent = state.mode === "paused" ? "Resume" : "Start";
  }
  if (pauseButton) pauseButton.disabled = state.mode !== "running";
  if (stopButton) stopButton.disabled = state.mode === "idle";
}

function drawRoute() {
  const canvas = document.querySelector("#routeCanvas");
  const empty = document.querySelector("#routeEmpty");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  empty.hidden = state.points.length > 0;
  if (state.points.length < 2) return;
  const padding = 46;
  const lats = state.points.map((point) => point.lat);
  const lngs = state.points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;
  const project = (point) => ({
    x: padding + ((point.lng - minLng) / lngRange) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latRange) * (height - padding * 2),
  });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(114, 240, 154, 0.18)";
  drawProjectedLine(ctx, state.points.map(project));
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#72f09a";
  drawProjectedLine(ctx, state.points.map(project));
  const start = project(state.points[0]);
  const end = project(state.points.at(-1));
  drawMarker(ctx, start.x, start.y, "#5db8ff");
  drawMarker(ctx, end.x, end.y, "#ffc85d");
}

function drawProjectedLine(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();
}

function drawMarker(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface");
  ctx.stroke();
}

function drawStatsChart() {
  const canvas = document.querySelector("#statsChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const values = [18, 24, 21, 34, 28, 41];
  const max = Math.max(...values);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  values.forEach((value, index) => {
    const width = 58;
    const gap = 48;
    const x = 34 + index * (width + gap);
    const height = (value / max) * 150;
    const y = canvas.height - height - 28;
    const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
    gradient.addColorStop(0, "#72f09a");
    gradient.addColorStop(1, "#5db8ff");
    ctx.fillStyle = gradient;
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
  });
}

function setSignal(text, type) {
  state.signal = text;
  state.signalType = type;
}

function clearRuns() {
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function loadStoredRuns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function getRuns() {
  return [...loadStoredRuns(), ...sampleRuns];
}

function currentElapsedSeconds() {
  const activeMs = state.startedAt ? Date.now() - state.startedAt : 0;
  return Math.floor((state.elapsedBeforePause + activeMs) / 1000);
}

function haversineDistance(a, b) {
  const earthRadius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(meters) {
  return (meters / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(meters, seconds) {
  if (meters < 10 || !seconds) return "--:--";
  const secondsPerKm = seconds / (meters / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const remainingSeconds = Math.round(secondsPerKm % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatHours(seconds) {
  return (seconds / 3600).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}

function getWeekKm(runs) {
  return runs.slice(0, 3).reduce((total, run) => total + run.distanceMeters / 1000, 0);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function heatCells() {
  return Array.from({ length: 70 }, (_, index) => `<span class="heat-cell" data-level="${index % 9 === 0 ? 3 : index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0}"></span>`).join("");
}

function calendarDays() {
  return Array.from({ length: 35 }, (_, index) => {
    const day = index + 1;
    const cls = [3, 6, 10, 13, 17, 20, 24, 27, 31].includes(day) ? "run-day" : [8, 22].includes(day) ? "quality-day" : "";
    return `<span class="${cls}">${day <= 31 ? day : ""}</span>`;
  }).join("");
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, width, height, radius) {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + width, y, x + width, y + height, radius);
    this.arcTo(x + width, y + height, x, y + height, radius);
    this.arcTo(x, y + height, x, y, radius);
    this.arcTo(x, y, x + width, y, radius);
    this.closePath();
    return this;
  };
}

render();
