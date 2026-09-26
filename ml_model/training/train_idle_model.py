"""
Supervised Training Script for Port Anchorage Pre-Berthing Wait Time (Idle Predictor) Model.
Trains regression models to predict pre_berthing_wait_hours from empirical vessel port call records:
vessel_class, dwt, port_name, voyage_month, is_monsoon_period, weather_condition.
Evaluates Ridge, Random Forest, Gradient Boosting, and Linear Regression with cross-validation and holdout test splits.
Exports serialized model pipeline to ml_model/models/idle_model.joblib with metadata JSON and metrics.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import KFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "vessel_port_call_records.csv"
MODEL_PATH = BASE_DIR / "models" / "idle_model.joblib"
METADATA_PATH = BASE_DIR / "models" / "idle_model_metadata.json"
METRICS_PATH = BASE_DIR / "metrics" / "idle_model_metrics.json"

CATEGORICAL_FEATURES = [
    "vessel_class",
    "port_name",
    "weather_condition",
]

NUMERICAL_FEATURES = [
    "dwt",
    "voyage_month",
    "is_monsoon_period",
]

FEATURE_COLUMNS = CATEGORICAL_FEATURES + NUMERICAL_FEATURES
TARGET_COLUMN = "pre_berthing_wait_hours"


def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = float(mean_absolute_percentage_error(y_true, y_pred) * 100.0)
    r2 = float(r2_score(y_true, y_pred))
    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 2),
        "r2": round(r2, 4),
    }


def train_and_evaluate_idle_model():
    print("=" * 60)
    print("     CHARTERMIND PORT PRE-BERTHING WAIT TIME MODEL TRAINING")
    print("=" * 60)

    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training dataset missing at {DATA_PATH}")

    print(f"Loading vessel port call dataset from: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH)
    print(f"Raw dataset shape: {df.shape} ({len(df)} labeled observations)")

    # Clean and verify columns
    missing_cols = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns in dataset: {missing_cols}")

    df_clean = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN]).copy().reset_index(drop=True)
    df_clean["is_monsoon_period"] = df_clean["is_monsoon_period"].astype(int)
    print(f"Cleaned dataset rows: {len(df_clean)}")

    X = df_clean[FEATURE_COLUMNS]
    y = df_clean[TARGET_COLUMN].values

    # Train / Test split (80% Train, 20% Test)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, shuffle=True
    )
    print(f"Train split: {len(X_train)} samples | Test split: {len(X_test)} samples")

    # Column Preprocessor Pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(drop="first", sparse_output=False, handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
            ("num", StandardScaler(), NUMERICAL_FEATURES),
        ]
    )

    candidate_regressors = {
        "Ridge": Ridge(alpha=1.0),
        "Linear_Regression": LinearRegression(),
        "Random_Forest": RandomForestRegressor(n_estimators=120, max_depth=12, random_state=42),
        "Gradient_Boosting": GradientBoostingRegressor(
            n_estimators=150, max_depth=4, learning_rate=0.08, random_state=42
        ),
    }

    print("\n--- 5-Fold Cross-Validation Performance on Training Set ---")
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_benchmark_results = {}

    for name, reg in candidate_regressors.items():
        fold_scores = []
        for train_fold_idx, val_fold_idx in kf.split(X_train):
            X_tr, y_tr = X_train.iloc[train_fold_idx], y_train[train_fold_idx]
            X_va, y_va = X_train.iloc[val_fold_idx], y_train[val_fold_idx]

            fold_pipe = Pipeline([("preprocessor", preprocessor), ("regressor", reg)])
            fold_pipe.fit(X_tr, y_tr)
            pred_va = fold_pipe.predict(X_va)
            fold_scores.append(evaluate_predictions(y_va, pred_va))

        mean_mae = round(float(np.mean([s["mae"] for s in fold_scores])), 3)
        mean_rmse = round(float(np.mean([s["rmse"] for s in fold_scores])), 3)
        mean_r2 = round(float(np.mean([s["r2"] for s in fold_scores])), 4)
        cv_benchmark_results[name] = {"cv_mae": mean_mae, "cv_rmse": mean_rmse, "cv_r2": mean_r2}
        print(f"  {name:<20s} -> CV R² = {mean_r2:.4f} | CV MAE = {mean_mae:.3f} hrs | CV RMSE = {mean_rmse:.3f} hrs")

    print("\n--- Holdout Test Set Evaluation (20% Unseen Data) ---")
    test_results = {}
    trained_pipelines = {}

    for name, reg in candidate_regressors.items():
        pipe = Pipeline([("preprocessor", preprocessor), ("regressor", reg)])
        pipe.fit(X_train, y_train)
        pred_test = pipe.predict(X_test)
        metrics = evaluate_predictions(y_test, pred_test)
        test_results[name] = metrics
        trained_pipelines[name] = pipe
        print(f"  {name:<20s} -> Test R² = {metrics['r2']:.4f} | Test MAE = {metrics['mae']:.3f} hrs | Test RMSE = {metrics['rmse']:.3f} hrs")

    # Select best production model
    best_model_name = max(test_results, key=lambda k: test_results[k]["r2"])
    best_metrics = test_results[best_model_name]
    print(f"\nBest Performing Model: {best_model_name} (Test R² = {best_metrics['r2']:.4f})")

    # Fit selected production pipeline on full dataset
    final_pipeline = Pipeline([("preprocessor", preprocessor), ("regressor", candidate_regressors[best_model_name])])
    final_pipeline.fit(X, y)

    # Save model artifact
    os.makedirs(MODEL_PATH.parent, exist_ok=True)
    os.makedirs(METRICS_PATH.parent, exist_ok=True)
    joblib.dump(final_pipeline, MODEL_PATH)
    print(f"Trained model pipeline exported to: {MODEL_PATH}")

    # Build comprehensive metadata
    metadata = {
        "model_name": best_model_name,
        "pipeline_type": type(candidate_regressors[best_model_name]).__name__,
        "version": "1.0.0",
        "target": TARGET_COLUMN,
        "target_units": "hours",
        "training_samples": len(df_clean),
        "features": {
            "categorical": CATEGORICAL_FEATURES,
            "numerical": NUMERICAL_FEATURES,
            "all_features": FEATURE_COLUMNS,
        },
        "test_holdout_metrics": best_metrics,
        "candidate_models_benchmark": test_results,
        "cross_validation_5fold": cv_benchmark_results,
        "dataset_statistics": {
            "mean_wait_hours": round(float(np.mean(y)), 2),
            "std_wait_hours": round(float(np.std(y)), 2),
            "min_wait_hours": round(float(np.min(y)), 2),
            "max_wait_hours": round(float(np.max(y)), 2),
        },
    }

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Idle model metadata saved to: {METADATA_PATH}")

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Idle model metrics saved to: {METRICS_PATH}")

    print("\nTraining completed successfully!")
    print("=" * 60)
    return metadata


if __name__ == "__main__":
    train_and_evaluate_idle_model()
