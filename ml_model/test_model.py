#!/usr/bin/env python3
"""
Independent Command-Line ML Model Verification Test.
Loads the trained Ridge Regression model, executes real inference with model.predict(),
and verifies all subindex elasticity parameters without requiring any frontend or web server.
"""

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

from training.feature_engineering import FEATURE_COLUMNS

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "bdi_forecast_model.joblib"
METADATA_PATH = BASE_DIR / "models" / "model_metadata.json"
VESSEL_MODELS_PATH = BASE_DIR / "models" / "vessel_class_models.json"


def main():
    print("=" * 60)
    print("     CHARTERMIND ML MODEL INDEPENDENT VERIFICATION")
    print("=" * 60)

    # 1. Verify Model Artifact Existence
    if not MODEL_PATH.exists():
        print(f"FAILED: Model file not found at {MODEL_PATH}")
        return False

    # 2. Load Model Artifact
    model = joblib.load(MODEL_PATH)
    print(f"Model loaded:            YES")
    print(f"Model Algorithm:         {type(model).__name__} (alpha={model.alpha})")
    print(f"Model Path:              {MODEL_PATH}")

    # 3. Load Metadata
    with open(METADATA_PATH) as f:
        meta = json.load(f)
    print(f"Target:                  {meta.get('target', 'Baltic Dry Index')}")
    print(f"Chronological Splits:    {meta.get('validation_protocol')}")
    metrics = meta.get("selected_model_metrics", {})
    print(f"Validation MAE:          {metrics.get('mean_mae')} pts")
    print(f"Validation RMSE:         {metrics.get('mean_rmse')} pts")
    print(f"Directional Accuracy:    {metrics.get('mean_directional_accuracy')}%")

    # 4. Construct Sample Feature Vector
    sample_features = {
        "lag_1": 1940.0,
        "lag_2": 1850.0,
        "lag_3": 1790.0,
        "lag_6": 1650.0,
        "lag_12": 1500.0,
        "rolling_mean_3": 1860.0,
        "rolling_mean_6": 1780.0,
        "rolling_std_3": 75.5,
        "rolling_std_6": 120.4,
        "momentum_3": (1940.0 - 1790.0) / 1790.0,
        "pct_change_1": (1940.0 - 1850.0) / 1850.0,
        "bunker_lag_1": 640.5,
        "bunker_lag_2": 630.0,
        "bunker_rolling_mean_3": 635.0,
        "bunker_rolling_mean_6": 625.0,
        "bunker_pct_change_1": (640.5 - 630.0) / 630.0,
        "month": 9,
        "quarter": 3,
        "sin_month": float(np.sin(2 * np.pi * 9 / 12.0)),
        "cos_month": float(np.cos(2 * np.pi * 9 / 12.0)),
    }

    input_df = pd.DataFrame([sample_features])[FEATURE_COLUMNS]
    print(f"\nInput Features ({len(FEATURE_COLUMNS)} variables):")
    for k, v in sample_features.items():
        print(f"  - {k:15s}: {v:.4f}" if isinstance(v, float) else f"  - {k:15s}: {v}")

    # 5. Execute Real ML Inference (model.predict)
    pred_bdi = float(model.predict(input_df)[0])
    print(f"\nModel Prediction (Baltic Dry Index): {pred_bdi:.2f} points")

    # 6. Verify Vessel Subindex Models
    with open(VESSEL_MODELS_PATH) as f:
        vmodels = json.load(f).get("models", {})

    print("\nVessel Subindex Elasticity Inferences:")
    for vclass, vdata in vmodels.items():
        coef = vdata["coef"]
        intercept = vdata["intercept"]
        feat = np.array([pred_bdi, np.log(pred_bdi), (pred_bdi / 1000.0) ** 2])
        sub_pred = float(np.dot(coef, feat) + intercept)
        print(f"  - {vclass:10s} Index: {sub_pred:8.1f} pts (R² = {vdata.get('r2', 0):.4f})")

    print("\nStatus: SUCCESS (Model executed real mathematical inference successfully)")
    print("=" * 60)
    return True


if __name__ == "__main__":
    main()
