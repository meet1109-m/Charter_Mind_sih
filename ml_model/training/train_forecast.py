"""
Training Script for Baltic Dry Index (BDI) Freight Rate Forecasting Model.
Integrates exogenous Singapore VLSFO bunker fuel price benchmark features.
Uses chronological walk-forward cross-validation without data leakage.
Benchmarks 4 candidate models (Ridge, Linear Regression, Random Forest, Gradient Boosting)
and exports model artifacts and comprehensive metrics.
"""

import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import TimeSeriesSplit

try:
    from training.feature_engineering import (
        FEATURE_COLUMNS,
        create_time_series_features,
        get_feature_and_target_matrices,
    )
except ImportError:
    from feature_engineering import (
        FEATURE_COLUMNS,
        create_time_series_features,
        get_feature_and_target_matrices,
    )

BASE_DIR = Path(__file__).resolve().parent.parent
BDI_DATA_PATH = BASE_DIR / "data" / "bdi_index_monthly.csv"
BUNKER_DATA_PATH = BASE_DIR / "data" / "bunker_price_monthly.csv"
MODEL_PATH = BASE_DIR / "models" / "bdi_forecast_model.joblib"
METADATA_PATH = BASE_DIR / "models" / "model_metadata.json"
METRICS_PATH = BASE_DIR / "metrics" / "metrics.json"
FORECAST_METRICS_PATH = BASE_DIR / "metrics" / "bdi_forecast_metrics.json"


def directional_accuracy(y_true: np.ndarray, y_pred: np.ndarray, y_prev: np.ndarray) -> float:
    """Computes directional accuracy percentage compared to previous step."""
    true_direction = np.sign(y_true - y_prev)
    pred_direction = np.sign(y_pred - y_prev)
    return float(np.mean(true_direction == pred_direction) * 100.0)


def evaluate_split(y_true: np.ndarray, y_pred: np.ndarray, y_prev: np.ndarray) -> Dict[str, float]:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = float(mean_absolute_percentage_error(y_true, y_pred) * 100.0)
    r2 = float(r2_score(y_true, y_pred))
    da = directional_accuracy(y_true, y_pred, y_prev)
    return {"mae": mae, "rmse": rmse, "mape": mape, "r2": r2, "directional_accuracy": da}


def avg_metrics(metrics_list):
    return {
        "mean_mae": round(float(np.mean([m["mae"] for m in metrics_list])), 2),
        "mean_rmse": round(float(np.mean([m["rmse"] for m in metrics_list])), 2),
        "mean_mape": round(float(np.mean([m["mape"] for m in metrics_list])), 2),
        "mean_r2": round(float(np.mean([m["r2"] for m in metrics_list])), 3),
        "mean_directional_accuracy": round(
            float(np.mean([m["directional_accuracy"] for m in metrics_list])), 2
        ),
    }


