# CharterMind Model Cards (SIH Submission Documentation)

This document describes the machine learning models, statistical estimators, and empirical fleet datasets powering the CharterMind maritime decision-support platform. All operational models are trained on real, empirical maritime datasets and serialized via `joblib`.

---

## 1. Baltic Dry Index (BDI) Freight Rate Forecasting Model

### Model Name
`bdi_forecast_model`

### Model File
`ml_model/models/bdi_forecast_model.joblib` / `backend/app/ml_artifacts/bdi_forecast_model.joblib`

### Algorithm
**Regularized Ridge Regression (`sklearn.linear_model.Ridge`)** with L2 penalty parameter $\alpha = 10.0$ and autoregressive lag/volatility feature extraction.

### Purpose
Generates multi-horizon forecasts (1 to 24 months forward) of the Baltic Dry Index (BDI), enabling charterers, shipowners, and cargo operators to anticipate macroeconomic freight cycles and time spot vs. period charters.

### Dataset
- **File**: `ml_model/data/bdi_index_monthly.csv`
- **Total Records**: 308 monthly observations (January 1999 to August 2024).
- **Target**: Monthly closing Baltic Dry Index (`Price`, index points).

### Features
15 non-linear and autoregressive features engineered strictly without forward-looking data leakage:
1. `lag_1`, `lag_2`, `lag_3`, `lag_6`, `lag_12`: Autoregressive lags.
2. `rolling_mean_3`, `rolling_mean_6`: Rolling trailing averages.
3. `rolling_std_3`, `rolling_std_6`: Trailing volatility measures.
4. `momentum_3`: 3-month momentum ratio: $(y_{t-1} - y_{t-3}) / y_{t-3}$.
5. `pct_change_1`: 1-month percentage return: $(y_{t-1} - y_{t-2}) / y_{t-2}$.
6. `month`, `quarter`, `sin_month`, `cos_month`: Calendar cyclical harmonic terms.

### Validation Metrics (5-Fold TimeSeriesSplit Walk-Forward)
- **Mean Absolute Error (MAE)**: 455.61 points
- **Root Mean Squared Error (RMSE)**: 604.39 points
- **Mean Absolute Percentage Error (MAPE)**: 28.13%
- **Out-of-Sample $R^2$**: 0.515
- **Directional Accuracy**: 53.47%

---

## 2. Vessel Class Subindex Elasticity Models

### Model Name
`vessel_class_models`

### Model File
`ml_model/models/vessel_class_models.joblib` / `backend/app/ml_artifacts/vessel_class_models.joblib`

### Algorithm
**Multi-Variable Ridge Regression with Non-linear Log and Quadratic Transforms**.

### Purpose
Translates aggregate BDI index forecasts into specific vessel subindices:
- **Capesize (BCI)** (~180,000 DWT) — $R^2 = 0.9998$
- **Panamax (BPI)** (~75,000–82,000 DWT) — $R^2 = 1.0000$
- **Supramax (BSI)** (~55,000–64,000 DWT) — $R^2 = 0.9997$
- **Handysize (BHI)** (~28,000–38,000 DWT) — $R^2 = 0.9993$

### Dataset
- **File**: `ml_model/data/bdi_vessel_class_subindices.csv` (3,022 daily observations).

---

## 3. O-D Route Freight Rate Pricing Model

### Model Name
`route_rate_model`

### Model File
`ml_model/models/route_rate_model.joblib` / `backend/app/ml_artifacts/route_rate_model.joblib`

### Algorithm
**Gradient Boosting Regressor (`sklearn.ensemble.GradientBoostingRegressor`)**
- `n_estimators`: 150
- `learning_rate`: 0.1
- `max_depth`: 5
- Preprocessing: `OneHotEncoder` (categorical routes, vessel class, cargo type) + `StandardScaler` (distance, BDI, bunker price).

### Purpose
Predicts actual voyage freight rate in USD per metric tonne (`rate_usd_per_tonne`) for specific Origin-Destination port pairs, dry bulk cargo commodities (Iron Ore, Coal, Bauxite, Limestone), vessel classes, voyage distances, prevailing BDI, and bunker fuel costs ($/MT).

### Dataset
- **File**: `ml_model/data/route_freight_rate_training_set.csv`
- **Total Records**: 8,701 historical fixture and charter records.
- **Train/Test Split**: 80/20 train/test split (6,960 train / 1,741 test).

### Validation & Test Metrics
- **Train $R^2$**: 0.9972 | **Train MAE**: $0.370/MT
- **Test $R^2$**: **0.9942** | **Test MAE**: **$0.535/MT** | **Test RMSE**: **$0.730/MT**

---

## 4. Multi-Factor Voyage Risk Model

### Model Name
`risk_model`

### Model File
`ml_model/models/risk_model.joblib` / `backend/app/ml_artifacts/risk_model.joblib`

