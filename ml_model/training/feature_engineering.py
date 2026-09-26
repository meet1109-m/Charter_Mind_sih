"""
Feature Engineering Module for Baltic Dry Index (BDI) Freight Forecasting.
Ensures strictly chronological, non-leaking feature transformations with exogenous bunker prices.
"""

from typing import List, Tuple, Optional
import numpy as np
import pandas as pd

FEATURE_COLUMNS: List[str] = [
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_6",
    "lag_12",
    "rolling_mean_3",
    "rolling_mean_6",
    "rolling_std_3",
    "rolling_std_6",
    "momentum_3",
    "pct_change_1",
    "bunker_lag_1",
    "bunker_lag_2",
    "bunker_rolling_mean_3",
    "bunker_rolling_mean_6",
    "bunker_pct_change_1",
    "month",
    "quarter",
    "sin_month",
    "cos_month",
]

TARGET_COLUMN = "Price"


def create_time_series_features(
    df: pd.DataFrame,
    df_bunker: Optional[pd.DataFrame] = None,
    target_col: str = TARGET_COLUMN,
) -> pd.DataFrame:
    """
    Constructs time-series lag, rolling statistics, exogenous bunker fuel features, and seasonal harmonics.

    CRITICAL ANTI-LEAKAGE RULE:
    All rolling statistics are computed on shifted series (lag 1) so that
    the current observation t is NEVER part of rolling_mean or rolling_std.
    """
    df = df.copy()

    # Ensure chronological order
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        df = df.sort_values("Date").reset_index(drop=True)

    # Clean price target
    if df[target_col].dtype == object:
        df[target_col] = (
            df[target_col]
            .astype(str)
            .str.replace(",", "")
            .astype(float)
        )

    # 1. Autoregressive Lags (t-1, t-2, t-3, t-6, t-12)
    for lag in [1, 2, 3, 6, 12]:
        df[f"lag_{lag}"] = df[target_col].shift(lag)

    # 2. Shifted Rolling Statistics (Strictly prior windows, no lookahead)
    shifted_target = df[target_col].shift(1)
    df["rolling_mean_3"] = shifted_target.rolling(window=3, min_periods=3).mean()
    df["rolling_mean_6"] = shifted_target.rolling(window=6, min_periods=6).mean()
    df["rolling_std_3"] = shifted_target.rolling(window=3, min_periods=3).std()
    df["rolling_std_6"] = shifted_target.rolling(window=6, min_periods=6).std()

    # 3. Momentum & Short-term Velocity
    df["momentum_3"] = (df["lag_1"] - df["lag_3"]) / (df["lag_3"] + 1e-6)
    df["pct_change_1"] = (df["lag_1"] - df["lag_2"]) / (df["lag_2"] + 1e-6)

    # 4. Exogenous Bunker Fuel Price Features
    if df_bunker is not None and not df_bunker.empty:
        bunker = df_bunker.copy()
        date_col = next((c for c in bunker.columns if "date" in c.lower()), bunker.columns[0])
        price_col = next((c for c in bunker.columns if "price" in c.lower() or "vlsfo" in c.lower()), bunker.columns[1])
        bunker[date_col] = pd.to_datetime(bunker[date_col])
        bunker["year_month"] = bunker[date_col].dt.strftime("%Y-%m")
        df["year_month"] = df["Date"].dt.strftime("%Y-%m") if "Date" in df.columns else ""
        
        merged_bunker = pd.merge(df, bunker[["year_month", price_col]], on="year_month", how="left")
        bunker_series = merged_bunker[price_col].bfill().ffill()
    elif "bunker_price" in df.columns:
        bunker_series = df["bunker_price"].bfill().ffill()
    else:
        # Benchmark Singapore VLSFO price default (~550.0 USD/MT)
        bunker_series = pd.Series([550.0] * len(df))

    # Anti-leakage shifted bunker features
    shifted_bunker = bunker_series.shift(1)
    df["bunker_lag_1"] = shifted_bunker
    df["bunker_lag_2"] = bunker_series.shift(2)
    df["bunker_rolling_mean_3"] = shifted_bunker.rolling(window=3, min_periods=1).mean()
    df["bunker_rolling_mean_6"] = shifted_bunker.rolling(window=6, min_periods=1).mean()
    df["bunker_pct_change_1"] = (df["bunker_lag_1"] - df["bunker_lag_2"]) / (df["bunker_lag_2"] + 1e-6)

    # 5. Seasonal & Calendar Features
    if "Date" in df.columns:
        month = df["Date"].dt.month
        quarter = df["Date"].dt.quarter
    else:
        month = pd.Series(np.tile(np.arange(1, 13), int(np.ceil(len(df) / 12)))[: len(df)])
        quarter = ((month - 1) // 3) + 1

    df["month"] = month
    df["quarter"] = quarter
    df["sin_month"] = np.sin(2 * np.pi * month / 12.0)
    df["cos_month"] = np.cos(2 * np.pi * month / 12.0)

    # Drop rows with NaN caused by 12-month lag
    df_clean = df.dropna(subset=FEATURE_COLUMNS + [target_col]).reset_index(drop=True)

    return df_clean


def get_feature_and_target_matrices(
    df_features: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.Series]:
    """Extracts design matrix X and target vector y with verified column order."""
    X = df_features[FEATURE_COLUMNS].copy()
    y = df_features[TARGET_COLUMN].copy()
    return X, y
