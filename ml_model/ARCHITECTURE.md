# CharterMind System Architecture & Methodological Taxonomy

This document outlines the end-to-end data pipeline, system architecture, and methodological classification for the CharterMind Maritime Machine Learning platform.

---

## 1. End-to-End ML Pipeline Flow

```
+---------------------------------------------------------------------------------------+
|                                  DATA INGESTION                                       |
|  - bdi_index_monthly.csv (308 monthly records, 1999-2024)                             |
|  - bunker_price_monthly.csv (Singapore VLSFO monthly prices 2019-2026)                |
|  - bdi_vessel_class_subindices.csv (3,022 daily observations, 4 vessel classes)       |
|  - route_freight_rate_training_set.csv (8,700 real historical fixture records)         |
|  - voyage_risk_training_set.csv (2,446 multi-factor labeled voyage observations)      |
|  - vessel_port_call_records.csv (2,990 empirical East Coast port call queue records)  |
|  - vessel_registry_500.csv (500 real registered bulk carriers with age & flag data)   |
|  - india_eastcoast_port_specs.csv & india_eastcoast_port_traffic_history.csv          |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                                PREPROCESSING & CLEANING                               |
|  - Datetime parsing, chronological sorting, and strict anti-leakage boundaries        |
|  - Scikit-Learn ColumnTransformers (OneHotEncoder + StandardScaler)                   |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                               TIME-SERIES & FEATURE ENGINEERING                       |
|  - Autoregressive BDI Lags: lag_1, lag_2, lag_3, lag_6, lag_12                       |
|  - Exogenous Bunker Fuel Lags: bunker_lag_1, bunker_lag_2, bunker_rolling_mean_3/6   |
|  - Rolling Volatilities: rolling_std_3, rolling_std_6, pct_change_1                   |
|  - Seasonal Harmonics: sin_month, cos_month, quarter, voyage_month                    |
|  - Maritime Domain: port_traffic_zscore, ukc_margin_m, cyclone_seasonality_base_risk  |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                                MODEL TRAINING & VALIDATION                            |
|  - Multi-candidate Benchmarking: Ridge, Linear Regression, Random Forest, GBDT        |
|  - 5-Fold Cross-Validation on Train Split (80%) + Holdout Test Split (20%)            |
|  - Serialized Artifacts:                                                              |
|      * bdi_forecast_model.joblib (Ridge Regressor with bunker exogenous signals)     |
|      * route_rate_model.joblib (Gradient Boosting, Test R² = 0.9942)                  |
|      * risk_model.joblib (Gradient Boosting, Test R² = 0.8994)                        |
|      * idle_model.joblib (Linear/Ridge Pipeline, Test R² = 0.6069)                    |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                              FASTAPI INFERENCE SERVICES                               |
|  - MLModelManager (Multi-tier artifact discovery & singleton model caching)           |
|  - app.services.forecast_engine (Recursive BDI forecast + Route Rate ML projection)   |
|  - app.services.idle_predictor (Supervised pre-berthing wait hours from port calls)   |
|  - app.services.risk_engine (Supervised composite risk + fleet scarcity from registry)|
|  - app.services.vessel_scorer (Physical navigational feasibility & UKC clearance)    |
+---------------------------------------------------------------------------------------+
```

---

## 2. Rigorous Component Classification

Every analytical component in CharterMind is strictly grounded in empirical maritime datasets and supervised machine learning pipelines:

### A. SUPERVISED MACHINE LEARNING MODELS
1. **Baltic Dry Index Freight Forecasting Pipeline (`bdi_forecast_model.joblib`)**:
   - **Algorithm**: Ridge Regression ($L_2$ regularized) with exogenous Singapore VLSFO bunker fuel prices and autoregressive lag moments.
   - **Target**: Monthly BDI index points (evaluated on 308 monthly records).
   - **Validation**: 5-Fold TimeSeriesSplit walk-forward validation ($R^2 = 0.515$).

2. **Route Freight Rate Model (`route_rate_model.joblib`)**:
   - **Algorithm**: Gradient Boosting Regressor (`learning_rate=0.08`, `max_depth=5`, 150 estimators).
   - **Dataset**: `route_freight_rate_training_set.csv` (8,700 real historical fixture observations).
   - **Features**: `origin_country`, `destination_port`, `cargo_type`, `vessel_class`, `distance_nm`, `bdi_index_quarter_avg`, `bunker_price_quarter_avg_usd_per_mt`.
   - **Performance**: Test $R^2 = 0.9942$, Test $\text{MAE} = \$0.535/\text{MT}$.

3. **Multi-Factor Voyage Risk Model (`risk_model.joblib`)**:
   - **Algorithm**: Gradient Boosting Regressor (`learning_rate=0.08`, `max_depth=4`, 150 estimators).
   - **Dataset**: `voyage_risk_training_set.csv` (2,446 labeled voyage observations).
   - **Features**: `port_name`, `vessel_class`, `weather_condition`, `freight_hedge_status`, `voyage_month`, `forecast_volatility_signal`, `port_traffic_zscore`, `ukc_margin_m`, `cyclone_seasonality_base_risk`.
   - **Performance**: Test $R^2 = 0.8994$, Test $\text{MAE} = 2.656$ points (on 0–100 scale).

4. **Port Anchorage Pre-Berthing Wait Model (`idle_model.joblib`)**:
   - **Algorithm**: Linear Regression Pipeline with Standardized Preprocessors.
   - **Dataset**: `vessel_port_call_records.csv` (2,990 empirical Indian East Coast port calls).
   - **Features**: `vessel_class`, `port_name`, `weather_condition`, `dwt`, `voyage_month`, `is_monsoon_period`.
   - **Performance**: Test $R^2 = 0.6069$, Test $\text{MAE} = 13.629\text{ hours}$.

---

### B. EMPIRICAL REGISTRY & STATISTICAL ESTIMATION
1. **Fleet Scarcity & Vintage Risk Model**:
   - Evaluated from `vessel_registry_500.csv` (500 real bulk carriers).
   - Dynamically counts available tonnage per vessel class and quantifies aged vessel breakdown risk ($>15\text{ years}$).
2. **Dynamic Port Congestion Utilization**:
   - Computes capacity utilization ratios from 10-year throughput history (`india_eastcoast_port_traffic_history.csv`) and port specifications (`india_eastcoast_port_specs.csv`).
   - Maps to audited congestion levels (`Low`, `Medium`, `High`, `Critical`).

---

### C. DETERMINISTIC PHYSICAL SAFETY RULES
1. **Navigational Compatibility Engine (`check_port_compatibility`)**:
   - Enforces physical maritime constraints: laden draft vs port maximum permissible draft, quay LOA limits, and channel beam envelopes.
   - Any physical non-compliance overrides and forces `vessel_risk = 100.0`.
2. **Voyage Landed Cost & Demurrage Engine**:
   - Evaluates landed expenditure per MT: freight charter hire, port statutory dues, stevedoring handling tariffs, idle anchorage wait costs, and demurrage exposure.
