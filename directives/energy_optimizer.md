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
2. **Train and backtest:** to be built (`ml/train.py`): "same hour last week" baseline vs LightGBM with quantile outputs (P10/P50/P90).
3. **Forecast:** to be built (`ml/forecast.py`): writes `public/data/energy_forecast.json` for the website.
4. **Schedule:** to be built: a daily GitHub Actions job running steps 1–3 after prices are published (~13:00 DK time) and committing the JSON. The commit triggers a Vercel redeploy.

## Outputs

- `ml/data/*.parquet`: intermediates, never committed
- `public/data/energy_forecast.json`: committed, read by the project page

## Edge cases and learnings

- **Energinet rate limit:** a few requests in quick succession return HTTP 429 with "Try again in N seconds" (seen: 300 s). `get_json` parses N and waits. Use few, large requests (`limit=0` returns all rows in the range).
- **Dataset switch on 2025-10-01:** prices move from hourly `Elspotprices` to 15-min `DayAheadPrices`. Verified continuous across the switch.
- **Time zones:** store everything in UTC. Energinet's `start`/`end` parameters are DK dates, so day counts look uneven at the window edges in UTC. This is expected.
- **Leakage:** train on the weather forecast that existed at issue time (`previous_dayN` matching the lead time), never on the observed weather.
