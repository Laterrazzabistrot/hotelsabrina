// HACCP Hotel Sabrina: modifica esclusivamente la visualizzazione, non Google Sheets.
const sheetId = "1v7aPG_8-IjxFr40_zWL6_0-cT-H8F2ny1vBlICTYjb0";
const sheetName = "Temperature";
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const state = {
  mode: "last30", // last30 oppure month
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  headers: [],
  entries: [],
  invalidDateCount: 0,
  loaded: false,
  error: null
};

function dateAtMidnight(y, m, d) {
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

// Le date del formato Google Visualization possono essere Date(2026,10,18).
// Supporta anche GG/MM/AAAA, AAAA-MM-GG, e valori seriali di Sheets.
function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateAtMidnight(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).trim();
  let m = text.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,.*)?\)$/);
  if (m) return dateAtMidnight(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+.*)?$/);
  if (m) return dateAtMidnight(+m[3], +m[2] - 1, +m[1]);
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return dateAtMidnight(+m[1], +m[2] - 1, +m[3]);
  if (/^\d{5}(?:\.0+)?$/.test(text)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.trunc(Number(text)) * 86400000);
    return dateAtMidnight(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  return null;
}

function parseVisualizationResponse(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end <= start) throw new Error("Risposta Google Sheets non riconosciuta");
  const data = JSON.parse(text.slice(start + 1, end));
  if (!data.table || !Array.isArray(data.table.cols) || !Array.isArray(data.table.rows)) {
    throw new Error("Formato della tabella Google Sheets non valido");
  }
  return data.table;
}

function getDateColumn(cols) {
  const byLabel = cols.findIndex(c => /^(data|data rilevamento|data di rilevamento|date)$/i.test((c.label || "").trim()));
  if (byLabel !== -1) return byLabel;
  const byId = cols.findIndex(c => /^(data|date)$/i.test((c.id || "").trim()));
  if (byId !== -1) return byId;
  // Fallback: la prima colonna è la data se il formato lo conferma.
  return 0;
}

function displayValue(cell) {
  if (!cell) return "";
  if (cell.f != null) return String(cell.f);
  if (cell.v == null) return "";
  return String(cell.v);
}

function extractDate(cell) {
  if (!cell) return null;
  // Privilegiamo la data effettiva .v, poi la stringa formattata .f.
  return parseDate(cell.v) || parseDate(cell.f);
}

function today() {
  const now = new Date();
  return dateAtMidnight(now.getFullYear(), now.getMonth(), now.getDate());
}

function isInPeriod(date) {
  if (state.mode === "month") {
    return date.getFullYear() === state.year && date.getMonth() === state.month;
  }
  const end = today();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return date >= start && date <= end;
}

function updateYearOptions() {
  const select = document.getElementById("yearSelect");
  const years = state.entries.map(item => item.date.getFullYear());
  const current = today().getFullYear();
  const min = Math.min(current, state.year, ...years);
  const max = Math.max(current, state.year, ...years);
  select.replaceChildren();
  for (let y = max; y >= min; y--) select.add(new Option(String(y), String(y)));
  select.value = String(state.year);
}

function updateControls() {
  document.getElementById("monthSelect").value = String(state.month);
  document.getElementById("yearSelect").value = String(state.year);
  const current = today();
  const atCurrentOrFuture = state.year > current.getFullYear() ||
    (state.year === current.getFullYear() && state.month >= current.getMonth());
  document.getElementById("nextMonth").disabled = state.mode === "month" && atCurrentOrFuture;
  const periodLabel = document.getElementById("periodLabel");
  if (state.mode === "last30") {
    const first = new Date(current);
    first.setDate(first.getDate() - 29);
    periodLabel.textContent = `Ultimi 30 giorni · ${first.toLocaleDateString("it-IT")} – ${current.toLocaleDateString("it-IT")}`;
  } else {
    periodLabel.textContent = `${months[state.month]} ${state.year}`;
  }
}

function showMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "table-message";
  paragraph.textContent = message;
  document.getElementById("table-container").appendChild(paragraph);
}