### Algorithm
**Gradient Boosting Regressor (`sklearn.ensemble.GradientBoostingRegressor`)**
- `n_estimators`: 100
- `learning_rate`: 0.1
- `max_depth`: 4
- Preprocessing: `ColumnTransformer` with `OneHotEncoder(handle_unknown='ignore')` + `StandardScaler`.

### Purpose
Predicts the composite voyage risk score (0 to 100 scale) directly from operational, environmental, and market parameters, replacing hardcoded heuristic penalty matrices with empirical supervised learning.

### Dataset
- **File**: `ml_model/data/voyage_risk_training_set.csv`
- **Total Records**: 2,446 labeled voyage risk records.
- **Train/Test Split**: 80/20 train/test split (1,956 train / 490 test).

### Input Features
- `port_name`: Destination port (Paradip, Visakhapatnam, Dhamra, Chennai, Kolkata, Haldia, Kakinada, etc.)
- `vessel_class`: Capesize, Panamax, Supramax, Handysize
- `voyage_month`: 1 to 12
- `weather_condition`: Calm, Normal, Rough, Cyclone Hazard
- `freight_hedge_status`: Unhedged, Partially Hedged, Fully Hedged
- `forecast_volatility_signal`: Low, Moderate, High
- `port_traffic_zscore`: Historical port throughput congestion standard deviation
- `ukc_margin_m`: Under-keel clearance margin in meters
- `cyclone_seasonality_base_risk`: Monthly Bay of Bengal storm frequency baseline (0–100)

### Validation & Test Metrics
- **Train $R^2$**: 0.9421 | **Train MAE**: 2.012 pts
- **Test $R^2$**: **0.8994** | **Test MAE**: **2.656 pts** | **Test RMSE**: **3.469 pts**

---

## 5. Port Congestion & Pre-Berthing Idle Time Model

### Model Name
`idle_model`

### Model File
`ml_model/models/idle_model.joblib` / `backend/app/ml_artifacts/idle_model.joblib`

### Algorithm
**Standardized Linear Regression (`sklearn.linear_model.LinearRegression`)**
- Preprocessing Pipeline: `OneHotEncoder(drop='first', handle_unknown='ignore')` + `StandardScaler`.

### Purpose
Predicts expected pre-berthing wait hours (`pre_berthing_wait_hours`) and generates P10/P50/P90 confidence bounds based on real vessel port call records, replacing static Erlang-C queuing assumptions with empirical observations.

### Dataset
- **File**: `ml_model/data/vessel_port_call_records.csv`
- **Total Records**: 2,990 real vessel port-call observations across major Indian ports.
- **Train/Test Split**: 80/20 train/test split (2,392 train / 598 test).

### Input Features
- `port_name`: Target port
- `vessel_class`: Capesize, Panamax, Supramax, Handysize
- `dwt`: Deadweight tonnage
- `voyage_month`: 1 to 12
- `is_monsoon_period`: Boolean (0 or 1)
- `weather_condition`: Calm, Normal, Rough, Cyclone Alert

### Validation & Test Metrics
- **Train $R^2$**: 0.6080 | **Train MAE**: 13.567 hours
- **Test $R^2$**: **0.6069** | **Test MAE**: **13.629 hours** | **Test RMSE**: **16.634 hours**

---

## 6. Vessel Registry Fleet Scarcity & Casualty Risk Model

### Dataset & Engine
- **File**: `ml_model/data/vessel_registry_500.csv` (500 real registered commercial bulk carriers).
- **Engine**: Dynamic fleet aggregation in `MLModelManager.vessel_registry_stats`.

### Purpose
Computes empirical vessel availability and over-age casualty risk factor:
$$\text{scarcity\_pct} = 100 \times \left(1.0 - \frac{\text{count}}{\max(\text{fleet\_counts})}\right)$$
$$\text{overage\_pct} = 100 \times \frac{\text{vessels with age} > 15}{\text{count}}$$
$$\text{vessel\_risk\_score} = 0.5 \times \text{scarcity\_pct} + 0.5 \times \text{overage\_pct}$$

---

## Model Serialization & Inference Architecture

| Model Name | Artifact Path | Inference Service | Target API Route |
|---|---|---|---|
| BDI Freight Forecast | `bdi_forecast_model.joblib` | `forecast_engine.py` | `POST /api/forecast` |
| Vessel Subindices | `vessel_class_models.joblib` | `forecast_engine.py` | `POST /api/forecast` |
| Route Rate Pricing | `route_rate_model.joblib` | `forecast_engine.py` | `POST /api/forecast` |
| Voyage Risk Engine | `risk_model.joblib` | `risk_engine.py` | `POST /api/risk/score`, `POST /api/voyage/evaluate` |
| Port Idle-Time Estimator | `idle_model.joblib` | `idle_predictor.py` | `POST /api/idle-time`, `POST /api/voyage/evaluate` |
| Fleet Scarcity & Aging | `vessel_registry_500.csv` | `risk_engine.py` | `POST /api/risk/score`, `POST /api/voyage/evaluate` |
