
const sheetId = "1v7aPG_8-IjxFr40_zWL6_0-cT-H8F2ny1vBlICTYjb0";
const sheetName = "Temperature";
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

fetch(url)
  .then(res => res.text())
  .then(text => {
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows;
    const cols = json.table.cols.map(c => c.label);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    const headRow = document.createElement("tr");
    cols.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    rows.forEach(row => {
      const tr = document.createElement("tr");
      row.c.forEach(cell => {
        const td = document.createElement("td");
        td.textContent = cell ? cell.v : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    document.getElementById("table-container").appendChild(table);

    const now = new Date();
    document.getElementById("lastUpdate").textContent = `Ultimo aggiornamento: ${now.toLocaleString()}`;
  })
  .catch(err => {
    document.getElementById("table-container").textContent = "Errore nel caricamento dei dati.";
    console.error(err);
  });