function render() {
  updateControls();
  const container = document.getElementById("table-container");
  container.replaceChildren();
  const status = document.getElementById("lastUpdate");
  if (state.error) {
    status.textContent = "Caricamento non riuscito";
    showMessage("Impossibile caricare le temperature. Controlla la connessione e aggiorna la pagina.");
    return;
  }
  if (!state.loaded) {
    status.textContent = "Caricamento temperature…";
    return;
  }
  if (state.entries.length === 0 && state.invalidDateCount > 0) {
    status.textContent = "Date non riconosciute";
    showMessage("Non riesco a riconoscere la data completa nelle registrazioni. Prima di pubblicare, occorre verificare il formato della colonna Data in Google Sheets.");
    return;
  }
  const filtered = state.entries.filter(item => isInPeriod(item.date))
    .sort((a, b) => b.date - a.date || b.index - a.index);
  status.textContent = `${filtered.length} righe visualizzate · Dati caricati il ${new Date().toLocaleString("it-IT")}`;
  if (state.invalidDateCount) {
    const warning = document.createElement("p");
    warning.className = "data-warning";
    warning.textContent = `Attenzione: ${state.invalidDateCount} righe senza una data riconoscibile non sono visualizzate.`;
    container.appendChild(warning);
  }
  if (!filtered.length) {
    showMessage("Nessuna rilevazione disponibile per il periodo selezionato.");
    return;
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  state.headers.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  filtered.forEach(item => {
    const tr = document.createElement("tr");
    state.headers.forEach((_, i) => {
      const td = document.createElement("td");
      td.textContent = displayValue(item.cells[i]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  container.appendChild(table);
}

function chooseMonth(y, m) {
  const selected = new Date(y, m, 1);
  const current = today();
  const limit = new Date(current.getFullYear(), current.getMonth(), 1);
  if (selected > limit) return;
  state.year = selected.getFullYear();
  state.month = selected.getMonth();
  state.mode = "month";
  updateYearOptions();
  render();
}

// Fallback JSONP: permette la lettura GViz anche da anteprime file://,
// dove Chrome può impedire le richieste fetch per motivi CORS.
function loadViaJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = "sabrinaGviz_" + Date.now();
    const script = document.createElement("script");
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
    };
    window[callbackName] = data => {
      cleanup();
      if (!data || data.status === "error" || !data.table) {
        reject(new Error("Google Sheets non ha restituito una tabella valida"));
      } else resolve(data.table);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Impossibile raggiungere Google Sheets"));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo di attesa Google Sheets scaduto"));
    }, 15000);
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=${encodeURIComponent("out:json;responseHandler:" + callbackName)}`;
    document.head.appendChild(script);
  });
}

async function loadTemperatures() {
  try {
    let table;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      table = parseVisualizationResponse(await response.text());
    } catch (fetchError) {
      console.warn("Lettura fetch non riuscita, provo il metodo alternativo:", fetchError);
      table = await loadViaJsonp();
    }
    if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
      throw new Error("Formato tabella non valido");
    }
    state.error = null;
    state.headers = table.cols.map(c => c.label || c.id || "");
    const dateColumn = getDateColumn(table.cols);
    state.entries = [];
    state.invalidDateCount = 0;
    table.rows.forEach((row, index) => {
      const cells = row.c || [];
      if (!cells.some(c => c && (c.v != null || c.f != null))) return;
      const date = extractDate(cells[dateColumn]);
      if (!date) { state.invalidDateCount++; return; }
      state.entries.push({date, cells, index});
    });
    state.loaded = true;
    updateYearOptions();
    render();
  } catch (error) {
    console.error("Errore nel caricamento HACCP Hotel Sabrina:", error);
    state.error = error;
    render();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const monthSelect = document.getElementById("monthSelect");
  months.forEach((name, index) => monthSelect.add(new Option(name, String(index))));
  document.getElementById("previousMonth").addEventListener("click", () =>
    chooseMonth(state.year, state.month - 1));
  document.getElementById("nextMonth").addEventListener("click", () =>
    chooseMonth(state.year, state.month + 1));
  monthSelect.addEventListener("change", () => chooseMonth(state.year, +monthSelect.value));
  document.getElementById("yearSelect").addEventListener("change", event =>
    chooseMonth(+event.target.value, state.month));
  document.getElementById("todayButton").addEventListener("click", () => {
    const current = today();
    state.year = current.getFullYear();
    state.month = current.getMonth();
    state.mode = "last30";
    updateYearOptions();
    render();
  });
  updateYearOptions();
  render();
  loadTemperatures();
});
