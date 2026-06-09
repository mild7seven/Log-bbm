
const $ = (id) => document.getElementById(id);

const DB_NAME = "bbm_mid_toyota_db";
const DB_VERSION = 1;
const DEFAULT_SETTINGS = {
  botToken: "",
  chatId: "",
  serviceInterval: 10000,
  lastServiceOdo: "",
  tripAStart: "",
  tripBStart: "",
  tankCapacity: "",
  vehicle: "",
  fuelPercent: 100,
  theme: "dark"
};

let deferredPrompt = null;
let fuelChartState = null;

const state = {
  entries: [],
  settings: { ...DEFAULT_SETTINGS }
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowLabel() {
  return new Date().toLocaleString("id-ID", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function setStatus(msg, type = "info") {
  $("midStatus").textContent = msg;
  $("saveState").textContent = msg;
  $("connectionBadge").textContent = type === "error" ? "Perlu cek" : "Offline ready";
}

function formatNum(value, digits = 1) {
  const n = Number(value);
  if (!isFinite(n)) return "0";
  return n.toLocaleString("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatRp(value) {
  const n = Number(value);
  if (!isFinite(n)) return "Rp0";
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("entries", "readonly");
    const store = tx.objectStore("entries");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => new Date(a.date) - new Date(b.date)));
    req.onerror = () => reject(req.error);
  });
}

async function dbAddEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbClearEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("bbm_mid_settings") || "{}");
  state.settings = { ...DEFAULT_SETTINGS, ...saved };

  $("vehicle").value = state.settings.vehicle || "";
  $("date").value = saved.date || todayISO();
  $("tankCapacity").value = state.settings.tankCapacity || "";
  $("fuelPercent").value = state.settings.fuelPercent ?? 100;
  $("botToken").value = state.settings.botToken || "";
  $("chatId").value = state.settings.chatId || "";
  $("serviceInterval").value = state.settings.serviceInterval || 10000;
  $("lastServiceOdo").value = state.settings.lastServiceOdo || "";
  $("tripAStart").value = state.settings.tripAStart || "";
  $("tripBStart").value = state.settings.tripBStart || "";
  setTheme(state.settings.theme || "dark");
}

function saveSettings() {
  const current = {
    ...state.settings,
    vehicle: $("vehicle").value.trim(),
    date: $("date").value,
    tankCapacity: $("tankCapacity").value.trim(),
    fuelPercent: $("fuelPercent").value.trim(),
    botToken: $("botToken").value.trim(),
    chatId: $("chatId").value.trim(),
    serviceInterval: Number($("serviceInterval").value || 10000),
    lastServiceOdo: $("lastServiceOdo").value.trim(),
    tripAStart: $("tripAStart").value.trim(),
    tripBStart: $("tripBStart").value.trim(),
    theme: document.documentElement.dataset.theme === "light" ? "light" : "dark"
  };
  localStorage.setItem("bbm_mid_settings", JSON.stringify(current));
  state.settings = current;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  setTheme(next);
  saveSettings();
}

function getFormData() {
  const date = $("date").value || todayISO();
  const vehicle = $("vehicle").value.trim() || state.settings.vehicle || "Kendaraan";
  const odometer = Number($("odometer").value);
  const liters = Number($("liters").value);
  const cost = Number($("cost").value);
  const notes = $("notes").value.trim();
  const tankCapacity = Number($("tankCapacity").value || 0);
  const fuelPercent = Number($("fuelPercent").value || 100);
  const pricePerLiter = Number($("pricePerLiter").value || 0);

  if (!date) throw new Error("Tanggal wajib diisi.");
  if (!isFinite(odometer) || odometer < 0) throw new Error("Odometer tidak valid.");
  if (!isFinite(liters) || liters <= 0) throw new Error("Liter BBM harus lebih dari 0.");
  if (!isFinite(cost) || cost < 0) throw new Error("Biaya tidak valid.");

  return {
    date,
    vehicle,
    odometer,
    liters,
    cost,
    notes,
    tankCapacity,
    fuelPercent,
    pricePerLiter: pricePerLiter || (liters > 0 ? cost / liters : 0),
    createdAt: new Date().toISOString()
  };
}