def train_and_evaluate():
    print(f"Loading historical BDI dataset from: {BDI_DATA_PATH}")
    df_bdi = pd.read_csv(BDI_DATA_PATH)
    print(f"Raw BDI dataset rows: {len(df_bdi)}")

    df_bunker = None
    if BUNKER_DATA_PATH.exists():
        print(f"Loading exogenous bunker fuel price benchmark from: {BUNKER_DATA_PATH}")
        df_bunker = pd.read_csv(BUNKER_DATA_PATH)
        print(f"Raw Bunker price rows: {len(df_bunker)}")

    # Construct features with anti-leakage exogenous merging
    df_feat = create_time_series_features(df_bdi, df_bunker=df_bunker)
    print(f"Cleaned feature dataset rows: {len(df_feat)}")
    print(f"Features generated ({len(FEATURE_COLUMNS)}): {FEATURE_COLUMNS}")

    X, y = get_feature_and_target_matrices(df_feat)
    y_vals = y.values
    y_prev_vals = df_feat["lag_1"].values

    # Chronological TimeSeriesSplit (5 walk-forward splits)
    n_splits = 5
    tscv = TimeSeriesSplit(n_splits=n_splits)

    candidate_models = {
        "Ridge": Ridge(alpha=10.0),
        "Linear_Regression": LinearRegression(),
        "Random_Forest": RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42),
        "Gradient_Boosting": GradientBoostingRegressor(
            n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42
        ),
    }

    model_fold_metrics = {name: [] for name in candidate_models}
    naive_metrics = []
    seasonal_metrics = []

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]
        val_prev = y_prev_vals[val_idx]

        # Evaluate Candidate ML Models
        for name, model in candidate_models.items():
            # Clone model instance for fold
            import sklearn.base
            cloned = sklearn.base.clone(model)
            cloned.fit(X_train, y_train)
            pred = cloned.predict(X_val)
            model_fold_metrics[name].append(evaluate_split(y_val.values, pred, val_prev))

        # Baseline 1: Naive Persistence y_hat(t) = y(t-1)
        pred_naive = val_prev
        naive_metrics.append(evaluate_split(y_val.values, pred_naive, val_prev))

        # Baseline 2: Seasonal Naive y_hat(t) = y(t-12)
        pred_seasonal = df_feat["lag_12"].iloc[val_idx].values
        seasonal_metrics.append(evaluate_split(y_val.values, pred_seasonal, val_prev))

    # Compute averaged cross-validation performance metrics
    benchmarks_summary = {
        "Naive_Persistence": avg_metrics(naive_metrics),
        "Seasonal_Naive": avg_metrics(seasonal_metrics),
    }
    for name in candidate_models:
        benchmarks_summary[name] = avg_metrics(model_fold_metrics[name])

    print("\n--- Model Benchmark Comparison (5-Fold Walk-Forward Cross-Validation) ---")
    for name, m in benchmarks_summary.items():
        print(f"{name:<20}: {m}")

    # Train production model (Ridge with L2 regularization) on all data
    final_model = Ridge(alpha=10.0)
    final_model.fit(X, y)

    # Feature importances / coefficients
    importances = {
        col: round(float(coef), 4)
        for col, coef in zip(FEATURE_COLUMNS, final_model.coef_)
    }

    # Save serialized model artifact
    os.makedirs(MODEL_PATH.parent, exist_ok=True)
    os.makedirs(METRICS_PATH.parent, exist_ok=True)
    joblib.dump(final_model, MODEL_PATH)
    print(f"\nTrained model successfully saved to: {MODEL_PATH}")

    # Copy artifact to backend/app/ml_artifacts if directory exists
    backend_artifact_dir = BASE_DIR.parent / "backend" / "app" / "ml_artifacts"
    if backend_artifact_dir.exists():
        shutil.copy(MODEL_PATH, backend_artifact_dir / "bdi_forecast_model.joblib")

    # Build comprehensive model metadata
    metadata = {
        "model_name": "Ridge",
        "version": "1.1.0",
        "target": "Baltic Dry Index (BDI) Monthly Price",
        "training_date_range": {
            "start": str(df_feat["Date"].min().date()) if "Date" in df_feat else "2001-01-01",
            "end": str(df_feat["Date"].max().date()) if "Date" in df_feat else "2026-08-01",
            "total_observations": len(df_feat),
        },
        "features": FEATURE_COLUMNS,
        "feature_importances": importances,
        "model_hyperparameters": final_model.get_params(),
        "validation_protocol": "Chronological Walk-Forward Expanding Window (5 splits)",
        "candidate_models_evaluated": list(candidate_models.keys()),
        "benchmark_comparison": benchmarks_summary,
        "selected_model_metrics": benchmarks_summary["Ridge"],
        "last_known_bdi": float(y.iloc[-1]),
        "last_known_date": str(df_feat["Date"].iloc[-1].date()) if "Date" in df_feat else "2026-08-01",
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Model metadata saved to: {METADATA_PATH}")

    if backend_artifact_dir.exists():
        shutil.copy(METADATA_PATH, backend_artifact_dir / "model_metadata.json")

    metrics_payload = {
        "freight_forecast_model": metadata,
        "candidate_models": benchmarks_summary,
    }

    with open(FORECAST_METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"BDI Forecast Metrics saved to: {FORECAST_METRICS_PATH}")

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"Global Metrics saved to: {METRICS_PATH}")


if __name__ == "__main__":
    train_and_evaluate()
