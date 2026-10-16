"""Backtest and train the price and CO2 forecasting models.

1. Rolling-origin backtest over the last 12 months: for each month, train only on data that was
   known before that month starts, then forecast every issue day in the month. This mimics how
   the model runs in production.
2. Compare against the naive baseline (same hour last week).
3. Train final models on all data and save them for forecast.py.

Usage:
  python ml/train.py              # backtest + final models
  python ml/train.py --no-backtest
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from features import baseline, build_rows, feature_columns, to_local_hours

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
MODEL_DIR = DATA_DIR / "models"
PUBLIC_DIR = ROOT.parent / "public" / "data"

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
PARAMS = dict(learning_rate=0.05, num_leaves=31, min_data_in_leaf=50,
              bagging_fraction=0.8, bagging_freq=1, feature_fraction=0.8, verbose=-1)
NUM_ROUNDS = 500
BACKTEST_MONTHS = 12
WARMUP_MONTHS = 2  # extra backtest folds used only to calibrate the first reported folds
COVERAGE = 0.8  # target share of actuals inside the P10-P90 band
CALIBRATION_MONTHS = 3  # prices drift, so calibrate on recent folds only (tested: beats an expanding window)
CHARGE_HOURS = 4  # decision metric: pick the 4 cheapest hours of a day


def load_rows() -> dict[str, pd.DataFrame]:
    weather = pd.read_parquet(DATA_DIR / "weather.parquet")
    sources = {
        "price": to_local_hours(pd.read_parquet(DATA_DIR / "prices.parquet"), "price_dkk_mwh"),
        "co2": to_local_hours(pd.read_parquet(DATA_DIR / "co2.parquet"), "co2_g_kwh"),
    }
    out = {}
    for target, local in sources.items():
        rows = build_rows(target, local, weather)
        # Need the label, the main lags and a weather forecast for the target hour.
        rows = rows.dropna(subset=["value", "lag_same_hour", "lag_week_mean", "wind_index"])
        out[target] = rows.reset_index(drop=True)
    return out


def fit(rows: pd.DataFrame, features: list[str]) -> dict[str, lgb.Booster]:
    data = lgb.Dataset(rows[features], rows["value"], free_raw_data=False)
    return {
        name: lgb.train({"objective": "quantile", "alpha": alpha, **PARAMS}, data, num_boost_round=NUM_ROUNDS)
        for name, alpha in QUANTILES.items()
    }


def predict(models: dict[str, lgb.Booster], rows: pd.DataFrame, features: list[str]) -> pd.DataFrame:
    preds = np.column_stack([models[q].predict(rows[features]) for q in QUANTILES])
    preds.sort(axis=1)  # quantile models are trained separately; prevent crossing
    return pd.DataFrame(preds, columns=list(QUANTILES), index=rows.index)


def band_width(df: pd.DataFrame) -> pd.Series:
    return (df["p90"] - df["p10"]).clip(lower=1)


def conformity(df: pd.DataFrame) -> pd.Series:
    """How far the actual fell outside the raw P10-P90 band, relative to the band's width (negative = inside)."""
    return np.maximum(df["p10"] - df["value"], df["value"] - df["p90"]) / band_width(df)


def margins(df: pd.DataFrame) -> dict[int, float]:
    """Conformalized quantile regression (scaled): per lead, the factor of band width to widen by
    so that COVERAGE of past actuals fall inside."""
    return {int(lead): float(np.quantile(conformity(g), COVERAGE)) for lead, g in df.groupby("lead")}


def apply_margins(df: pd.DataFrame, m: dict[int, float]) -> pd.DataFrame:
    widen = df["lead"].map(m).fillna(0) * band_width(df)
    return df.assign(p10=df["p10"] - widen, p90=df["p90"] + widen)


