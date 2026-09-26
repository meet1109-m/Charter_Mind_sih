"""
Multi-Factor Voyage Risk Assessment Engine.

Methodology Taxonomy (matching ml_model/ARCHITECTURE.md and MODEL_CARD.md):
- Hybrid Decision System (Supervised ML Model + Statistical Signal + Domain Physics):
  1. Supervised Multi-Factor ML Risk Model (ml_model/models/risk_model.joblib):
     Gradient Boosting / Ridge regression trained on 2,446 empirical voyage observations predicting
     composite risk and component exposures from port traffic Z-scores, forecast market volatility,
     physical draft clearances, and Bay of Bengal cyclone seasonality.
  2. Market Volatility Risk (25% Weight): Model-calibrated market signal driven by BDI log-return
     volatility, freight hedge status, and geopolitical corridor multipliers.
  3. Port Congestion Risk (30% Weight): Statistical signal from audited port throughput Z-scores.
  4. Weather Hazard Risk (20% Weight): Domain rules and seasonality windows (pre/post-monsoon cyclones).
  5. Vessel Availability Risk (15% Weight): Spot tonnage availability and regional positioning.
  6. Commodity Handling Risk (10% Weight): Bulk cargo moisture decay, liquefaction, and dusting sensitivities.
"""

from datetime import datetime
from typing import Dict, List, Optional, Union

import numpy as np
import pandas as pd

from app.schemas.cargo import CargoRequestBase, CargoRequestResponse
from app.schemas.port import PortSpec
from app.schemas.risk import RiskScoreResult
from app.schemas.vessel import VesselSpec
from app.schemas.voyage import RiskBucket, SimulatorOverrides
from app.services.forecast_engine import MLModelManager
from app.services.vessel_scorer import check_port_compatibility


FEATURE_COLUMNS = [
    "port_name",
    "vessel_class",
    "weather_condition",
    "freight_hedge_status",
    "voyage_month",
    "forecast_volatility_signal",
    "port_traffic_zscore",
    "ukc_margin_m",
    "cyclone_seasonality_base_risk",
]


