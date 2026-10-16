"""Download the raw data for the Green Energy Optimizer.

Sources (all free, no API key):
  - Energinet Energi Data Service: day-ahead prices and realised CO2 intensity for DK1/DK2
  - Open-Meteo Previous Runs API: weather forecasts as they were issued 1-7 days ahead

Everything is stored hourly in UTC as Parquet files in ml/data/.

Usage:
  python ml/fetch_data.py                      # full history from 2024-05-01 to today
  python ml/fetch_data.py --start 2026-09-01   # only a recent window
"""

from __future__ import annotations

import argparse
import re
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

DATA_DIR = Path(__file__).parent / "data"
ENERGINET = "https://api.energidataservice.dk/dataset"
PREVIOUS_RUNS = "https://previous-runs-api.open-meteo.com/v1/forecast"

AREAS = ["DK1", "DK2"]
# Energinet switched from hourly Elspotprices to 15-minute DayAheadPrices on this date (DK time).
DAYAHEAD_START = date(2025, 10, 1)

# Weather drives Nordic prices mostly through wind and solar output, plus heating demand.
WEATHER_POINTS = {
    "west_jutland": (56.09, 8.24),   # DK1 onshore/offshore wind
    "baltic_dk2": (55.00, 12.80),    # DK2 offshore wind (Kriegers Flak area)
    "copenhagen": (55.68, 12.57),    # DK2 demand: temperature
    "north_germany": (53.55, 9.99),  # coupled German market: wind
    "central_germany": (51.30, 9.50),  # coupled German market: solar
}
WEATHER_VARS = ["wind_speed_100m", "temperature_2m", "shortwave_radiation"]
LEAD_DAYS = range(1, 8)


def get_json(url: str, params: dict, max_tries: int = 6) -> dict:
    """GET with retries. Energinet answers 429 with 'Try again in N seconds'."""
    for attempt in range(max_tries):
        resp = requests.get(url, params=params, timeout=120)
        if resp.status_code == 429:
            match = re.search(r"(\d+) seconds", resp.text)
            wait = int(match.group(1)) + 5 if match else 60 * (attempt + 1)
            print(f"  rate limited, waiting {wait}s")
            time.sleep(wait)
            continue
        if resp.status_code >= 500:
            time.sleep(10 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Gave up on {url} after {max_tries} tries")


def energinet(dataset: str, start: date, end: date, columns: str) -> pd.DataFrame:
    """Fetch all rows of a dataset between start and end (DK dates, end exclusive)."""
    data = get_json(
        f"{ENERGINET}/{dataset}",
        {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "filter": '{"PriceArea":["DK1","DK2"]}',
            "columns": columns,
            "limit": 0,
        },
    )
    return pd.DataFrame(data["records"])


def fetch_prices(start: date, end: date) -> pd.DataFrame:
    """Hourly day-ahead price per area in DKK/MWh (15-min prices are averaged per hour)."""
    frames = []
    if start < DAYAHEAD_START:
        old = energinet("Elspotprices", start, min(end, DAYAHEAD_START), "HourUTC,PriceArea,SpotPriceDKK")
        old = old.rename(columns={"HourUTC": "time", "PriceArea": "area", "SpotPriceDKK": "price_dkk_mwh"})
        frames.append(old)
    if end > DAYAHEAD_START:
        new = energinet("DayAheadPrices", max(start, DAYAHEAD_START), end, "TimeUTC,PriceArea,DayAheadPriceDKK")
        new = new.rename(columns={"TimeUTC": "time", "PriceArea": "area", "DayAheadPriceDKK": "price_dkk_mwh"})
        frames.append(new)
    df = pd.concat(frames, ignore_index=True)
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.floor("h")
    return df.groupby(["time", "area"], as_index=False)["price_dkk_mwh"].mean()


def fetch_co2(start: date, end: date) -> pd.DataFrame:
    """Hourly realised CO2 intensity per area in g/kWh, fetched in 90-day chunks (5-min source data)."""
    frames = []
    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + timedelta(days=90), end)
        print(f"  CO2 {chunk_start} -> {chunk_end}")
        frames.append(energinet("CO2Emis", chunk_start, chunk_end, "Minutes5UTC,PriceArea,CO2Emission"))
        chunk_start = chunk_end
    df = pd.concat(frames, ignore_index=True)
    df = df.rename(columns={"Minutes5UTC": "time", "PriceArea": "area", "CO2Emission": "co2_g_kwh"})
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.floor("h")
    return df.groupby(["time", "area"], as_index=False)["co2_g_kwh"].mean()


def fetch_weather(start: date, end: date) -> pd.DataFrame:
    """Hourly weather forecasts per point, as issued 1-7 days before each hour.

    Column names look like `west_jutland_wind_speed_100m_d3`: the forecast issued 3 days earlier.
    """
    hourly = [f"{v}_previous_day{d}" for v in WEATHER_VARS for d in LEAD_DAYS]
    frames = []
    for name, (lat, lon) in WEATHER_POINTS.items():
        print(f"  weather {name}")
        data = get_json(
            PREVIOUS_RUNS,
            {
                "latitude": lat,
                "longitude": lon,
                "start_date": start.isoformat(),
                "end_date": (end - timedelta(days=1)).isoformat(),
                "hourly": ",".join(hourly),
                "timezone": "GMT",
            },
        )
        df = pd.DataFrame(data["hourly"])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df = df.set_index("time")
        df.columns = [f"{name}_{c.replace('_previous_day', '_d')}" for c in df.columns]
        frames.append(df)
        time.sleep(1)
    return pd.concat(frames, axis=1).reset_index()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=date.fromisoformat, default=date(2024, 5, 1))
    parser.add_argument("--end", type=date.fromisoformat, default=date.today() + timedelta(days=2),
                        help="exclusive; default includes tomorrow's already published prices")
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    print(f"Fetching {args.start} -> {args.end}")

    print("Prices")
    prices = fetch_prices(args.start, args.end)
    prices.to_parquet(DATA_DIR / "prices.parquet", index=False)

    print("CO2")
    co2 = fetch_co2(args.start, min(args.end, date.today() + timedelta(days=1)))
    co2.to_parquet(DATA_DIR / "co2.parquet", index=False)

    print("Weather")
    weather = fetch_weather(args.start, min(args.end, date.today() + timedelta(days=1)))
    weather.to_parquet(DATA_DIR / "weather.parquet", index=False)

    for label, df in [("prices", prices), ("co2", co2), ("weather", weather)]:
        print(f"{label:8s} {len(df):>7,} rows  {df['time'].min()} -> {df['time'].max()}  "
              f"null share {df.isna().mean().mean():.1%}")


if __name__ == "__main__":
    main()