def backtest(rows: pd.DataFrame, features: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (calibrated results for the reported folds, raw results for all folds)."""
    last_issue = rows["issue_date"].max()
    folds = pd.date_range(end=last_issue, periods=BACKTEST_MONTHS + WARMUP_MONTHS + 1, freq="MS")
    raw = []
    for start, end in zip(folds[:-1], folds[1:]):
        train = rows[rows["date"] < start]
        test = rows[(rows["issue_date"] >= start) & (rows["issue_date"] < end)]
        if test.empty:
            continue
        print(f"  fold {start:%Y-%m}: train {len(train):,}  test {len(test):,}")
        preds = predict(fit(train, features), test, features)
        raw.append(test.join(preds).assign(baseline=baseline(test)))

    # Each fold is calibrated only with earlier folds, which were themselves out-of-sample.
    calibrated = [apply_margins(fold, margins(pd.concat(raw[max(0, i - CALIBRATION_MONTHS):i])))
                  for i, fold in enumerate(raw) if i >= WARMUP_MONTHS]
    return pd.concat(calibrated), pd.concat(raw)


def summarize(bt: pd.DataFrame, target: str) -> dict:
    def mae(col: str, df: pd.DataFrame = bt) -> float:
        return float((df[col] - df["value"]).abs().mean())

    per_lead = []
    for lead, g in bt.groupby("lead"):
        m, b = mae("p50", g), mae("baseline", g)
        per_lead.append({"lead": int(lead), "mae_model": round(m, 1), "mae_baseline": round(b, 1),
                         "skill": round(1 - m / b, 3),
                         "coverage_p10_p90": round(float(((g["value"] >= g["p10"]) & (g["value"] <= g["p90"])).mean()), 3)})
    m, b = mae("p50"), mae("baseline")
    summary = {
        "target": target,
        "unit": "DKK/MWh" if target == "price" else "g/kWh",
        "period": [str(bt["issue_date"].min().date()), str(bt["issue_date"].max().date())],
        "rows": int(len(bt)),
        "mae_model": round(m, 1),
        "mae_baseline": round(b, 1),
        "skill": round(1 - m / b, 3),
        "coverage_p10_p90": round(float(((bt["value"] >= bt["p10"]) & (bt["value"] <= bt["p90"])).mean()), 3),
        "per_lead": per_lead,
        "per_month": [{"month": str(month), "mae_model": round(mae("p50", g), 1), "mae_baseline": round(mae("baseline", g), 1)}
                      for month, g in bt.groupby(bt["issue_date"].dt.to_period("M"))],
    }
    if target == "price":
        summary["charging"] = charging_savings(bt)
    return summary


def charging_savings(bt: pd.DataFrame) -> dict:
    """If you charge in the 4 hours a forecast says are cheapest, how much of the possible saving do you get?

    Saving is measured against paying the day's average price. 100% = what perfect foresight gets.
    """
    captured = {"model": [], "baseline": []}
    for _, day in bt.groupby(["area", "date", "lead"]):
        if len(day) < 20:
            continue
        actual = day["value"].to_numpy()
        avg, best = actual.mean(), np.sort(actual)[:CHARGE_HOURS].mean()
        if avg - best < 1:
            continue
        for name, col in [("model", "p50"), ("baseline", "baseline")]:
            chosen = actual[np.argsort(day[col].to_numpy())[:CHARGE_HOURS]].mean()
            captured[name].append((avg - chosen) / (avg - best))
    return {f"captured_{k}": round(float(np.mean(v)), 3) for k, v in captured.items()} | {"hours": CHARGE_HOURS}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-backtest", action="store_true")
    args = parser.parse_args()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    all_rows = load_rows()

    if not args.no_backtest:
        report = {}
        for target, rows in all_rows.items():
            print(f"Backtest {target}")
            features = feature_columns(rows)
            bt, raw = backtest(rows, features)
            raw.to_parquet(DATA_DIR / f"backtest_raw_{target}.parquet", index=False)
            report[target] = summarize(bt, target)
            # Production margins use the most recent out-of-sample folds.
            recent = raw[raw["issue_date"] >= raw["issue_date"].max() - pd.DateOffset(months=CALIBRATION_MONTHS)]
            (MODEL_DIR / f"{target}_margins.json").write_text(json.dumps(margins(recent)))
            s = report[target]
            print(f"  MAE model {s['mae_model']} vs baseline {s['mae_baseline']} {s['unit']}  "
                  f"skill {s['skill']:.1%}  P10-P90 coverage {s['coverage_p10_p90']:.1%}")
            for row in s["per_lead"]:
                print(f"    lead {row['lead']}: model {row['mae_model']:>7}  baseline {row['mae_baseline']:>7}  "
                      f"skill {row['skill']:>6.1%}  coverage {row['coverage_p10_p90']:.1%}")
            if "charging" in s:
                print(f"  charging: model captures {s['charging']['captured_model']:.1%} of possible savings, "
                      f"baseline {s['charging']['captured_baseline']:.1%}")
        (PUBLIC_DIR / "energy_backtest.json").write_text(json.dumps(report, indent=2))

    for target, rows in all_rows.items():
        print(f"Final model {target}: {len(rows):,} rows")
        features = feature_columns(rows)
        for name, model in fit(rows, features).items():
            model.save_model(MODEL_DIR / f"{target}_{name}.txt")
        (MODEL_DIR / f"{target}_features.json").write_text(json.dumps(features))


if __name__ == "__main__":
    main()
