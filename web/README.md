# Growth & Carbon — Group Visual Analytics

An offline-friendly, multi-section data-story website for the COMP7507 group project. The site reads its source CSV files from `data/`, uses a local Plotly.js bundle, and reuses an offline country-boundary SVG.

## Run locally

The browser restricts JavaScript `fetch()` calls from `file://` pages. Start a local static server from this directory instead:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>. If `py` is not available, use another Python installation:

```powershell
python -m http.server 8000
```

Stop the server with `Ctrl+C`.

The course E-drive Python can also run the server directly:

```powershell
& 'E:\schoolNEW\web_visualization_venv\Scripts\python.exe' -m http.server 8000
```

## Project structure

```text
web/
├── index.html
├── README.md
├── assets/
│   ├── plotly.min.js
│   └── world-map.svg
├── css/
│   └── styles.css
├── data/
│   ├── co2-per-capita-marimekko.csv
│   ├── gdp-per-capita-worldbank.csv
│   ├── owid-energy.csv
│   ├── owid-energy.codebook.csv
│   ├── worldbank.csv
│   ├── worldbank-income-groups-fy2024.csv
│   ├── worldbank-sector-shares.csv (legacy extract)
│   └── SOURCES.md
└── js/
    └── app.js
```

## Analysis and limitations

- The main analysis joins GDP per capita and territorial fossil-fuel/industry CO₂ per capita by ISO code and year. Only country-level ISO-3 entities are included in global samples; aggregate rows are not treated as countries.
- GDP per capita is measured in constant 2021 international dollars (PPP); CO₂ is measured in tonnes per person and excludes land-use change. Results describe associations, not causes.
- The World Bank sector data is loaded from `data/worldbank.csv`. The dashboard uses the four value-added shares for matched country ISO codes and excludes region/income aggregates and metadata rows.
- The OWID energy data powers country energy-mix comparisons and a three-factor Kaya accounting identity: `CO₂/person = GDP/person × energy/GDP × CO₂/energy`. Energy intensity in the Kaya identity is derived from energy supply and the dashboard's PPP GDP-per-person series; missing observations are left as gaps.
- GDP, total energy supply, and territorial CO₂ use different source definitions. Kaya components are an exact descriptive accounting identity for matched observations, not causal estimates or lifecycle emissions factors.
- Missing source values remain missing. Charts display only matched observations and report the available sample size.

See `data/SOURCES.md` for dataset provenance and indicator definitions.


## Development classification — current implementation
All development-group calculations and filters now use data/imf-development-groups-2024.csv, fixed to IMF WEO October 2024: Advanced = Developed; Emerging market and developing = Developing. The older World Bank income file is retained for provenance only and is not loaded. Unclassified territories are not assigned to the developing group. Earlier income-proxy descriptions above are superseded by this section.
Source: https://meetings.imf.org/en/-/media/files/publications/weo/2024/october/english/statsappendix.pdf