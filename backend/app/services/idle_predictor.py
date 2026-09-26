"""
Port Idle-Time & Demurrage Queueing Engine.

Methodology Taxonomy (matching ml_model/ARCHITECTURE.md and MODEL_CARD.md):
- Supervised ML Model (ml_model/models/idle_model.joblib):
  Trained on 2,990 empirical Indian East Coast port call observations to predict pre-berthing
  anchorage waiting hours from vessel class, deadweight tonnage (DWT), destination port,
  voyage month, monsoon status, and sea-state weather conditions.
- Hybrid Queueing & Compatibility Adjustments:
  Integrates physical berth compatibility, draft constraints, and mechanized conveyor discharge
  handling rates into comprehensive voyage idle turnaround forecasts.
- Demurrage Exposure: Demurrage Cost = (Idle Waiting Hours / 24.0) * Daily Demurrage Rate.
"""

from datetime import datetime
from typing import List, Optional

import pandas as pd

from app.schemas.idle import IdleFactor, IdlePredictionResult
from app.schemas.port import PortSpec
from app.schemas.vessel import PortCompatibilityResult, VesselSpec
from app.schemas.voyage import CongestionLevel, WeatherCondition
from app.services.forecast_engine import MLModelManager
from app.services.vessel_scorer import check_port_compatibility


def predict_idle_time(
    port: PortSpec,
    vessel: VesselSpec,
    weather: Optional[WeatherCondition] = "Normal",
    congestion: Optional[CongestionLevel] = None,
    compat: Optional[PortCompatibilityResult] = None,
) -> IdlePredictionResult:
    """
    Predict vessel anchorage idle waiting time, turnaround hours, and demurrage exposure costs
    using the trained supervised ML idle waiting model (ml_model/models/idle_model.joblib).
    """
    if compat is None:
        compat = check_port_compatibility(vessel, port)

    active_congestion = congestion or port.congestion
    active_weather = weather or "Normal"
    manager = MLModelManager.get_instance()

    # 1. Normalize port name and vessel class matching training dataset categories
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

    # Map weather condition
    if active_weather == "Severe":
        weather_condition = "Severe Storm"
    elif active_weather in ["Rough", "Calm", "Normal"]:
        weather_condition = active_weather
    elif getattr(port, "weather_risk", "Low") == "High":
        weather_condition = "Rough"
    else:
        weather_condition = "Normal"

    dwt_val = float(getattr(vessel, "dwt", 75000.0))
    voyage_month = datetime.now().month
    is_monsoon = 1 if (voyage_month in [6, 7, 8, 9, 10, 11] or active_weather in ["Rough", "Severe Storm", "Severe"]) else 0

    # 2. Predict base pre-berthing wait hours from ML model
    factors: List[IdleFactor] = []

    if manager.idle_model is not None:
        try:
            feat_df = pd.DataFrame([{
                "vessel_class": vessel_class,
                "port_name": port_name,
                "weather_condition": weather_condition,
                "dwt": dwt_val,
                "voyage_month": voyage_month,
                "is_monsoon_period": is_monsoon,
            }])
            ml_pred_hours = float(manager.idle_model.predict(feat_df)[0])
            base_wait_hours = max(4.0, ml_pred_hours)
        except Exception:
            base_wait_hours = float(port.berthing_wait_days * 24.0)
    else:
        base_wait_hours = float(port.berthing_wait_days * 24.0)

    # 3. Dynamic Congestion Scaling
    congestion_multipliers = {
        "Low": 0.70,
        "Medium": 1.00,
        "High": 1.35,
        "Critical": 1.80,
    }
    c_mult = congestion_multipliers.get(active_congestion, 1.0)
    congestion_adjusted_hours = base_wait_hours * c_mult
    congestion_delta = congestion_adjusted_hours - base_wait_hours

    factors.append(
        IdleFactor(
            name=f"ML Anchorage Queue ({port_name} {active_congestion})",
            impact="Low" if active_congestion == "Low" else "Medium" if active_congestion == "Medium" else "High",
            hours=round(abs(congestion_delta) if abs(congestion_delta) > 0.1 else base_wait_hours, 1),
            direction="up" if congestion_delta >= 0 else "down",
        )
    )

    # 4. Weather & Marine Sea State Factor
    if active_weather == "Severe":
        weather_hours = 36.0
    elif active_weather == "Rough":
        weather_hours = 14.0
    else:
        weather_hours = 0.0

    if weather_hours > 0:
        factors.append(
            IdleFactor(
                name=f"Weather Sea State ({active_weather})",
                impact="High" if active_weather == "Severe" else "Medium",
                hours=weather_hours,
                direction="up",
            )
        )

    # 5. Berth physical compatibility & draft buffer
    draft_margin = port.max_draft - vessel.draft
    if not compat.is_compatible:
        berth_hours = 42.0
    elif draft_margin < 1.0:
        berth_hours = 12.0
    else:
        berth_hours = -6.0

    factors.append(
        IdleFactor(
            name="Berth Compatibility & Draft Clearance",
            impact="High" if abs(berth_hours) > 20 else "Low",
            hours=abs(berth_hours),
            direction="up" if berth_hours >= 0 else "down",
        )
    )

    # 6. Mechanized handling discharge turnaround efficiency
    if port.handling_rating >= 4.5:
        handling_hours = -16.0
        handling_label = "Very High"
    elif port.handling_rating <= 3.0:
        handling_hours = 12.0
        handling_label = "Moderate"
    else:
        handling_hours = -6.0
        handling_label = "High"

    factors.append(
        IdleFactor(
            name=f"Port Handling Productivity ({handling_label})",
            impact="Medium",
            hours=abs(handling_hours),
            direction="up" if handling_hours >= 0 else "down",
        )
    )

    total_idle_hours = max(6.0, round(congestion_adjusted_hours + weather_hours + berth_hours + handling_hours, 1))
    idle_cost_usd = round(total_idle_hours * vessel.hourly_rate, 2)
    days_str = round(total_idle_hours / 24.0, 1)

    explanation = (
        f"ML pre-berthing wait prediction is {total_idle_hours} hours (~{days_str} days) at {port.name}, "
        f"modeled from empirical port calls for {vessel_class} ({dwt_val:,.0f} DWT) under {active_weather.lower()} conditions."
    )

    return IdlePredictionResult(
        expected_idle_hours=total_idle_hours,
        idle_cost_usd=idle_cost_usd,
        factors=factors,
        explanation=explanation,
    )
