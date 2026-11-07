"use strict";

(() => {
  const YEARS = Array.from({ length: 20 }, (_, index) => 2005 + index);
  const YEAR_MIN = YEARS[0];
  const YEAR_MAX = YEARS[YEARS.length - 1];
  const ALL_REGION = "All";
  const INCOME_TREND_GROUPS = [
    { key: "developed", label: "Developed", color: "#3169c9", fill: "rgba(49, 105, 201, 0.13)", dash: "solid" },
    { key: "developing", label: "Developing", color: "#e5b72f", fill: "rgba(229, 183, 47, 0.16)", dash: "dash" },
  ];
  const CHART_CONFIG = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
    toImageButtonOptions: { format: "png", scale: 2 },
  };
  const BASE_LAYOUT = {
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: "DM Sans, Segoe UI, sans-serif", size: 10, color: "#506771" },
    margin: { t: 35, r: 18, b: 48, l: 56 },
    hoverlabel: { bgcolor: "#173642", font: { color: "#ffffff", size: 11 } },
    legend: { orientation: "h", y: -0.22, font: { size: 9 } },
    xaxis: { gridcolor: "#edf1f1", zerolinecolor: "#bccaca", automargin: true },
    yaxis: { gridcolor: "#edf1f1", zerolinecolor: "#bccaca", automargin: true },
  };

  const state = {
    developmentGroup: "all",
    year: YEAR_MAX,
    region: ALL_REGION,
    focusIso: "CHN",
    compareIso: "USA",
    windowYears: 20,
    peerTolerance: 0.1,
    peerSort: "gdp",
    peerGroup: "all",
    trajectoryMode: "both",
    scatterIncomeGroup: "all",
    scatterLogGdp: false,
    structureIso: "CHN",
    structureCompareIso: "USA",
  };
  const records = [];
  const byIso = new Map();
  const countryByIso = new Map();
  const incomeGroupByIso = new Map();
  const sectorRows = new Map();
  const energyByIso = new Map();
  const boundPlotClicks = new WeakSet();
  const $ = (id) => document.getElementById(id);
  const plotly = () => window.Plotly;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field.length === 0) {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }
    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
    return rows.slice(1).map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]))
    );
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "" || value === "..") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.text();
  }

  function setStatus(message, kind = "") {
    const status = $("data-status");
    if (!status) return;
    status.classList.toggle("is-ready", kind === "ready");
    status.classList.toggle("is-error", kind === "error");
    status.lastChild.textContent = ` ${message}`;
  }

  function prepareRecords(gdpRows, co2Rows) {
    const gdpByKey = new Map();
    for (const row of gdpRows) {
      const iso = row.Code?.trim().toUpperCase();
      const year = Number(row.Year);
      const gdp = numberOrNull(row["GDP per capita"]);
      if (!/^[A-Z]{3}$/.test(iso || "") || !Number.isInteger(year) || gdp === null || gdp <= 0) continue;
      gdpByKey.set(`${iso}|${year}`, { gdp, name: row.Entity, region: row["World region according to OWID"] || "Unknown" });
    }

    for (const row of co2Rows) {
      const iso = row.Code?.trim().toUpperCase();
      const year = Number(row.Year);
      const co2 = numberOrNull(row["Per capita emissions"]);
      if (!/^[A-Z]{3}$/.test(iso || "") || !Number.isInteger(year) || co2 === null || co2 < 0) continue;
      const gdpRecord = gdpByKey.get(`${iso}|${year}`);
      if (!gdpRecord) continue;
      const region = row["World region according to OWID"] || gdpRecord.region || "Unknown";
      const record = {
        iso,
        year,
        country: row.Entity || gdpRecord.name || iso,
        region,
        gdp: gdpRecord.gdp,
        co2,
      };
      records.push(record);
      if (!byIso.has(iso)) {
        byIso.set(iso, []);
        countryByIso.set(iso, { iso, country: record.country, region });
      }
      byIso.get(iso).push(record);
    }
    for (const countryRows of byIso.values()) countryRows.sort((a, b) => a.year - b.year);
    records.sort((a, b) => a.year - b.year || a.country.localeCompare(b.country));
  }

  function prepareSectorRows(rows) {
    const seriesNames = {
      "NV.AGR.TOTL.ZS": "Agriculture",
      "NV.IND.TOTL.ZS": "Industry",
      "NV.IND.MANF.ZS": "Manufacturing",
      "NV.SRV.TOTL.ZS": "Services",
    };
    for (const row of rows) {
      const iso = row["Country Code"]?.trim().toUpperCase();
      const series = seriesNames[row["Series Code"]?.trim()];
      if (!countryByIso.has(iso) || !series) continue;
      if (!sectorRows.has(iso)) sectorRows.set(iso, { name: row["Country Name"], values: {} });
      const profile = sectorRows.get(iso);
      for (const year of YEARS) {
        const key = `${year} [YR${year}]`;
        const value = numberOrNull(row[key]);
        if (value !== null) {
          profile.values[year] ??= {};
          profile.values[year][series] = value;
        }
      }
    }
  }

  function prepareEnergyRows(rows) {
    const fields = {
      total_energy_per_capita_kwh: "energyPerCapitaKwh",
      coal_energy_share_pct: "coalShare",
      oil_energy_share_pct: "oilShare",
      gas_energy_share_pct: "gasShare",
      nuclear_energy_share_pct: "nuclearShare",
      renewables_energy_share_pct: "renewablesShare",
    };
    for (const row of rows) {
      const iso = row.iso_code?.trim().toUpperCase();
      const year = Number(row.year);
      if (!countryByIso.has(iso) || !Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) continue;
      if (!energyByIso.has(iso)) energyByIso.set(iso, new Map());
      const values = Object.fromEntries(
        Object.entries(fields).map(([field, key]) => [key, numberOrNull(row[field])])
      );
      energyByIso.get(iso).set(year, values);
    }
  }

  function prepareIncomeGroups(rows) {
    incomeGroupByIso.clear();
    for (const row of rows) if (['Developed','Developing'].includes(row['Development group'])) incomeGroupByIso.set(row.Code,row['Development group']);
  }

  function energyRecord(iso, year) {
    return energyByIso.get(iso)?.get(Number(year)) || null;
  }

  function selectedRows(year = state.year) {
    return records.filter((row) =>
      row.year === Number(year) && (state.region === ALL_REGION || row.region === state.region) && incomeGroupByIso.has(row.iso) && (state.developmentGroup === "all" || incomeGroupByIso.get(row.iso) === state.developmentGroup)
    );
  }

  function countryRecord(iso, year) {
    return (byIso.get(iso) || []).find((row) => row.year === Number(year)) || null;
  }

  function windowBounds() {
    return { start: Math.max(YEAR_MIN, state.year - state.windowYears + 1), end: state.year };
  }

  function windowChange(iso, field) {
    const { start, end } = windowBounds();
    const first = countryRecord(iso, start);
    const last = countryRecord(iso, end);
    if (!first || !last || first[field] <= 0) return null;
    return ((last[field] / first[field]) - 1) * 100;
  }

  function yoyChange(iso, year, field) {
    const current = countryRecord(iso, year);
    const previous = countryRecord(iso, Number(year) - 1);
    if (!current || !previous || previous[field] <= 0) return null;
    return ((current[field] / previous[field]) - 1) * 100;
  }

  function pathwayLabel(gdpChange, co2Change) {
    if (gdpChange === null || co2Change === null) return "Incomplete data";
    if (gdpChange >= 0 && co2Change < 0) return "Per-capita decoupling";
    if (gdpChange >= 0 && co2Change >= 0) return "Growth with rising CO₂";
    if (gdpChange < 0 && co2Change < 0) return "Both declined";
    return "Emissions rose as GDP fell";
  }

  function fmt(value, digits = 1) {
    if (value === null || !Number.isFinite(value)) return "—";
    return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtCompact(value) {
    if (value === null || !Number.isFinite(value)) return "—";
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function fmtPercent(value, digits = 1) {
    if (value === null || !Number.isFinite(value)) return "n/a";
    return `${value > 0 ? "+" : ""}${fmt(value, digits)}%`;
  }

  function pearsonCorrelation(rows) {
    if (rows.length < 3) return null;
    const meanX = rows.reduce((sum, row) => sum + row.gdp, 0) / rows.length;
    const meanY = rows.reduce((sum, row) => sum + row.co2, 0) / rows.length;
    let covariance = 0;
    let varianceX = 0;
    let varianceY = 0;
    for (const row of rows) {
      const dx = row.gdp - meanX;
      const dy = row.co2 - meanY;
      covariance += dx * dy;
      varianceX += dx * dx;
      varianceY += dy * dy;
    }
    if (!varianceX || !varianceY) return null;
    return Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
  }

  function makeLayout(extra = {}) {
    return {
      ...BASE_LAYOUT,
      ...extra,
      xaxis: { ...BASE_LAYOUT.xaxis, ...(extra.xaxis || {}) },
      yaxis: { ...BASE_LAYOUT.yaxis, ...(extra.yaxis || {}) },
    };
  }

  function updateCountryOptions() {
    const options = [...countryByIso.values()].sort((a, b) => a.country.localeCompare(b.country));
    for (const id of ["country-select", "compare-select"]) {
      const select = $(id);
      const previous = id === "country-select" ? state.focusIso : state.compareIso;
      select.replaceChildren();
      if (id === "compare-select") {
        const none = document.createElement("option");
        none.value = "";
        none.textContent = "No comparison";
        select.append(none);
      }
      for (const country of options) {
        const option = document.createElement("option");
        option.value = country.iso;
        option.textContent = country.country;
        select.append(option);
      }
      select.value = previous && countryByIso.has(previous) ? previous : options[0]?.iso || "";
    }
    state.focusIso = $("country-select").value;
    state.compareIso = $("compare-select").value;
    $("hero-country-count").textContent = String(countryByIso.size);
  }

  function quantileGroups() {
    const baseYearRows = records.filter((row) => row.year === YEAR_MIN).sort((a, b) => a.gdp - b.gdp);
    const size = Math.max(1, Math.floor(baseYearRows.length * 0.1));
    return {
      lower: new Set(baseYearRows.slice(0, size).map((row) => row.iso)),
      higher: new Set(baseYearRows.slice(-size).map((row) => row.iso)),
      n: size,
    };
  }

  let baselineGroups = { lower: new Set(), higher: new Set(), n: 0 };

  function updateKpis() {
    const rows = selectedRows();
    const correlation = pearsonCorrelation(rows);
    const co2Values = rows.map((row) => row.co2).sort((a, b) => a - b);
    const median = co2Values.length
      ? co2Values.length % 2
        ? co2Values[(co2Values.length - 1) / 2]
        : (co2Values[co2Values.length / 2 - 1] + co2Values[co2Values.length / 2]) / 2
      : null;
    const gdpChange = windowChange(state.focusIso, "gdp");
    const co2Change = windowChange(state.focusIso, "co2");
    $("kpi-count").textContent = fmtCompact(rows.length);
    $("kpi-correlation").textContent = correlation === null ? "—" : fmt(correlation, 2);
    $("kpi-correlation-note").textContent = "Pearson correlation · selected year";
    $("kpi-co2").textContent = median === null ? "—" : fmt(median, 1);
    $("kpi-pathway").textContent = pathwayLabel(gdpChange, co2Change);
    $("kpi-pathway-note").textContent = `${countryByIso.get(state.focusIso)?.country || "Focus country"} · ${fmtPercent(gdpChange)} GDP · ${fmtPercent(co2Change)} CO₂`;
    $("year-label").textContent = String(state.year);
    $("map-gdp-year-label").textContent = String(state.year);
    $("map-co2-year-label").textContent = String(state.year);
    const { start, end } = windowBounds();
    $("window-caption").textContent = `${start}–${end}`;
    $("trajectory-window-label").textContent = `${start}–${end}`;
    $("kaya-start-label").textContent = String(start);
    $("window-caption").title = "Baseline is the first year of the selected window.";
    document.querySelectorAll(".window-button").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.window) === state.windowYears);
    });
  }

  function bindPlotClick(elementId, onClick) {
    const element = $(elementId);
    if (boundPlotClicks.has(element)) return;
    boundPlotClicks.add(element);
    element.on("plotly_click", onClick);
  }

  function percentileValue(values, percentile) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  function colorForValue(value, maxValue, warm = false) {
    if (value === null || !Number.isFinite(value)) return "#e2e9eb";
    const stops = warm ? [[0,[255,245,235]],[0.2,[254,221,185]],[0.45,[253,174,107]],[0.72,[230,85,13]],[1,[127,39,4]]] : [
      [0, [233, 241, 238]],
      [0.2, [187, 216, 203]],
      [0.45, [110, 171, 160]],
      [0.72, [42, 123, 132]],
      [1, [21, 61, 87]],
    ];
    const t = Math.max(0, Math.min(1, value / maxValue));
    let index = 0;
    while (index < stops.length - 2 && t > stops[index + 1][0]) index += 1;
    const [leftT, left] = stops[index];
    const [rightT, right] = stops[index + 1];
    const fraction = (t - leftT) / (rightT - leftT);
    const color = left.map((channel, i) => Math.round(channel + (right[i] - channel) * fraction));
    return `rgb(${color.join(",")})`;
  }

  function renderMap() {
    const currentRows = selectedRows();
    const tooltip = $("tooltip");
    const rowByIso = new Map(currentRows.map((row) => [row.iso, row]));
    const focus = countryRecord(state.focusIso, state.year);
    const mapConfigs = [
      { id: "world-map-gdp", insightId: "map-gdp-insight", field: "gdp", format: (row) => `$${fmtCompact(row.gdp)}`, label: "GDP per person" },
      { id: "world-map-co2", insightId: "map-co2-insight", field: "co2", format: (row) => `${fmt(row.co2, 2)} tonnes`, label: "CO₂ per person" },
    ];
    for (const config of mapConfigs) {
      const values = currentRows.map((row) => row[config.field]).filter(Number.isFinite).sort((a, b) => a - b);
      const maxValue = values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] || 1 : 1;
      const map = $(config.id);
      for (const path of map.querySelectorAll(".map-country")) {
        const iso = path.dataset.iso;
        const row = rowByIso.get(iso);
        path.style.fill = colorForValue(row?.[config.field] ?? null, maxValue, config.field === "co2");
        path.classList.toggle("is-focus", iso === state.focusIso);
        path.classList.toggle("is-compare", Boolean(state.compareIso) && iso === state.compareIso);
        path.setAttribute("tabindex", "0");
        path.setAttribute("role", "button");
        const country = row?.country || path.dataset.name || iso;
        path.setAttribute("aria-label", row
          ? `${country}: ${config.label} ${config.format(row)}`
          : `${country}: no matched data in ${state.year}`);
        path.onmouseenter = (event) => {
          tooltip.innerHTML = row
            ? `<strong>${escapeHtml(country)}</strong><br>GDP/person: $${fmtCompact(row.gdp)}<br>CO₂/person: ${fmt(row.co2, 2)} t<br>${escapeHtml(row.region)} · ${state.year}`
            : `<strong>${escapeHtml(country)}</strong><br>No matched data in ${state.year}`;
          tooltip.style.display = "block";
          positionTooltip(event);
        };
        path.onmousemove = positionTooltip;
        path.onmouseleave = () => { tooltip.style.display = "none"; };
        path.onclick = () => setFocusCountry(iso);
        path.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setFocusCountry(iso);
          }
        };
      }
      $(config.insightId).textContent = focus
        ? `${focus.country} in ${state.year}: ${config.label} is ${config.format(focus)}. Colour scale is capped at the 95th percentile for contrast.`
        : `No matched country data for ${countryByIso.get(state.focusIso)?.country || "the focus country"} in ${state.year}.`;
    }
  }

  function positionTooltip(event) {
    const tooltip = $("tooltip");
    const left = Math.min(window.innerWidth - tooltip.offsetWidth - 10, event.clientX + 13);
    const top = Math.min(window.innerHeight - tooltip.offsetHeight - 10, event.clientY + 13);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function renderTrajectory() {
    const { start, end } = windowBounds();
    const selected = [
      { iso: state.focusIso, label: "Focus", dash: "solid" },
      { iso: state.compareIso, label: "Comparison", dash: "dash" },
    ].filter((item) => item.iso);
    const measures = state.trajectoryMode === "both"
      ? [{ field: "gdp", name: "GDP per person index", color: "#168a8b" }, { field: "co2", name: "CO₂ per person index", color: "#e18356" }]
      : [{ field: state.trajectoryMode, name: state.trajectoryMode === "gdp" ? "GDP per person index" : "CO₂ per person index", color: state.trajectoryMode === "gdp" ? "#168a8b" : "#e18356" }];
    const traces = [];
    for (const country of selected) {
      const baseline = countryRecord(country.iso, start);
      const name = countryByIso.get(country.iso)?.country || country.iso;
      for (const measure of measures) {
        const rows = (byIso.get(country.iso) || []).filter((row) => row.year >= start && row.year <= end);
        traces.push({
          type: "scatter",
          mode: "lines+markers",
          name: `${name} · ${measure.field.toUpperCase()}`,
          x: rows.map((row) => row.year),
          y: rows.map((row) => baseline && baseline[measure.field] > 0 ? (row[measure.field] / baseline[measure.field]) * 100 : null),
          line: { color: measure.color, dash: country.dash, width: country.dash === "solid" ? 2.4 : 1.8 },
          marker: { size: 5 },
          connectgaps: false,
          hovertemplate: `<b>${escapeHtml(name)}</b><br>${measure.name}: %{y:.1f}<br>Year: %{x}<extra></extra>`,
        });
      }
    }
    plotly().react("trajectory-chart", traces, makeLayout({
      margin: { t: 15, r: 15, b: 58, l: 58 },
      legend: { orientation: "h", y: -0.32, font: { size: 8 } },
      xaxis: { title: "Year", tickmode: "linear", tick0: YEAR_MIN, dtick: 2 },
      yaxis: { title: "Index (baseline = 100)", rangemode: "tozero" },
      shapes: [{ type: "line", x0: start, x1: end, y0: 100, y1: 100, line: { color: "#9cadad", dash: "dot", width: 1 } }],
    }), CHART_CONFIG);
    const focusName = countryByIso.get(state.focusIso)?.country || state.focusIso;
    const gdp = windowChange(state.focusIso, "gdp");
    const co2 = windowChange(state.focusIso, "co2");
    $("trajectory-insight").textContent = `${focusName}: GDP/person ${fmtPercent(gdp)}; CO₂/person ${fmtPercent(co2)} between ${start} and ${end}. The dashed line (when selected) is the comparison country.`;
    renderPeers();
  }

  function renderPeers() {
    const a = countryRecord(state.focusIso,state.year), b = countryRecord(state.compareIso,state.year), tbody = $('peer-table');
    const diff = (x,y) => 100*Math.abs(x-y)/((x+y)/2);
    const {start,end}=windowBounds();
    if(!a){tbody.innerHTML='<tr><td colspan="6">No matched observations for A in this year.</td></tr>';return;}
    const peers=selectedRows().filter(r=>r.iso!==a.iso&&r.gdp>0&&incomeGroupByIso.has(r.iso)&&(state.peerGroup==='all'||incomeGroupByIso.get(r.iso)===state.peerGroup)&&diff(a.gdp,r.gdp)<=state.peerTolerance*100).map(r=>({...r,gdpGap:diff(a.gdp,r.gdp),gap:r.co2-a.co2}));
    peers.sort((x,y)=>(state.peerSort==='gap'?Math.abs(y.gap)-Math.abs(x.gap):x.gdpGap-y.gdpGap)||x.country.localeCompare(y.country));
    tbody.innerHTML=peers.length?peers.map(r=>`<tr><td>${escapeHtml(r.country)}</td><td>$${fmtCompact(r.gdp)}</td><td>${fmt(r.co2,1)} t</td><td>${fmt(r.gdpGap,1)}%</td><td>${fmt(r.gap,1)} t</td><td><button type="button" class="window-button" data-compare-iso="${r.iso}">${r.iso===state.compareIso?'Selected as B':'Compare as B'}</button></td></tr>`).join(''):'<tr><td colspan="6">No candidates. No GDP-matched candidates within the fixed ±10% range. Change development group, region or year. Country B is not replaced automatically.</td></tr>';
  }

  function populateStructureOptions() {
    const options = [...countryByIso.values()]
      .filter(({ iso }) => sectorRows.has(iso) || energyByIso.has(iso))
      .sort((a, b) => a.country.localeCompare(b.country));
    for (const [selectId, stateKey] of [
      ["structure-country-a", "structureIso"],
      ["structure-country-b", "structureCompareIso"],
    ]) {
      const select = $(selectId);
      select.replaceChildren();
      for (const country of options) {
        const option = document.createElement("option");
        option.value = country.iso;
        option.textContent = country.country;
        select.append(option);
      }
      if (!options.some((country) => country.iso === state[stateKey])) {
        state[stateKey] = options[0]?.iso || "";
      }
      select.value = state[stateKey];
    }
  }

  function renderSectorProfile(iso, side) {
    const profile = sectorRows.get(iso);
    if (!profile) {
      plotly().react(`sector-chart-${side}`, [], makeLayout({ annotations: [{ text: "No sector-share data is available.", x: 0.5, y: 0.5, xref: "paper", yref: "paper", showarrow: false }] }), CHART_CONFIG);
      $(`sector-insight-${side}`).textContent = `${countryByIso.get(iso)?.country || iso} is not present in the supplied sector-share dataset.`;
      return;
    }
    const sectors = [
      { key: "Agriculture", label: "Agriculture", color: "#70a896" },
      { key: "Industry", label: "Industry (incl. manufacturing)", color: "#d9a153" },
      { key: "Services", label: "Services", color: "#438ca0" },
    ];
    const compositionForYear = (year) => {
      const values = sectors.map((sector) => profile.values[year]?.[sector.key]);
      if (values.some((value) => value === null || value === undefined || !Number.isFinite(value))) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return null;
      return values.map((value) => (value / total) * 100);
    };
    const traces = sectors.map((sector, index) => ({
      type: "bar",
      name: sector.label,
      x: YEARS,
      y: YEARS.map((year) => compositionForYear(year)?.[index] ?? null),
      marker: { color: sector.color },
      hovertemplate: `${sector.label}: %{y:.1f}% of the three reported sectors<br>%{x}<extra></extra>`,
    }));
    plotly().react(`sector-chart-${side}`, traces, makeLayout({
      margin: { t: 16, r: 15, b: 50, l: 58 },
      legend: { orientation: "h", y: -0.26, font: { size: 8 }, traceorder: "normal" },
      barmode: "stack",
      bargap: 0.18,
      xaxis: { title: "Year", tickmode: "linear", tick0: YEAR_MIN, dtick: 3 },
      yaxis: { title: "Share of reported sectors (%)", range: [0, 100], ticksuffix: "%" },
    }), CHART_CONFIG);
    const available = YEARS.filter((year) => compositionForYear(year) !== null).length;
    $(`sector-insight-${side}`).textContent = `${profile.name}: agriculture, industry (including manufacturing) and services are rescaled to 100% of these three reported sectors. Years missing an input are blank (${available} of 20 years). This is not a literal share of total GDP.`;
  }

  function renderStructure() {
    $("sector-country-a").textContent = countryByIso.get(state.structureIso)?.country || "Country A";
    $("sector-country-b").textContent = countryByIso.get(state.structureCompareIso)?.country || "Country B";
    renderSectorProfile(state.structureIso, "a");
    renderSectorProfile(state.structureCompareIso, "b");
    renderEnergyMix(state.structureIso, "a");
    renderEnergyMix(state.structureCompareIso, "b");
    renderKaya();
  }

  function renderEnergyMix(iso, side) {
    const profile = countryByIso.get(iso);
    $(`energy-mix-country-${side}`).textContent = profile?.country || `Country ${side.toUpperCase()}`;
    const measures = [
      { key: "coalShare", label: "Coal", color: "#64727b" },
      { key: "oilShare", label: "Oil", color: "#cf8052" },
      { key: "gasShare", label: "Natural gas", color: "#d8b15e" },
      { key: "nuclearShare", label: "Nuclear", color: "#8473a8" },
      { key: "renewablesShare", label: "Renewables", color: "#4b9c77" },
      { key: "otherShare", label: "Other / unlisted", color: "#c5cfce" },
    ];
    const sourceMeasures = measures.slice(0, 5);
    const compositionForYear = (year) => {
      const record = energyRecord(iso, year);
      const values = sourceMeasures.map((measure) => record?.[measure.key]);
      if (values.some((value) => value === null || value === undefined || !Number.isFinite(value) || value < 0)) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return null;
      const scale = total > 100 ? 100 / total : 1;
      return [...values.map((value) => value * scale), Math.max(0, 100 - total)];
    };
    const traces = measures.map((measure, index) => ({
      type: "bar",
      name: measure.label,
      x: YEARS,
      y: YEARS.map((year) => compositionForYear(year)?.[index] ?? null),
      marker: { color: measure.color },
      hovertemplate: `${measure.label}: %{y:.1f}% of total energy supply<br>%{x}<extra></extra>`,
    }));
    plotly().react(`energy-mix-chart-${side}`, traces, makeLayout({
      margin: { t: 16, r: 15, b: 50, l: 58 },
      legend: { orientation: "h", y: -0.26, font: { size: 8 }, traceorder: "normal" },
      barmode: "stack",
      bargap: 0.18,
      xaxis: { title: "Year", tickmode: "linear", tick0: YEAR_MIN, dtick: 3 },
      yaxis: { title: "Share of total energy supply (%)", range: [0, 100], ticksuffix: "%" },
    }), CHART_CONFIG);
    const availableYears = YEARS.filter((year) => compositionForYear(year) !== null);
    const renewableYears = YEARS
      .map((year) => ({ year, share: compositionForYear(year)?.[4] }))
      .filter((point) => point.share !== null && point.share !== undefined && Number.isFinite(point.share));
    if (!profile) {
      $(`energy-mix-insight-${side}`).textContent = `This country is not present in the matched energy dataset.`;
    } else if (renewableYears.length >= 2) {
      const first = renewableYears[0];
      const last = renewableYears.at(-1);
      const change = last.share - first.share;
      $(`energy-mix-insight-${side}`).textContent = `${profile.country}: renewables' share changed from ${fmt(first.share, 1)}% (${first.year}) to ${fmt(last.share, 1)}% (${last.year}), ${change > 0 ? "+" : ""}${fmt(change, 1)} percentage points. Bars total 100%; years missing source data are blank (${availableYears.length} of 20 available).`;
    } else {
      $(`energy-mix-insight-${side}`).textContent = `${profile.country}: complete source shares are available for ${availableYears.length} of 20 years, but there are too few renewable-share observations to compare. Missing years are blank.`;
    }
  }

  function renderKaya() {
    const { start } = windowBounds();
    const years = YEARS.filter((year) => year >= start && year <= windowBounds().end);
    const isos = [state.structureIso, state.structureCompareIso];
    const changes = [];
    for (const iso of isos) {
      const base = countryRecord(iso, start);
      const baseEnergy = energyRecord(iso, start);
      if (!base || !baseEnergy || base.gdp <= 0 || base.co2 <= 0 || baseEnergy.energyPerCapitaKwh <= 0) continue;
      for (const year of years) {
        const row = countryRecord(iso, year);
        const energy = energyRecord(iso, year);
        if (!row || !energy || row.gdp <= 0 || row.co2 <= 0 || energy.energyPerCapitaKwh <= 0) continue;
        changes.push(
          100 * Math.log(row.gdp / base.gdp),
          100 * Math.log((energy.energyPerCapitaKwh / row.gdp) / (baseEnergy.energyPerCapitaKwh / base.gdp)),
          100 * Math.log((row.co2 / energy.energyPerCapitaKwh) / (base.co2 / baseEnergy.energyPerCapitaKwh)),
          100 * Math.log(row.co2 / base.co2),
        );
      }
    }
    const minChange = Math.min(0, ...changes);
    const maxChange = Math.max(0, ...changes);
    const padding = (maxChange - minChange) * 0.08 || 1;
    const sharedYRange = changes.length ? [minChange - padding, maxChange + padding] : null;
    $("kaya-start-label").textContent = String(start);
    renderKayaCountry(isos[0], "a", sharedYRange);
    renderKayaCountry(isos[1], "b", sharedYRange);
  }

  function renderKayaCountry(iso, side, sharedYRange) {
    const { start, end } = windowBounds();
    const years = YEARS.filter((year) => year >= start && year <= end);
    const chartId = `kaya-chart-${side}`;
    const insightId = `kaya-insight-${side}`;
    const name = countryByIso.get(iso)?.country || iso;
    $(`kaya-country-${side}`).textContent = name || `Country ${side.toUpperCase()}`;
    const base = countryRecord(iso, start);
    const baseEnergy = energyRecord(iso, start);
    if (!base || !baseEnergy || base.gdp <= 0 || base.co2 <= 0 || baseEnergy.energyPerCapitaKwh <= 0) {
      plotly().react(chartId, [], makeLayout({
        annotations: [{ text: "Positive GDP, CO₂ and energy data are required for the baseline.", x: 0.5, y: 0.5, xref: "paper", yref: "paper", showarrow: false }],
      }), CHART_CONFIG);
      $(insightId).textContent = `The three-factor decomposition needs positive matched GDP, CO₂ and energy observations in ${start} for ${name}.`;
      return;
    }
    const gdpLog = [];
    const energyIntensityLog = [];
    const carbonIntensityLog = [];
    const co2Log = [];
    for (const year of years) {
      const row = countryRecord(iso, year);
      const energy = energyRecord(iso, year);
      if (!row || !energy || row.gdp <= 0 || row.co2 <= 0 || energy.energyPerCapitaKwh <= 0) {
        gdpLog.push(null);
        energyIntensityLog.push(null);
        carbonIntensityLog.push(null);
        co2Log.push(null);
        continue;
      }
      gdpLog.push(100 * Math.log(row.gdp / base.gdp));
      const energyIntensity = energy.energyPerCapitaKwh / row.gdp;
      const baseEnergyIntensity = baseEnergy.energyPerCapitaKwh / base.gdp;
      const carbonIntensity = row.co2 / energy.energyPerCapitaKwh;
      const baseCarbonIntensity = base.co2 / baseEnergy.energyPerCapitaKwh;
      energyIntensityLog.push(100 * Math.log(energyIntensity / baseEnergyIntensity));
      carbonIntensityLog.push(100 * Math.log(carbonIntensity / baseCarbonIntensity));
      co2Log.push(100 * Math.log(row.co2 / base.co2));
    }
    const traces = [
      { type: "scatter", mode: "lines+markers", name: "GDP/person", x: years, y: gdpLog, line: { color: "#168a8b", width: 2 }, marker: { size: 4 }, hovertemplate: "GDP/person log change: %{y:.1f} points<br>%{x}<extra></extra>" },
      { type: "scatter", mode: "lines+markers", name: "Energy intensity", x: years, y: energyIntensityLog, line: { color: "#d8a650", width: 2 }, marker: { size: 4 }, hovertemplate: "Energy intensity log change: %{y:.1f} points<br>%{x}<extra></extra>" },
      { type: "scatter", mode: "lines+markers", name: "Carbon intensity of energy", x: years, y: carbonIntensityLog, line: { color: "#9a6d9d", width: 2 }, marker: { size: 4 }, hovertemplate: "Carbon intensity log change: %{y:.1f} points<br>%{x}<extra></extra>" },
      { type: "scatter", mode: "lines", name: "CO₂/person total change", x: years, y: co2Log, line: { color: "#e18356", width: 2, dash: "dash" }, hovertemplate: "CO₂/person log change: %{y:.1f} points<br>%{x}<extra></extra>" },
    ];
    plotly().react(chartId, traces, makeLayout({
      margin: { t: 14, r: 12, b: 58, l: 57 },
      legend: { orientation: "h", y: -0.34, font: { size: 8 } },
      xaxis: { title: "Year", tickmode: "linear", dtick: 3 },
      yaxis: {
        title: "Cumulative log change (×100)",
        zeroline: true,
        ...(sharedYRange ? { range: sharedYRange } : {}),
      },
    }), CHART_CONFIG);
    const endRecord = countryRecord(iso, end);
    const endEnergy = energyRecord(iso, end);
    if (endRecord && endRecord.gdp > 0 && endRecord.co2 > 0 && endEnergy?.energyPerCapitaKwh > 0) {
      const gdpLog = 100 * Math.log(endRecord.gdp / base.gdp);
      const endEnergyIntensity = endEnergy.energyPerCapitaKwh / endRecord.gdp;
      const baseEnergyIntensity = baseEnergy.energyPerCapitaKwh / base.gdp;
      const energyLog = 100 * Math.log(endEnergyIntensity / baseEnergyIntensity);
      const endCarbonIntensity = endRecord.co2 / endEnergy.energyPerCapitaKwh;
      const baseCarbonIntensity = base.co2 / baseEnergy.energyPerCapitaKwh;
      const carbonLog = 100 * Math.log(endCarbonIntensity / baseCarbonIntensity);
      const co2Log = 100 * Math.log(endRecord.co2 / base.co2);
      const logPoints = (value) => `${value > 0 ? "+" : ""}${fmt(value, 1)}`;
      $(insightId).textContent = `${name}, ${start}–${end}: CO₂ per person changed by ${fmtPercent((endRecord.co2 / base.co2 - 1) * 100)}. GDP/person, energy/GDP and CO₂/energy changed by ${logPoints(gdpLog)}, ${logPoints(energyLog)} and ${logPoints(carbonLog)} log points (×100), summing to ${logPoints(co2Log)}.`;
    } else {
      $(insightId).textContent = `No positive matched energy, GDP and CO₂ endpoint data for ${name} in ${end}.`;
    }
  }

  function renderAll() {
    if (!plotly()) {
      setStatus("The local Plotly library did not load. Check assets/plotly.min.js.", "error");
      return;
    }

    renderMap();
    
    
    renderTrajectory();
    
    renderStructure();
    window.dispatchEvent(new CustomEvent("growth-carbon-data", {detail:{state:{...state},countries:countryByIso,income:incomeGroupByIso,record:countryRecord,energy:energyRecord,sectors:sectorRows,percentile:percentileValue}}));
  }

  function setFocusCountry(iso) {
    if (!countryByIso.has(iso) || state.focusIso === iso) return;
    state.focusIso = iso;
    state.structureIso = iso;
    $("structure-country-a").value = iso;
    $("country-select").value = iso;
    renderAll();
  }

  function setYear(year) {
    const clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, Number(year)));
    if (!Number.isInteger(clamped) || clamped === state.year) return;
    state.year = clamped;
    $("year-range").value = String(clamped);
    renderAll();
  }

  function loadWorldMap() {
    return fetchText("assets/world-map.svg?v=2").then((svg) => {
      const mapConfigs = [
        { id: "world-map-gdp", label: "GDP per person" },
        { id: "world-map-co2", label: "CO₂ emissions per person" },
      ];
      for (const config of mapConfigs) {
        const mapId = config.id;
        $(mapId).innerHTML = svg;
        const svgMap = $(mapId).querySelector("svg");
        svgMap.id = `${mapId}-svg`;
        svgMap.setAttribute("aria-label", `Interactive country map of ${config.label}`);
        const paths = $(mapId).querySelectorAll(".map-country");
        if (!paths.length) throw new Error(`The offline SVG map for ${mapId} contains no country boundaries.`);
      }
    });
  }

  function attachControls() {
    $("development-select").addEventListener("change", event => {state.developmentGroup=event.target.value;renderAll();});
    $("year-range").addEventListener("input", (event) => setYear(Number(event.target.value)));
    $("region-select").addEventListener("change", (event) => {
      state.region = event.target.value;
      renderAll();
    });
    $("country-select").addEventListener("change", (event) => setFocusCountry(event.target.value));
    $("compare-select").addEventListener("change", (event) => {
      state.compareIso = event.target.value;
      state.structureCompareIso = state.compareIso;
      $("structure-country-b").value = state.compareIso;
      renderAll();
    });
    $("trajectory-mode").addEventListener("change", (event) => {
      state.trajectoryMode = event.target.value;
      renderTrajectory();
    });
    $("structure-country-a").addEventListener("change", (event) => {
      state.structureIso = event.target.value;
      state.focusIso = state.structureIso;
      $("country-select").value = state.focusIso;
      renderAll();
    });
    $("structure-country-b").addEventListener("change", (event) => {
      state.structureCompareIso = event.target.value;
      state.compareIso = state.structureCompareIso;
      $("compare-select").value = state.compareIso;
      renderAll();
    });
    $("export-country").addEventListener("click", exportFocusCountry);
    $("reset-view").addEventListener("click", () => {
      state.developmentGroup = "all";
      $("development-select").value = "all";
      state.year = YEAR_MAX;
      state.region = ALL_REGION;
      state.focusIso = countryByIso.has("CHN") ? "CHN" : [...countryByIso.keys()][0];
      state.compareIso = countryByIso.has("USA") ? "USA" : "";
      state.structureIso = countryByIso.has("CHN") ? "CHN" : [...countryByIso.keys()][0];
      state.structureCompareIso = countryByIso.has("USA") ? "USA" : [...countryByIso.keys()][1] || state.structureIso;
      state.windowYears = 20;
      state.scatterIncomeGroup = "all";
      state.scatterLogGdp = false;
      $("year-range").value = String(YEAR_MAX);
      $("region-select").value = ALL_REGION;
      $("trajectory-mode").value = "both";
      $("country-select").value = state.focusIso;
      $("compare-select").value = state.compareIso;
      $("structure-country-a").value = state.structureIso;
      $("structure-country-b").value = state.structureCompareIso;
      renderAll();
    });
    document.querySelectorAll(".window-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.windowYears = Number(button.dataset.window);
        renderAll();
      });
    });
    $('peer-group').addEventListener('change',e=>{state.peerGroup=e.target.value;renderPeers();});
    $('peer-table').addEventListener('click',e=>{
      const button=e.target.closest('button[data-compare-iso]');if(!button)return;
      state.compareIso=button.dataset.compareIso;state.structureCompareIso=state.compareIso;
      $('compare-select').value=state.compareIso;$('structure-country-b').value=state.compareIso;
      renderAll();
    });
  }

  function exportFocusCountry() {
    const country = countryByIso.get(state.focusIso);
    const countryRows = byIso.get(state.focusIso) || [];
    if (!country || !countryRows.length) {
      setStatus("The selected country has no matched rows to export.", "error");
      return;
    }
    const columns = ["country", "iso3", "region", "year", "gdp_per_capita_2021_international_dollars", "co2_per_capita_tonnes"];
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csvRows = [columns.map(escapeCell).join(",")];
    for (const row of countryRows) {
      csvRows.push([
        row.country, row.iso, row.region, row.year, row.gdp, row.co2,
      ].map(escapeCell).join(","));
    }
    const blob = new Blob(["\uFEFF", csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${country.country.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-gdp-co2.csv`;
    link.style.position = "fixed";
    link.style.left = "-10000px";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`CSV download started: ${country.country}, ${countryRows.length} matched country-year rows.`, "ready");
  }

  async function initialize() {
    attachControls();
    try {
      const [gdpText, co2Text, structureText, energyText, incomeGroupText] = await Promise.all([
        fetchText("data/gdp-per-capita-worldbank.csv"),
        fetchText("data/co2-per-capita-marimekko.csv"),
        fetchText("data/worldbank.csv"),
        fetchText("data/owid-energy.csv"),
        fetchText("data/imf-development-groups-2024.csv"),
        loadWorldMap(),
      ]);
      const gdpRows = parseCsv(gdpText);
      const co2Rows = parseCsv(co2Text);
      prepareRecords(gdpRows, co2Rows);
      baselineGroups = quantileGroups();
      prepareSectorRows(parseCsv(structureText));
      prepareEnergyRows(parseCsv(energyText));
      prepareIncomeGroups(parseCsv(incomeGroupText));
      if (!records.length) throw new Error("No matching GDP and CO₂ records were found in the CSV files.");
      updateCountryOptions();
      populateStructureOptions();
      renderAll();
      const energyMatches = records.filter((row) => energyRecord(row.iso, row.year)?.energyPerCapitaKwh > 0).length;
      setStatus(
        `${records.length.toLocaleString()} GDP–CO₂ records; ${energyMatches.toLocaleString()} with energy data; ${sectorRows.size} matched countries with World Bank sector data.`,
        "ready"
      );
    } catch (error) {
      console.error("Could not initialize the Growth & Carbon dashboard:", error);
      setStatus(`${error.message} Start the static server from the web/ folder (see README.md).`, "error");
    }
  }

  initialize();
})();
