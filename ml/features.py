"""Feature engineering shared by training (train.py) and live forecasting (forecast.py).

A row is one target hour, for one area, at one lead time (days ahead of the issue day).
Every feature only uses information available at issue time (~13:00 DK time on the issue day):
  - prices are known through issue day + 1 (tomorrow's day-ahead auction is already published)
  - realised CO2 is known through issue day - 1 (last complete day)
  - weather comes from the forecast issued `lead` days before the target day
"""

from __future__ import annotations

import holidays
import numpy as np
import pandas as pd

TZ = "Europe/Copenhagen"
WIND_POINTS = ["west_jutland", "baltic_dk2", "north_germany"]
AREAS = ["DK1", "DK2"]

# Last fully known day relative to the issue day, per target.
KNOWN_OFFSET = {"price": 1, "co2": -1}
LEADS = {"price": range(2, 8), "co2": range(1, 8)}

CALENDAR_FEATURES = ["hour", "weekday", "month", "is_holiday", "lead", "area_code"]
LAG_FEATURES = ["lag_same_hour", "lag_day_mean", "lag_day_min", "lag_day_max", "lag_week_mean", "lag_last_week_same_hour"]
WEATHER_DAILY_FEATURES = ["wind_index_day", "wind_index_delta", "temp_cph_day", "solar_de_day"]


def to_local_hours(df: pd.DataFrame, value_col: str) -> pd.DataFrame:
    """Long hourly UTC data -> one row per (area, DK date, DK hour). DST duplicate hours are averaged."""
    local = df["time"].dt.tz_convert(TZ)
    out = df.assign(date=local.dt.tz_localize(None).dt.normalize(), hour=local.dt.hour)
    return out.groupby(["area", "date", "hour"], as_index=False).agg(
        value=(value_col, "mean"), time=("time", "first")
    )


def weather_long(weather: pd.DataFrame) -> pd.DataFrame:
    """Wide weather (`<point>_<var>_d<lead>` columns) -> long rows keyed by (time, lead)."""
    frames = []
    for lead in range(1, 8):
        suffix = f"_d{lead}"
        cols = [c for c in weather.columns if c.endswith(suffix)]
        part = weather[["time", *cols]].rename(columns={c: c[: -len(suffix)] for c in cols})
        frames.append(part.assign(lead=lead))
    w = pd.concat(frames, ignore_index=True)
    w["wind_index"] = w[[f"{p}_wind_speed_100m" for p in WIND_POINTS]].mean(axis=1)
    w["date"] = w["time"].dt.tz_convert(TZ).dt.tz_localize(None).dt.normalize()
    return w


def _weather_daily(w: pd.DataFrame) -> pd.DataFrame:
    return w.groupby(["date", "lead"], as_index=False).agg(
        wind_index_day=("wind_index", "mean"),
        temp_cph_day=("copenhagen_temperature_2m", "mean"),
        solar_de_day=("central_germany_shortwave_radiation", "mean"),
    )


def build_rows(target: str, local: pd.DataFrame, weather: pd.DataFrame, targets: pd.DataFrame | None = None) -> pd.DataFrame:
    """Build feature rows.

    local:   history from to_local_hours() (the lag source).
    targets: rows to build features for, with columns area, date, hour, time, lead.
             Defaults to every historical hour at every lead (training data, with `value` as the label).
    """
    offset = KNOWN_OFFSET[target]
    if targets is None:
        targets = pd.concat([local.assign(lead=k) for k in LEADS[target]], ignore_index=True)
    rows = targets.copy()
    rows["known_date"] = rows["date"] - pd.to_timedelta(rows["lead"] - offset, unit="D")
    rows["issue_date"] = rows["date"] - pd.to_timedelta(rows["lead"], unit="D")

    # Lags from the last fully known day.
    same_hour = local[["area", "date", "hour", "value"]].rename(columns={"date": "known_date", "value": "lag_same_hour"})
    rows = rows.merge(same_hour, on=["area", "known_date", "hour"], how="left")

    daily = local.groupby(["area", "date"])["value"].agg(["mean", "min", "max"]).reset_index()
    daily = daily.sort_values(["area", "date"])
    daily["week_mean"] = daily.groupby("area")["mean"].transform(lambda s: s.rolling(7, min_periods=4).mean())
    daily = daily.rename(columns={"date": "known_date", "mean": "lag_day_mean", "min": "lag_day_min",
                                  "max": "lag_day_max", "week_mean": "lag_week_mean"})
    rows = rows.merge(daily, on=["area", "known_date"], how="left")

    # Same hour one week before the target, only if it is already known at issue time.
    last_week = local[["area", "date", "hour", "value"]].rename(columns={"value": "lag_last_week_same_hour"})
    last_week["date"] = last_week["date"] + pd.Timedelta(days=7)
    rows = rows.merge(last_week, on=["area", "date", "hour"], how="left")
    unknown = rows["date"] - pd.Timedelta(days=7) > rows["known_date"]
    rows.loc[unknown, "lag_last_week_same_hour"] = np.nan

    # Weather forecast for the target hour, as issued `lead` days before.
    w = weather_long(weather)
    hourly_cols = [c for c in w.columns if c not in ("time", "lead", "date")]
    rows = rows.merge(w[["time", "lead", *hourly_cols]], on=["time", "lead"], how="left")
    wd = _weather_daily(w)
    rows = rows.merge(wd, on=["date", "lead"], how="left")
    # Wind on the last known day (lead-1 forecast as a proxy for what happened) to capture the change.
    known_wind = wd[wd["lead"] == 1][["date", "wind_index_day"]].rename(
        columns={"date": "known_date", "wind_index_day": "wind_known_day"})
    rows = rows.merge(known_wind, on="known_date", how="left")
    rows["wind_index_delta"] = rows["wind_index_day"] - rows["wind_known_day"]

    dk_holidays = holidays.Denmark(years=range(2023, 2031))
    rows["weekday"] = rows["date"].dt.weekday
    rows["month"] = rows["date"].dt.month
    rows["is_holiday"] = rows["date"].dt.date.map(lambda d: d in dk_holidays).astype(int)
    rows["area_code"] = rows["area"].map({a: i for i, a in enumerate(AREAS)})
    return rows


def feature_columns(rows: pd.DataFrame) -> list[str]:
    weather_hourly = [c for c in rows.columns if c.endswith(("_wind_speed_100m", "_temperature_2m", "_shortwave_radiation"))]
    return [*CALENDAR_FEATURES, *LAG_FEATURES, "wind_index", *weather_hourly, *WEATHER_DAILY_FEATURES]


def baseline(rows: pd.DataFrame) -> pd.Series:
    """Naive forecast: same hour last week, falling back to the same hour on the last known day."""
    return rows["lag_last_week_same_hour"].fillna(rows["lag_same_hour"])