function calcEntryMetrics(entry, prev) {
  const distance = prev ? Math.max(0, Number(entry.odometer) - Number(prev.odometer)) : 0;
  const kmpl = distance > 0 ? distance / Number(entry.liters || 1) : 0;
  const costPerKm = distance > 0 ? Number(entry.cost || 0) / distance : 0;
  return { distance, kmpl, costPerKm };
}

function getCurrentOdo() {
  if (state.entries.length) return Number(state.entries[state.entries.length - 1].odometer) || 0;
  const typed = Number($("odometer").value || 0);
  return isFinite(typed) ? typed : 0;
}

function getTripAStart() {
  const saved = Number($("tripAStart").value || state.settings.tripAStart || 0);
  return isFinite(saved) && saved > 0 ? saved : (state.entries[0] ? Number(state.entries[0].odometer) : 0);
}

function getTripBStart() {
  const saved = Number($("tripBStart").value || state.settings.tripBStart || 0);
  return isFinite(saved) && saved > 0 ? saved : (state.entries[0] ? Number(state.entries[0].odometer) : 0);
}

function calculateTrip(startOdo) {
  const current = getCurrentOdo();
  const value = current > startOdo ? current - startOdo : 0;
  return value;
}

function calculateServiceDue() {
  const current = getCurrentOdo();
  const interval = Math.max(1000, Number($("serviceInterval").value || state.settings.serviceInterval || 10000));
  const lastService = Number($("lastServiceOdo").value || state.settings.lastServiceOdo || 0);
  const serviceAt = lastService > 0 ? lastService + interval : interval;
  const remaining = serviceAt - current;
  return { current, interval, lastService, serviceAt, remaining };
}

function calculateMID() {
  let totalDistance = 0;
  let totalLiters = 0;
  let totalCost = 0;

  state.entries.forEach((entry, idx) => {
    if (idx === 0) return;
    const prev = state.entries[idx - 1];
    const m = calcEntryMetrics(entry, prev);
    totalDistance += m.distance;
    totalLiters += Number(entry.liters || 0);
    totalCost += Number(entry.cost || 0);
  });

  const avgKml = totalLiters > 0 ? totalDistance / totalLiters : 0;
  const fuelPercent = Math.max(0, Math.min(100, Number($("fuelPercent").value || state.settings.fuelPercent || 0)));
  const tankCapacity = Math.max(0, Number($("tankCapacity").value || state.settings.tankCapacity || 0));
  const fuelLeft = (fuelPercent / 100) * tankCapacity;
  const remainingRange = fuelLeft * avgKml;
  const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
  const tripA = calculateTrip(getTripAStart());
  const tripB = calculateTrip(getTripBStart());
  const odo = getCurrentOdo();
  const service = calculateServiceDue();

  const fuelFill = $("fuelLevel");
  fuelFill.textContent = `${fuelPercent.toFixed(0)}%`;
  $("remainingRange").textContent = `${Math.round(remainingRange)} km`;
  $("avgKml").textContent = `${formatNum(avgKml, 2)} km/L`;
  $("costPerKm").textContent = formatRp(costPerKm);
  $("tripA").textContent = `${formatNum(tripA, 1)} km`;
  $("tripB").textContent = `${formatNum(tripB, 1)} km`;
  $("odoValue").textContent = `${formatNum(odo, 1)} km`;

  if (service.remaining < 0) {
    $("serviceDue").textContent = `OVERDUE ${formatNum(Math.abs(service.remaining), 0)} km`;
    $("serviceDue").style.color = "#ff8d8d";
  } else {
    $("serviceDue").textContent = `${formatNum(service.remaining, 0)} km`;
    $("serviceDue").style.color = "";
  }

  const gauge = $("midScreen");
  const green = "#30f29d";
  const warn = "#f5d36a";
  const bad = "#ff7d7d";
  const gaugeColor = fuelPercent > 50 ? green : fuelPercent > 20 ? warn : bad;

  gauge.style.setProperty("--gauge", gaugeColor);
  fuelFill.style.color = gaugeColor;
  gauge.style.boxShadow = `inset 0 0 0 1px rgba(255,255,255,.03), 0 0 0 1px rgba(255,255,255,.03)`;

  $("fuelLevel").style.color = gaugeColor;
  $("fuelLabel").textContent = fuelPercent > 80 ? "FULL" : fuelPercent > 20 ? "NORMAL" : "LOW";
  $("rangeHint").textContent = service.remaining < 0
    ? `Servis lewat ${Math.abs(service.remaining).toFixed(0)} km`
    : `Target servis berikutnya ${formatNum(service.serviceAt, 0)} km`;

  $("serviceLabel").textContent = `interval ${formatNum(service.interval, 0)} km`;
  $("lastUpdate").textContent = nowLabel();
  $("midStatus").textContent = state.entries.length ? "Data siap ditampilkan" : "Belum ada riwayat";
  return { avgKml, fuelPercent, tankCapacity, remainingRange, costPerKm, tripA, tripB, odo, service };
}

