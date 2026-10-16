"""Produce the live 7-day forecast for the website.

Reads the history in ml/data/ (from fetch_data.py) and the models in ml/data/models/ (from train.py),
fetches the current weather forecast, and writes public/data/energy_forecast.json.

Per area the output has one entry per hour from 7 days ago to 7 days ahead:
  - price: actual where published (through tomorrow), otherwise the model's P10/P50/P90
  - co2:   actual where measured, Energinet's own prognosis for the rest of today, then the model

Usage:
  python ml/forecast.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from fetch_data import WEATHER_POINTS, WEATHER_VARS, get_json
from features import AREAS, KNOWN_OFFSET, LEADS, TZ, build_rows, to_local_hours

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
MODEL_DIR = DATA_DIR / "models"
OUT = ROOT.parent / "public" / "data" / "energy_forecast.json"
FORECAST_API = "https://api.open-meteo.com/v1/forecast"
ENERGINET = "https://api.energidataservice.dk/dataset"
HISTORY_DAYS = 7


def local_hours(dates: pd.DatetimeIndex) -> pd.DataFrame:
    """Every DK-local hour of the given dates, with the UTC time of each (DST-safe)."""
    start = dates.min().tz_localize(TZ)
    end = (dates.max() + pd.Timedelta(days=1)).tz_localize(TZ)
    times = pd.date_range(start, end, freq="h", inclusive="left").tz_convert("UTC")
    local = times.tz_convert(TZ)
    df = pd.DataFrame({"time": times, "date": local.tz_localize(None).normalize(), "hour": local.hour})
    return df.drop_duplicates(["date", "hour"])


def live_weather(history: pd.DataFrame, issue_date: pd.Timestamp) -> pd.DataFrame:
    """Historical forecast archive plus today's forecast, laid out in the training schema.

    For a future day at lead k (days after the issue date), today's forecast fills the `_d{k}` columns.
    """
    frames = []
    for name, (lat, lon) in WEATHER_POINTS.items():
        data = get_json(FORECAST_API, {"latitude": lat, "longitude": lon, "hourly": ",".join(WEATHER_VARS),
                                       "forecast_days": 10, "timezone": "GMT"})
        df = pd.DataFrame(data["hourly"])
        df["time"] = pd.to_datetime(df["time"], utc=True)
        frames.append(df.set_index("time").add_prefix(f"{name}_"))
    live = pd.concat(frames, axis=1).reset_index()
    live_date = live["time"].dt.tz_convert(TZ).dt.tz_localize(None).dt.normalize()
    live["lead"] = (live_date - issue_date).dt.days
    live = live[live["lead"].between(1, 7)]

    rows = []
    for lead, part in live.groupby("lead"):
        renamed = part.drop(columns="lead").rename(columns={c: f"{c}_d{lead}" for c in part.columns if c not in ("time", "lead")})
        rows.append(renamed)
    future = pd.concat(rows, ignore_index=True)
    past = history[history["time"] < future["time"].min()]
    return pd.concat([past, future], ignore_index=True)


def energinet_co2_prognosis() -> pd.DataFrame:
    data = get_json(f"{ENERGINET}/CO2EmisProg", {"start": "now-P1D", "end": "now+P2D", "limit": 0,
                                                 "columns": "Minutes5UTC,PriceArea,CO2Emission"})
    df = pd.DataFrame(data["records"]).rename(columns={"Minutes5UTC": "time", "PriceArea": "area", "CO2Emission": "co2"})
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.floor("h")
    return df.groupby(["time", "area"], as_index=False)["co2"].mean()


def household_tariffs(dates: pd.DatetimeIndex) -> dict[str, list[float]]:
    """Per DK date: the 24 hourly non-spot charges a Copenhagen household pays (DKK/kWh, excl. VAT).

    Radius' C-customer grid tariff (time-of-use) + Energinet transmission and system tariffs + electricity tax.
    """
    cols = "ChargeTypeCode,ValidFrom,ValidTo," + ",".join(f"Price{i}" for i in range(1, 25))
    radius = get_json(f"{ENERGINET}/DatahubPricelist", {
        "filter": json.dumps({"ChargeOwner": ["Radius Elnet A/S"], "ChargeTypeCode": ["DT_C_01"]}),
        "start": "2024-01-01", "limit": 0, "columns": cols})["records"]
    national = get_json(f"{ENERGINET}/DatahubPricelist", {
        "filter": json.dumps({"ChargeTypeCode": ["40000", "41000", "EA-001"]}),
        "start": "2024-01-01", "limit": 0, "columns": cols})["records"]

    def valid(records: list[dict], day: pd.Timestamp) -> list[dict]:
        iso = day.strftime("%Y-%m-%dT00:00:00")
        return [r for r in records if r["ValidFrom"] <= iso and (r["ValidTo"] is None or iso < r["ValidTo"])]

    out = {}
    for day in dates:
        grid = valid(radius, day)
        if not grid:
            continue
        hourly = [grid[0][f"Price{i}"] or grid[0]["Price1"] for i in range(1, 25)]
        flat = sum(r["Price1"] for code in ("40000", "41000", "EA-001")
                   for r in valid([x for x in national if x["ChargeTypeCode"] == code], day)[:1])
        out[str(day.date())] = [round(h + flat, 4) for h in hourly]
    return out


def predict_target(target: str, local: pd.DataFrame, weather: pd.DataFrame, issue_date: pd.Timestamp) -> pd.DataFrame:
    features = json.loads((MODEL_DIR / f"{target}_features.json").read_text())
    models = {q: lgb.Booster(model_file=str(MODEL_DIR / f"{target}_{q}.txt")) for q in ("p10", "p50", "p90")}
    margins = json.loads((MODEL_DIR / f"{target}_margins.json").read_text())

    dates = pd.DatetimeIndex([issue_date + pd.Timedelta(days=k) for k in LEADS[target]])
    hours = local_hours(dates)
    hours["lead"] = (hours["date"] - issue_date).dt.days
    targets = pd.concat([hours.assign(area=a) for a in AREAS], ignore_index=True)

    rows = build_rows(target, local, weather, targets)
    preds = np.column_stack([models[q].predict(rows[features]) for q in ("p10", "p50", "p90")])
    preds.sort(axis=1)
    # Conformal margins are a factor of each forecast's own P10-P90 width (see train.py).
    widen = rows["lead"].astype(str).map(margins).fillna(0).to_numpy() * np.clip(preds[:, 2] - preds[:, 0], 1, None)
    return rows[["time", "area", "lead"]].assign(p10=preds[:, 0] - widen, p50=preds[:, 1], p90=preds[:, 2] + widen)


def main() -> None:
    weather_hist = pd.read_parquet(DATA_DIR / "weather.parquet")
    prices = pd.read_parquet(DATA_DIR / "prices.parquet")
    co2 = pd.read_parquet(DATA_DIR / "co2.parquet")
    price_local = to_local_hours(prices, "price_dkk_mwh")
    co2_local = to_local_hours(co2, "co2_g_kwh")

    # Issue date = the day before the last fully published price day (normally today after ~13:00).
    complete = price_local.groupby(["date", "area"]).size().groupby("date").min()
    last_price_day = pd.Timestamp(complete[complete >= 23].index.max())
    issue_date = last_price_day - pd.Timedelta(days=KNOWN_OFFSET["price"])
    print(f"Issue date {issue_date.date()} (prices published through {last_price_day.date()})")

    weather = live_weather(weather_hist, issue_date)
    price_fc = predict_target("price", price_local, weather, issue_date)
    co2_fc = predict_target("co2", co2_local, weather, issue_date)
    prog = energinet_co2_prognosis()

    window = local_hours(pd.DatetimeIndex([issue_date - pd.Timedelta(days=HISTORY_DAYS), issue_date + pd.Timedelta(days=7)]))
    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "issue_date": str(issue_date.date()), "price_unit": "DKK/MWh", "co2_unit": "g/kWh",
           "vat": 0.25, "tariff_unit": "DKK/kWh excl. VAT",
           "tariffs_dk2_radius": household_tariffs(pd.DatetimeIndex(window["date"].unique())), "areas": {}}

    for area in AREAS:
        hours = window[["time"]].copy()
        p_act = prices[prices["area"] == area][["time", "price_dkk_mwh"]].rename(columns={"price_dkk_mwh": "price"})
        c_act = co2[co2["area"] == area][["time", "co2_g_kwh"]].rename(columns={"co2_g_kwh": "co2"})
        c_prog = prog[prog["area"] == area][["time", "co2"]].rename(columns={"co2": "co2_prog"})
        pf = price_fc[price_fc["area"] == area].drop(columns=["area", "lead"]).add_prefix("price_").rename(columns={"price_time": "time"})
        cf = co2_fc[co2_fc["area"] == area].drop(columns=["area", "lead"]).add_prefix("co2_").rename(columns={"co2_time": "time"})
        h = hours.merge(p_act, on="time", how="left").merge(pf, on="time", how="left")
        h = h.merge(c_act, on="time", how="left").merge(c_prog, on="time", how="left").merge(cf, on="time", how="left")

        # Prefer measured CO2, then Energinet's prognosis, then our model.
        h["co2_source"] = np.where(h["co2"].notna(), "actual", np.where(h["co2_prog"].notna(), "energinet", "model"))
        h["co2"] = h["co2"].fillna(h["co2_prog"])
        h.loc[h["co2_source"] != "model", ["co2_p10", "co2_p50", "co2_p90"]] = np.nan
        h.loc[h["price"].notna(), ["price_p10", "price_p50", "price_p90"]] = np.nan

        def col(name: str, digits: int) -> list:
            return [None if pd.isna(v) else round(float(v), digits) for v in h[name]]

        out["areas"][area] = {
            "time": [t.isoformat().replace("+00:00", "Z") for t in h["time"]],
            "price": col("price", 1), "price_p10": col("price_p10", 1),
            "price_p50": col("price_p50", 1), "price_p90": col("price_p90", 1),
            "co2": col("co2", 1), "co2_p10": col("co2_p10", 1),
            "co2_p50": col("co2_p50", 1), "co2_p90": col("co2_p90", 1),
            "co2_source": h["co2_source"].tolist(),
        }
        missing = h["price"].isna() & h["price_p50"].isna()
        print(f"  {area}: {len(h)} hours, {int(h['price'].notna().sum())} actual prices, "
              f"{int(h['price_p50'].notna().sum())} forecast, {int(missing.sum())} without price")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
