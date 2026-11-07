# Data sources and definitions

## GDP per capita

- File: `gdp-per-capita-worldbank.csv`
- Dataset: Our World in Data Grapher, “GDP per capita – In constant international-$ – World Bank”
- Source: Eurostat, OECD, IMF, and World Bank (2026), with processing by Our World in Data
- Unit: constant 2021 international dollars per person (purchasing-power-parity adjusted)
- Coverage used here: 2005–2024
- Source page: <https://ourworldindata.org/grapher/gdp-per-capita-worldbank>
- The supplied CSV is the filtered course data file. This web project copies it from `../../gdp-per-capita-worldbank.filtered/`.

## CO₂ emissions per capita

- File: `co2-per-capita-marimekko.csv`
- Dataset: Our World in Data, “CO₂ emissions per capita”
- Source: Global Carbon Budget (2025), population based on multiple sources, with processing by Our World in Data
- Unit: tonnes of CO₂ per person
- Coverage used here: 2005–2024
- The series covers territorial emissions from fossil fuels and industrial processes. Land-use change and emissions embodied in imports are excluded; international aviation and shipping are included in global totals rather than individual-country series.
- Source page: <https://ourworldindata.org/grapher/co2-per-capita-marimekko>
- The supplied CSV is the filtered course data file. This web project copies it from `../../co2-per-capita-marimekko.filtered/`.

## Economic sector shares

- File: `worldbank.csv`
- Dataset: World Bank, World Development Indicators, value added by economic sector
- Indicators:
  - `NV.AGR.TOTL.ZS`: Agriculture, forestry, and fishing, value added (% of GDP)
  - `NV.IND.TOTL.ZS`: Industry (including construction), value added (% of GDP)
  - `NV.IND.MANF.ZS`: Manufacturing, value added (% of GDP)
  - `NV.SRV.TOTL.ZS`: Services, value added (% of GDP)
- Coverage used here: 2005–2024. The supplied wide CSV includes country rows, region/income aggregates, and metadata lines. Only ISO codes present in the matched country-level GDP–CO₂ data are used; non-country aggregate rows and metadata are ignored, and missing values remain missing.
- Source: <https://databank.worldbank.org/source/world-development-indicators>
- The older `worldbank-sector-shares.csv` extract is retained in the folder but is no longer used by the dashboard.

## Country development groups

- File: `worldbank-income-groups-fy2024.csv`
- Dataset: World Bank historical analytical classifications by development group
- Source: <https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups> (historical classification workbook, analytical classification sheet)

## Energy consumption and mix

- Files: `owid-energy.csv` and its `owid-energy.codebook.csv`
- Dataset: Our World in Data, Energy dataset
- Source page and downloads: <https://catalog.ourworldindata.org/energy/owid_energy/>
- The dashboard uses total energy supply per person (`total_energy_per_capita_kwh`) and the total-energy-supply shares for coal, oil, gas, nuclear, and renewables.
- Coverage used here: 2005–2024. The source also contains regions and aggregates; only ISO codes present in the matched country-level GDP–CO₂ data are used.
- The energy-mix chart is a 100% stacked bar chart. A year is shown only when all five source shares are present; any remainder below 100% is shown as “Other / unlisted”, and tiny totals above 100% from rounding are rescaled to 100%. Missing source shares are not imputed.
- The source combines the Energy Institute Statistical Review, historical energy reconstructions, U.S. EIA data, and population estimates. See the bundled codebook for field-level sources, units, and descriptions.

## Processing and derived measures

GDP and CO₂ are joined on ISO-3 code and year. Aggregate entity codes without three-letter ISO country codes are excluded from country-level charts and regressions. Records lacking either metric are not imputed.

- GDP–CO₂ correlation and R² are computed independently for each year and selected region from matched country rows. R² is the squared Pearson correlation, equivalent to the coefficient of determination for a one-predictor linear regression with an intercept.
- Index = 100 × value in year ÷ value in baseline year.
- YoY (%) = 100 × (value in year ÷ value in previous year − 1).
- CO₂ intensity of GDP = CO₂ per person ÷ GDP per person.
- Energy intensity = total energy supply per person ÷ GDP per person, using the dashboard's PPP-adjusted GDP series (kWh per constant 2021 international dollar).
- The GDP-composition chart compares agriculture, industry, and services value-added shares. Manufacturing is not stacked separately because it is already included in industry. For readability, the three reported sector shares are normalized to 100% for each complete year; the chart therefore shows their relative mix, not literal shares of total GDP. Years missing any sector input are left blank.
- Carbon intensity of energy = CO₂ per person ÷ total energy supply per person (tonnes of CO₂ per kWh).
- For matched positive observations, the displayed accounting identity is `CO₂/person = GDP/person × energy/GDP × CO₂/energy`. The Kaya chart plots each factor's cumulative log change; the three component changes therefore sum to the CO₂/person log change.
- The Kaya components are an accounting decomposition, not causal estimates. GDP, energy supply and territorial CO₂ come from different underlying sources and definitions; CO₂ per energy unit should not be interpreted as a complete lifecycle emissions factor.

## Reproducibility

The local Plotly.js and world map assets are stored under `assets/`. The page loads its source CSVs through relative paths from `data/`. The static site should therefore be served from this folder rather than opened through the `file://` protocol.


## Development classification — current implementation
All development-group calculations and filters now use data/imf-development-groups-2024.csv, fixed to IMF WEO October 2024: Advanced = Developed; Emerging market and developing = Developing. The older World Bank income file is retained for provenance only and is not loaded. Unclassified territories are not assigned to the developing group. Earlier income-proxy descriptions above are superseded by this section.
Source: https://meetings.imf.org/en/-/media/files/publications/weo/2024/october/english/statsappendix.pdf