function renderHistory() {
  const tbody = $("history");
  tbody.innerHTML = "";

  if (!state.entries.length) {
    const tpl = $("emptyRowTemplate");
    tbody.appendChild(tpl.content.cloneNode(true));
    $("historyCount").textContent = "0 entri";
    return;
  }

  let totalDistance = 0;
  let totalLiters = 0;
  let totalCost = 0;

  state.entries.forEach((entry, idx) => {
    const prev = idx > 0 ? state.entries[idx - 1] : null;
    const m = calcEntryMetrics(entry, prev);
    totalDistance += m.distance;
    totalLiters += Number(entry.liters || 0);
    totalCost += Number(entry.cost || 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.date || ""}</td>
      <td>${entry.vehicle || ""}</td>
      <td>${formatNum(entry.odometer, 1)}</td>
      <td>${idx === 0 ? "-" : formatNum(m.distance, 1)}</td>
      <td>${formatNum(entry.liters, 2)}</td>
      <td>${idx === 0 ? "-" : formatNum(m.kmpl, 2)}</td>
      <td>${formatRp(entry.cost)}</td>
      <td><span class="history-note">${entry.notes || "-"}</span></td>
    `;
    tbody.appendChild(tr);
  });

  $("historyCount").textContent = `${state.entries.length} entri`;
  return { totalDistance, totalLiters, totalCost };
}

function drawGrid(ctx, width, height, padding) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 1;
  for (let x = padding; x <= width - padding; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }
  for (let y = padding; y <= height - padding; y += 56) {
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  ctx.restore();
}

function renderChart() {
  const canvas = $("fuelChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 48;

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);

  const points = [];
  state.entries.forEach((entry, idx) => {
    if (idx === 0) return;
    const prev = state.entries[idx - 1];
    const distance = Math.max(0, Number(entry.odometer) - Number(prev.odometer));
    const kmpl = distance > 0 ? distance / Number(entry.liters || 1) : 0;
    points.push({
      label: entry.date,
      value: Number(kmpl.toFixed(2))
    });
  });

  ctx.save();
  ctx.fillStyle = "rgba(233,241,255,.85)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("KM/L", padding, 24);
  ctx.restore();

  if (!points.length) {
    ctx.save();
    ctx.fillStyle = "rgba(149,167,194,.9)";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Belum ada data untuk grafik.", padding, height / 2);
    ctx.restore();
    fuelChartState = null;
    return;
  }

  const values = points.map(p => p.value);
  const min = Math.max(0, Math.min(...values) - 1);
  const max = Math.max(1, Math.max(...values) + 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const x = (i) => padding + i * stepX;
  const y = (v) => padding + (max - v) / (max - min) * innerHeight;

  ctx.save();
  ctx.strokeStyle = "rgba(48,242,157,.95)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(48,242,157,.25)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = x(i);
    const py = y(p.value);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(48,242,157,.95)";
  points.forEach((p, i) => {
    const px = x(i);
    const py = y(p.value);
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(233,241,255,.72)";
  ctx.font = "12px system-ui, sans-serif";
  const labelCount = Math.min(points.length, 8);
  const labelStep = Math.max(1, Math.ceil(points.length / labelCount));
  points.forEach((p, i) => {
    if (i % labelStep !== 0 && i !== points.length - 1) return;
    const px = x(i);
    const py = height - 16;
    ctx.fillText(p.label, px - 20, py);
  });
  ctx.restore();

  fuelChartState = { min, max, points };
}

function renderAll() {
  renderHistory();
  const mid = calculateMID();
  $("saveState").textContent = state.entries.length ? "Data tersimpan" : "Belum ada data";
  renderChart();
  if (mid.remainingRange < 1 && state.entries.length) {
    $("rangeHint").textContent = "Sisa jarak sangat kecil";
  }
}

function clearForm() {
  $("odometer").value = "";
  $("liters").value = "";
  $("cost").value = "";
  $("pricePerLiter").value = "";
  $("notes").value = "";
  $("date").value = todayISO();
  $("fuelPercent").value = state.settings.fuelPercent ?? 100;
  $("midStatus").textContent = "Form dibersihkan";
}

function buildTelegramMessage(entry, prev) {
  const m = calcEntryMetrics(entry, prev);
  const mid = calculateMID();

  return [
    "📒 *Log BBM Baru*",
    `🚗 Kendaraan: ${entry.vehicle}`,
    `📅 Tanggal: ${entry.date}`,
    `🛣 Odometer: ${formatNum(entry.odometer, 1)} km`,
    prev ? `↔️ Jarak: ${formatNum(m.distance, 1)} km` : "↔️ Jarak: -",
    `⛽ Liter: ${formatNum(entry.liters, 2)} L`,
    `📈 KM/L: ${prev ? formatNum(m.kmpl, 2) : "-"}`,
    `💰 Biaya: ${formatRp(entry.cost)}`,
    `💸 Harga/L: ${formatRp(entry.pricePerLiter)}`,
    `🧭 Fuel: ${Math.round(mid.fuelPercent)}%`,
    `🏁 Range: ${Math.round(mid.remainingRange)} km`,
    `📝 Catatan: ${entry.notes || "-"}`,
    `🕒 ${new Date(entry.createdAt).toLocaleString("id-ID")}`
  ].join("\n");
}

async function sendTelegram(entry) {
  const botToken = $("botToken").value.trim();
  const chatId = $("chatId").value.trim();

  if (!botToken) throw new Error("Bot token belum diisi.");
  if (!chatId) throw new Error("Chat ID belum diisi.");

  const prev = state.entries.length ? state.entries[state.entries.length - 1] : null;
  const message = buildTelegramMessage(entry, prev);

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = new URLSearchParams({
    chat_id: chatId,
    text: message,
    parse_mode: "Markdown"
  });

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: payload.toString()
  });

  setStatus("Permintaan Telegram dikirim.", "info");
}

function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    entries: state.entries
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bbm-mid-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJSON(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  const entries = Array.isArray(parsed) ? parsed : (parsed.entries || []);
  if (!Array.isArray(entries)) throw new Error("Format backup tidak valid.");

  await dbClearEntries();
  for (const entry of entries) {
    await dbAddEntry({
      date: entry.date || todayISO(),
      vehicle: entry.vehicle || "Kendaraan",
      odometer: Number(entry.odometer || 0),
      liters: Number(entry.liters || 0),
      cost: Number(entry.cost || 0),
      notes: entry.notes || "",
      tankCapacity: Number(entry.tankCapacity || 0),
      fuelPercent: Number(entry.fuelPercent || 100),
      pricePerLiter: Number(entry.pricePerLiter || 0),
      createdAt: entry.createdAt || new Date().toISOString()
    });
  }

  if (parsed.settings && typeof parsed.settings === "object") {
    const merged = { ...DEFAULT_SETTINGS, ...state.settings, ...parsed.settings };
    localStorage.setItem("bbm_mid_settings", JSON.stringify(merged));
  }

  state.entries = await dbGetAllEntries();
  loadSettings();
  renderAll();
  setStatus("Backup berhasil diimpor.");
}

function resetTripA() {
  const current = getCurrentOdo();
  $("tripAStart").value = current ? String(current) : "";
  saveSettings();
  renderAll();
  setStatus("Trip A di-reset.");
}

function resetTripB() {
  const current = getCurrentOdo();
  $("tripBStart").value = current ? String(current) : "";
  saveSettings();
  renderAll();
  setStatus("Trip B di-reset.");
}

function serviceDone() {
  const current = getCurrentOdo();
  $("lastServiceOdo").value = current ? String(current) : "";
  saveSettings();
  renderAll();
  setStatus("Servis ditandai selesai.");
}

function syncSettingsFromInputs() {
  saveSettings();
  renderAll();
}

async function init() {
  $("date").value = todayISO();
  loadSettings();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (err) {
      console.warn("SW registration failed", err);
    }
  }

  $("themeBtn").addEventListener("click", toggleTheme);

  $("saveBtn").addEventListener("click", async () => {
    try {
      saveSettings();
      const entry = getFormData();
      await dbAddEntry(entry);
      state.entries = await dbGetAllEntries();
      renderAll();
      clearForm();
      setStatus("Log tersimpan.");
    } catch (err) {
      setStatus(err.message, "error");
    }
  });

  $("sendBtn").addEventListener("click", async () => {
    try {
      saveSettings();
      const entry = getFormData();
      await sendTelegram(entry);
    } catch (err) {
      setStatus(err.message, "error");
    }
  });

  $("clearBtn").addEventListener("click", clearForm);
  $("exportBtn").addEventListener("click", exportJSON);
  $("tripAResetBtn").addEventListener("click", resetTripA);
  $("tripBResetBtn").addEventListener("click", resetTripB);
  $("serviceResetBtn").addEventListener("click", serviceDone);

  $("resetAllBtn").addEventListener("click", async () => {
    if (!confirm("Hapus semua log dan reset pengaturan terkait?")) return;
    await dbClearEntries();
    localStorage.removeItem("bbm_mid_settings");
    state.entries = [];
    state.settings = { ...DEFAULT_SETTINGS };
    loadSettings();
    renderAll();
    setStatus("Semua data dihapus.");
  });

  $("importFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importJSON(file);
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      e.target.value = "";
    }
  });

  [
    "vehicle", "date", "odometer", "liters", "cost", "pricePerLiter",
    "tankCapacity", "fuelPercent", "botToken", "chatId", "serviceInterval",
    "lastServiceOdo", "tripAStart", "tripBStart"
  ].forEach((id) => {
    $(id).addEventListener("input", syncSettingsFromInputs);
    $(id).addEventListener("change", syncSettingsFromInputs);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").textContent = "Install Ready";
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) {
      setStatus("Install belum tersedia di browser ini.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").textContent = "Install";
  });

  state.entries = await dbGetAllEntries();
  renderAll();
  setStatus(state.entries.length ? "Data siap ditampilkan" : "Belum ada data");
}

init();


function detectDevice(){
 document.body.classList.remove('mobile','tablet','desktop');
 const w=window.innerWidth;
 if(w<600) document.body.classList.add('mobile');
 else if(w<1024) document.body.classList.add('tablet');
 else document.body.classList.add('desktop');
}
function updateViewportHeight(){
 document.documentElement.style.setProperty('--vh',`${window.innerHeight*0.01}px`);
}
window.addEventListener('resize',()=>{
 detectDevice();
 updateViewportHeight();
 const c=document.getElementById('fuelChart');
 if(c && c.parentElement){
   c.width=Math.max(c.parentElement.clientWidth,320);
   c.height=window.innerWidth<600?220:(window.innerWidth<1024?280:420);
 }
 if(typeof renderChart==='function') renderChart();
 if(typeof calculateMID==='function') calculateMID();
});
detectDevice();
updateViewportHeight();