def calculate_risk_scores(
    cargo: Union[CargoRequestBase, CargoRequestResponse],
    vessel: VesselSpec,
    port: PortSpec,
    overrides: Optional[SimulatorOverrides] = None,
) -> RiskScoreResult:
    """
    Evaluate multi-vector maritime risk scores (0-100) using the trained supervised ML risk pipeline
    (ml_model/models/risk_model.joblib) across 5 critical dimensions:
    1. Market Risk: Driven by forecast volatility signals, BDI historical log-return sigma, and hedge status.
    2. Port Risk: Port queue congestion and audited throughput Z-score deviations.
    3. Weather Risk: Monsoon swells, cyclone alerts, and Bay of Bengal seasonal hazard windows.
    4. Vessel Risk: Fleet availability scarcity and aged vessel breakdown risks from vessel registry (500 vessels),
       with physical navigational port clearance checks.
    5. Commodity Risk: Cargo liquefaction (Bauxite), moisture decay (Grain), or coal dusting.

    Returns:
        RiskScoreResult with sub-scores, weighted composite score, risk bucket,
        primary risk driver, and executive summary sentence.
    """
    manager = MLModelManager.get_instance()

    # Normalize inputs matching training dataset categories
    p_id = str(getattr(port, "id", "")).lower()
    p_name = str(getattr(port, "name", "")).lower()
    if "paradip" in p_id or "paradip" in p_name:
        port_name = "Paradip"
    elif "dhamra" in p_id or "dhamra" in p_name:
        port_name = "Dhamra"
    elif "vizag" in p_id or "visakhapatnam" in p_name:
        port_name = "Vizag"
    elif "haldia" in p_id or "haldia" in p_name:
        port_name = "Haldia"
    elif "kolkata" in p_id or "kolkata" in p_name:
        port_name = "Kolkata"
    elif "chennai" in p_id or "chennai" in p_name:
        port_name = "Chennai"
    elif "kamarajar" in p_id or "kamarajar" in p_name:
        port_name = "Kamarajar"
    else:
        port_name = "Paradip"

    v_id = str(getattr(vessel, "id", "")).lower()
    v_name = str(getattr(vessel, "name", "")).lower()
    v_cls = str(getattr(vessel, "vessel_class", "")).lower()
    if "cape" in v_id or "cape" in v_name or "cape" in v_cls:
        vessel_class = "Capesize"
    elif "pana" in v_id or "pana" in v_name or "kamsar" in v_name or "pana" in v_cls:
        vessel_class = "Panamax"
    elif "supra" in v_id or "supra" in v_name or "ultra" in v_name or "supra" in v_cls:
        vessel_class = "Supramax"
    elif "handy" in v_id or "handy" in v_name or "handy" in v_cls:
        vessel_class = "Handysize"
    else:
        vessel_class = "Panamax"

    congestion = overrides.congestion if overrides and overrides.congestion else port.congestion
    weather_input = overrides.weather if overrides and overrides.weather else "Normal"
    avail = overrides.vessel_availability if overrides and overrides.vessel_availability else getattr(vessel, "availability", "Available")

    # Map weather condition to model training domain ("Calm", "Normal", "Rough", "Severe Storm")
    if weather_input == "Severe":
        weather_condition = "Severe Storm"
    elif weather_input in ["Rough", "Calm", "Normal"]:
        weather_condition = weather_input
    elif getattr(port, "weather_risk", "Low") == "High":
        weather_condition = "Rough"
    else:
        weather_condition = "Normal"

    # Freight hedge status
    contract_dur = getattr(cargo, "contract_duration", "Spot")
    if contract_dur in ["CoA", "Hedged", "Contract", "Long-term"]:
        freight_hedge_status = "Hedged"
    else:
        freight_hedge_status = "Unhedged"

    # Voyage month
    voyage_month = 10
    if hasattr(cargo, "loading_window_start") and cargo.loading_window_start:
        voyage_month = cargo.loading_window_start.month
    elif hasattr(cargo, "laycan_start") and cargo.laycan_start:
        if isinstance(cargo.laycan_start, str) and "-" in cargo.laycan_start:
            try:
                voyage_month = int(cargo.laycan_start.split("-")[1])
            except (ValueError, IndexError):
                voyage_month = datetime.now().month
        elif hasattr(cargo.laycan_start, "month"):
            voyage_month = cargo.laycan_start.month
    else:
        voyage_month = datetime.now().month

    # 1. Market Volatility Signal & Market Risk
    if overrides and overrides.forecast_volatility_signal is not None:
        vol_signal = float(overrides.forecast_volatility_signal)
    else:
        if manager.historical_bdi and len(manager.historical_bdi) >= 6:
            bdi_arr = np.array(manager.historical_bdi, dtype=float)
            sigma = float(np.std(np.diff(np.log(np.maximum(bdi_arr, 1.0))))) if len(bdi_arr) > 1 else 0.185
        else:
            sigma = 0.185

        if overrides and overrides.freight_rate_offset_percent:
            vol_signal = max(0.02, min(0.95, sigma * (1.0 + abs(overrides.freight_rate_offset_percent) / 40.0)))
        else:
            vol_signal = max(0.02, min(0.95, sigma))

    hedge_factor = 0.30 if freight_hedge_status == "Hedged" else (0.65 if freight_hedge_status == "Partially Hedged" else 1.0)
    origin_country = getattr(cargo, "origin_country", "Indonesia")
    corridor_mult = 1.30 if origin_country == "Russia" else (1.15 if origin_country == "Australia" else 1.0)
    market_risk = min(100.0, max(0.0, round((vol_signal * 100.0) * hedge_factor * corridor_mult, 1)))

    # 2. Port Traffic Z-Score & Port Congestion Risk
    if overrides and overrides.port_traffic_zscore is not None:
        z_score = float(overrides.port_traffic_zscore)
    else:
        z_map = {"Low": -1.0, "Medium": 0.0, "High": 1.2, "Critical": 2.2}
        z_score = z_map.get(congestion, 0.0)

    port_risk = min(100.0, max(0.0, round(50.0 + z_score * 22.0, 1)))

    # 3. Weather Hazard & Cyclone Seasonality Risk
    # Bay of Bengal cyclone peaks: May (pre-monsoon), Oct-Nov (post-monsoon)
    if voyage_month in [5, 10, 11]:
        cyclone_base = 60.0
    elif voyage_month in [6, 7, 8, 9]:
        cyclone_base = 30.0
    else:
        cyclone_base = 15.0

    if getattr(port, "weather_risk", "Low") == "High":
        cyclone_base += 15.0

    w_mult = 0.28 if weather_condition == "Calm" else (0.49 if weather_condition == "Normal" else (0.84 if weather_condition == "Rough" else 1.26))
    weather_risk = min(100.0, max(0.0, round(cyclone_base * w_mult, 1)))

    # 4. Vessel Scarcity & Fleet Vintage Risk (from vessel_registry_500.csv)
    reg_stats = manager.vessel_registry_stats.get(vessel_class, None) if hasattr(manager, "vessel_registry_stats") and manager.vessel_registry_stats else None
    if reg_stats:
        n_class = reg_stats.get("count", 120)
        n_aged = reg_stats.get("aged_count", 30)
        aged_ratio = reg_stats.get("aged_ratio", 0.25)
    else:
        defaults = {
            "Capesize": {"count": 81, "aged_count": 19, "aged_ratio": 0.235},
            "Panamax": {"count": 124, "aged_count": 35, "aged_ratio": 0.282},
            "Handysize": {"count": 136, "aged_count": 35, "aged_ratio": 0.257},
            "Supramax": {"count": 159, "aged_count": 42, "aged_ratio": 0.264},
        }
        fallback = defaults.get(vessel_class, {"count": 120, "aged_count": 30, "aged_ratio": 0.25})
        n_class = fallback["count"]
        n_aged = fallback["aged_count"]
        aged_ratio = fallback["aged_ratio"]

    # Fleet scarcity: smaller fleet share in 500-vessel registry increases scarcity risk
    scarcity_score = max(10.0, 50.0 - (n_class / 500.0) * 100.0)
    # Vintage breakdown risk: vessels > 15 years carry higher casualty/maintenance risk
    vintage_score = aged_ratio * 35.0
    base_vessel_risk = scarcity_score + vintage_score

    if avail == "Limited":
        base_vessel_risk += 20.0
    elif avail == "Scarce":
        base_vessel_risk += 45.0

    vessel_risk = min(100.0, max(0.0, round(base_vessel_risk, 1)))

    # Physical compatibility override (force vessel_risk=100 if navigationally incompatible)
    compat = check_port_compatibility(vessel, port)
    if not compat.is_compatible:
        vessel_risk = 100.0

    # 5. Commodity Handling Risk (Preserved)
    commodity_risk = 30.0
    cargo_type = getattr(cargo, "cargo_type", "Coal")
    if cargo_type == "Coal":
        commodity_risk += 8.0
    elif cargo_type == "Grain":
        commodity_risk += 15.0
    elif cargo_type == "Iron Ore":
        commodity_risk += 5.0
    elif cargo_type == "Bauxite":
        commodity_risk += 22.0
    commodity_risk = min(100.0, max(0.0, round(commodity_risk, 1)))

    # 6. Physical Under-Keel Clearance Margin (m)
    port_max_draft = getattr(port, "max_draft", 15.0)
    vessel_draft = getattr(vessel, "draft_m", 12.5)
    ukc_margin_m = float(max(0.1, round(port_max_draft - vessel_draft, 2)))

    # 7. Model-Driven Overall Composite Score Prediction
    if manager.risk_model is not None:
        try:
            feat_dict = {
                "port_name": port_name,
                "vessel_class": vessel_class,
                "weather_condition": weather_condition,
                "freight_hedge_status": freight_hedge_status,
                "voyage_month": voyage_month,
                "forecast_volatility_signal": vol_signal,
                "port_traffic_zscore": z_score,
                "ukc_margin_m": ukc_margin_m,
                "cyclone_seasonality_base_risk": cyclone_base,
            }
            feat_df = pd.DataFrame([feat_dict])[FEATURE_COLUMNS]
            predicted_score = float(manager.risk_model.predict(feat_df)[0])
            # Calibrate model output with vessel & commodity handling modifiers
            vessel_mod = (vessel_risk - 32.0) * 0.15
            commodity_mod = (commodity_risk - 38.0) * 0.10
            overall_score = min(100.0, max(0.0, round(predicted_score + vessel_mod + commodity_mod, 1)))
        except Exception:
            # Fallback to calibrated weighted sum if inference fails
            overall_score = round(
                market_risk * 0.25
                + port_risk * 0.30
                + weather_risk * 0.20
                + vessel_risk * 0.15
                + commodity_risk * 0.10,
                1,
            )
    else:
        # Fallback to calibrated weighted average
        overall_score = round(
            market_risk * 0.25
            + port_risk * 0.30
            + weather_risk * 0.20
            + vessel_risk * 0.15
            + commodity_risk * 0.10,
            1,
        )

    # Risk Bucket Classification
    if overall_score < 35.0:
        bucket: RiskBucket = "Low"
    elif overall_score < 55.0:
        bucket = "Medium"
    elif overall_score < 75.0:
        bucket = "High"
    else:
        bucket = "Critical"

    # Identify dominant primary risk driver
    vessel_cause = (
        f"physical navigational incompatibility with {port.name}"
        if not compat.is_compatible
        else f"fleet availability ({n_class} registered vessels, {n_aged} aged >15 yrs in fleet)"
    )
    driver_candidates: List[Dict[str, Union[str, float]]] = [
        {"name": "Market Risk", "score": market_risk, "cause": "geopolitical freight rate volatility"},
        {"name": "Port Risk", "score": port_risk, "cause": f"anchorage queue wait times and traffic throughput at {port.name}"},
        {"name": "Weather Risk", "score": weather_risk, "cause": f"marine sea-state and {weather_condition.lower()} swell advisories"},
        {"name": "Vessel Risk", "score": vessel_risk, "cause": vessel_cause},
        {"name": "Commodity Risk", "score": commodity_risk, "cause": f"{cargo_type} moisture and handling sensitivities"},
    ]
    driver_candidates.sort(key=lambda x: float(x["score"]), reverse=True)
    primary = driver_candidates[0]

    summary_sentence = (
        f"Overall risk is {bucket} ({overall_score}/100), driven primarily by elevated {primary['name']} "
        f"({primary['score']}/100) due to {primary['cause']}."
    )

    return RiskScoreResult(
        market_risk=market_risk,
        port_risk=port_risk,
        weather_risk=weather_risk,
        vessel_risk=vessel_risk,
        commodity_risk=commodity_risk,
        overall_score=overall_score,
        bucket=bucket,
        primary_driver=str(primary["name"]),
        summary_sentence=summary_sentence,
    )
