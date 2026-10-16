# Green Energy Optimizer

## Goal

Forecast Danish day-ahead electricity prices (DK1/DK2) and CO₂ intensity for the next 7 days, and power a planner on the website that finds the cheapest/greenest hours to run a device (EV charging, heat pump). Show forecast accuracy against a naive baseline, honestly.

Tomorrow's prices are already published (~13:00 DK time the day before), so day 1 is shown as actual prices. The model's job is **days 2–7**.

## Inputs (all free, no API key)

| Data | Source | Notes |
|---|---|---|
| Day-ahead prices | Energinet `Elspotprices` (hourly, until 2025-09-30) and `DayAheadPrices` (15-min, from 2025-10-01) | Merged and averaged to hourly DKK/MWh |
| CO₂ intensity | Energinet `CO2Emis` (5-min realised) | Averaged to hourly g/kWh. `CO2EmisProg` only covers today |
| Weather forecasts | Open-Meteo Previous Runs API | Forecasts as issued 1–7 days ahead (`*_previous_dayN`). Archive starts around spring 2024 |

Weather points: West Jutland, Baltic DK2 (offshore wind), Copenhagen, North Germany, Central Germany. Variables: wind speed at 100 m, temperature at 2 m, shortwave radiation.

## Steps

1. **Fetch data:** `ml/.venv/Scripts/python.exe ml/fetch_data.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]`
   - Default: 2024-05-01 to the day after tomorrow (exclusive). Writes `ml/data/prices.parquet`, `co2.parquet`, `weather.parquet`, all hourly in UTC.
   - A full history run takes several minutes because of rate limits.
   - `--incremental` refreshes only the last 14 days and merges into the existing files (about 10 s). Falls back to a full fetch if any file is missing. The workflow uses this with `actions/cache` holding `ml/data/*.parquet` between runs.
2. **Train and backtest:** `cd ml && ../ml/.venv/Scripts/python.exe train.py` (about 7 minutes locally)
   - Feature logic lives in `ml/features.py` and is shared with `forecast.py`. Change features there only.
   - Rolling-origin backtest: 12 monthly folds (+2 warm-up folds for calibration). Each fold trains only on targets before the fold starts.
   - LightGBM quantile models (P10/P50/P90) for `price` (leads 2–7) and `co2` (leads 1–7) vs the baseline "same hour last week".
   - Conformal calibration: P10–P90 is widened per lead by a factor of its own width, fitted on the last 3 out-of-sample months.
   - Writes `public/data/energy_backtest.json`, models + margins to `ml/data/models/`, raw backtest predictions to `ml/data/backtest_raw_*.parquet` (use these to test calibration ideas without retraining).
3. **Forecast:** `cd ml && python forecast.py`: fetches today's Open-Meteo forecast, Energinet's CO₂ prognosis and Radius/Energinet tariffs, writes `public/data/energy_forecast.json` (~56 KB).
4. **Schedule:** `.github/workflows/energy-forecast.yml` runs steps 1–3 daily at 12:30 UTC and commits the two JSON files as Gambooi, which redeploys Vercel. Can be started manually (workflow_dispatch).

## Outputs

- `ml/data/*.parquet`, `ml/data/models/`: intermediates, never committed
- `public/data/energy_forecast.json`, `public/data/energy_backtest.json`: committed, read at build time by the project page (`src/components/energy/`)

## Current results (backtest Oct 2025 – Sep 2026)

- Price: MAE 202 vs 303 DKK/MWh baseline (33% better). Charging in the 4 cheapest forecast hours captures 89% of possible savings (baseline 80%). P10–P90 coverage 77% (target 80%).
- CO₂: MAE 29 vs 45 g/kWh (35% better). Coverage 80%.

## Edge cases and learnings

- **Open-Meteo timeouts:** requesting 2.5 years × 21 variables per point in one call timed out (>120 s) on GitHub Actions. Weather is fetched in 182-day chunks, and `get_json` retries timeouts/connection errors with backoff. Even chunked, a full fetch on Actions hit 7 timeouts and took 34 min in total, which is why daily runs are incremental with a cache.
- **Energinet rate limit:** a few requests in quick succession return HTTP 429 with "Try again in N seconds" (seen: 300 s). `get_json` parses N and waits. Use few, large requests (`limit=0` returns all rows in the range).
- **Dataset switch on 2025-10-01:** prices move from hourly `Elspotprices` to 15-min `DayAheadPrices`. Verified continuous across the switch.
- **Time zones:** store everything in UTC. Energinet's `start`/`end` parameters are DK dates, so day counts look uneven at the window edges in UTC. This is expected.
- **Leakage:** train on the weather forecast that existed at issue time (`previous_dayN` matching the lead time), never on the observed weather. Sanity check: error must grow with lead time.
- **Calibration:** raw quantile bands cover only ~59% (overconfident). An expanding-window conformal correction reached 71%; recent-3-months + width-scaled reached 77% for price and 80% for CO₂. Price drift is why price stays under target. Next idea if needed: adaptive conformal inference.
- **Household price:** `DatahubPricelist`. Radius C-customer tariff is `ChargeOwner="Radius Elnet A/S"`, `ChargeTypeCode="DT_C_01"` (seasonal, changes Apr/Oct). National charges have no ChargeOwner; find them by code: `40000` transmission, `41000` system tariff, `EA-001` electricity tax (0.008 DKK/kWh in 2026–2027). VAT 25% on everything. Filtering on ChargeOwner for Energinet returns nothing.
- **Dependencies:** pandas 2.3.3 needs numpy 2.3.x (numpy 2.5 raises deprecation errors on `pd.Timedelta`). LightGBM's sklearn wrapper needs scikit-learn, so the scripts use `lgb.train` instead.
- **Screenshots:** headless Edge cannot lay out narrower than ~500 px; for phone-width checks, load the page in a 390 px iframe.
