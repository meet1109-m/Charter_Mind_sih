"""
Multi-Factor Voyage Risk Assessment Service.
Synthesizes ML market forecast signals, statistical port congestion Z-scores,
deterministic physical draft clearances, and seasonal cyclone weather risks.

METHODOLOGY NOTE:
Hybrid Decision System:
- ML Signal: Freight rate trend & forecast volatility from trained Ridge model.
- Statistical Signal: 10-year port throughput Z-scores.
- Rule-Based / Domain Logic: Physical under-keel clearance (UKC) and BIMCO clauses.
"""

import math
from typing import Dict, Any, List, Optional
import numpy as np
from .port_service import PortService
from .forecast_service import ForecastService


def compute_parametric_var_cvar(
    current_bdi: float = 2000.0,
    historical_bdi: Optional[List[float]] = None,
    origin_country: str = "Indonesia",
    freight_rate_offset_percent: Optional[float] = None,
    confidence_level: float = 0.95,
) -> Dict[str, float]:
    """
    Computes parametric Value-at-Risk (VaR) and Conditional Value-at-Risk (CVaR / Expected Shortfall)
    for dry bulk freight market risk exposure based on Baltic Dry Index (BDI) volatility.

    Parameters:
        current_bdi: Current spot Baltic Dry Index level (points).
        historical_bdi: Optional series of historical BDI values to compute empirical log-return volatility.
        origin_country: Geopolitical origin corridor (e.g. Russia, Australia, Indonesia).
        freight_rate_offset_percent: Simulated market freight rate deviation percentage.
        confidence_level: VaR confidence interval (default: 0.95 for 95% confidence).

    Returns:
        Dict with var_percent, cvar_percent, volatility_sigma, and market_risk_score (0-100).
    """
    # 1. Historical Log-Return Volatility
    if historical_bdi and len(historical_bdi) >= 6:
        arr = np.array(historical_bdi, dtype=float)
        log_returns = np.diff(np.log(np.maximum(arr, 1.0)))
        sigma = float(np.std(log_returns)) if len(log_returns) > 0 else 0.185
    else:
        # Standard historical monthly Baltic Dry Index return volatility (~18.5%)
        sigma = 0.185

    # 2. Parametric Gaussian Quantile & Tail Expectation (VaR & CVaR)
    # At alpha = 0.95: z_0.95 ~ 1.64485
    # CVaR (Expected Shortfall) factor: phi(z) / (1 - alpha) = 0.103135 / 0.05 ~ 2.0627
    if abs(confidence_level - 0.95) < 0.01:
        z = 1.64485
        cvar_factor = 2.0627
    elif abs(confidence_level - 0.99) < 0.01:
        z = 2.32635
        cvar_factor = 2.6652
    else:
        z = 1.64485
        cvar_factor = 2.0627

    var_pct = z * sigma
    cvar_pct = cvar_factor * sigma

    # 3. Market Regime & Spot Elasticity Scaling
    # Baseline benchmark is 2,000 BDI points. Higher index levels indicate tighter supply and sharper tail risk.
    regime_factor = math.sqrt(max(current_bdi, 300.0) / 2000.0)
    
    # Base market downside exposure (composite 60% VaR + 40% CVaR tail risk)
    tail_risk_blend = (0.60 * var_pct + 0.40 * cvar_pct) * regime_factor
    # Normalized base market risk score (baseline ~46.0 under normal volatility at 2000 BDI)
    base_market_risk = tail_risk_blend * (46.0 / (0.335 * 1.0))

    # 4. Geopolitical Corridor Multipliers
    corridor_risk = 0.0
    if origin_country == "Russia":
        corridor_risk = 32.0
    elif origin_country == "Australia":
        corridor_risk = 14.0
    elif origin_country in ["Mozambique", "South Africa"]:
        corridor_risk = 8.0

    # 5. Simulated Freight Rate Offset Adjustment
    offset_risk = 0.0
    if freight_rate_offset_percent is not None:
        if freight_rate_offset_percent > 10.0:
            offset_risk = 18.0
        elif freight_rate_offset_percent > 0.0:
            offset_risk = float(freight_rate_offset_percent) * 1.2
        elif freight_rate_offset_percent < 0.0:
            offset_risk = max(-15.0, float(freight_rate_offset_percent) * 0.8)

    market_score = min(100.0, max(0.0, round(base_market_risk + corridor_risk + offset_risk, 1)))

    return {
        "var_95": round(var_pct * 100, 2),
        "cvar_95": round(cvar_pct * 100, 2),
        "volatility_sigma": round(sigma, 4),
        "regime_factor": round(regime_factor, 3),
        "market_risk_score": market_score,
    }


def calculate_market_var_risk(
    current_bdi: float = 2000.0,
    historical_bdi: Optional[List[float]] = None,
    origin_country: str = "Indonesia",
    freight_rate_offset_percent: Optional[float] = None,
    confidence_level: float = 0.95,
) -> float:
    """Helper returning only the 0-100 market risk score from the parametric VaR/CVaR model."""
    result = compute_parametric_var_cvar(
        current_bdi=current_bdi,
        historical_bdi=historical_bdi,
        origin_country=origin_country,
        freight_rate_offset_percent=freight_rate_offset_percent,
        confidence_level=confidence_level,
    )
    return float(result["market_risk_score"])


class RiskService:
    def __init__(self, port_service: PortService = None, forecast_service: ForecastService = None):
        self.port_service = port_service or PortService()
        self.forecast_service = forecast_service or ForecastService()

    def assess_risk(
        self,
        port_name: str,
        vessel_class: str,
        vessel_draft_m: float,
        cargo_tonnes: float,
        voyage_month: int = 7,
        weather_condition: str = "Normal",
        freight_hedge_status: str = "Unhedged",
        current_bdi: float = 2000.0,
    ) -> Dict[str, Any]:
        identified_risks: List[str] = []
        mitigation_clauses: List[str] = []

        # 1. Market Volatility Risk (Weight: 25%) - Parametric VaR / CVaR Signal
        var_res = compute_parametric_var_cvar(current_bdi=current_bdi)
        market_score = var_res["market_risk_score"]
        if freight_hedge_status == "Unhedged":
            identified_risks.append(
                f"Unhedged freight exposure: 95% 1-Mo VaR is {var_res['var_95']}%, CVaR is {var_res['cvar_95']}%."
            )
            mitigation_clauses.append("BIMCO Forward Freight Agreement (FFA) or index-linked collar contract.")
        else:
            market_score = max(5.0, market_score - 15.0)

        # 2. Port Congestion Risk (Weight: 30%) - Statistical Signal
        port_intel = self.port_service.get_port_intelligence(port_name)
        z_score = port_intel.get("congestion_score_z", 0.0)
        congestion_score = min(100.0, max(10.0, 50.0 + z_score * 20.0))

        if z_score > 1.0:
            identified_risks.append(f"Statistically elevated port throughput (Z-score +{z_score:.2f}σ). High demurrage risk.")
            mitigation_clauses.append("BIMCO Laytime and Demurrage Clause with strict Notice of Readiness (NOR) triggers.")

        # 3. Physical Navigational Risk (Weight: 25%) - Deterministic Rules
        specs = port_intel.get("specs", {})
        channel_depth = specs.get("channel_depth_m", 16.0)
        max_draft = specs.get("max_draft_m", 15.0)

        physical_score = 20.0
        ukc = channel_depth - vessel_draft_m
        if ukc < 0.5:
            physical_score += 60.0
            identified_risks.append(f"Critical navigational clearance: draft ({vessel_draft_m}m) exceeds channel depth ({channel_depth}m) minus 0.5m UKC.")
            mitigation_clauses.append("Compulsory high-water tidal escort and lighterage clause.")
        elif ukc < 1.2:
            physical_score += 35.0
            identified_risks.append(f"Narrow under-keel clearance ({ukc:.1f}m). Transit contingent on tidal swell.")

        if vessel_draft_m > max_draft:
            physical_score += 30.0
            identified_risks.append(f"Vessel draft exceeds berth limit ({max_draft}m). Lightening required.")

        # 4. Weather & Monsoon Risk (Weight: 20%) - Domain Rules
        weather_score = 25.0
        # Bay of Bengal cyclone peaks: May (pre-monsoon) and Oct-Nov (post-monsoon)
        if voyage_month in [10, 11]:
            weather_score += 40.0
            identified_risks.append("High cyclone hazard in Bay of Bengal (post-monsoon tropical cyclone window).")
            mitigation_clauses.append("BIMCO Safe Port and Force Majeure Weather Interruption Clause.")
        elif voyage_month in [6, 7, 8, 9]:
            weather_score += 25.0
            identified_risks.append("Southwest monsoon sea swell causing cargo handling delays at open roadsteads.")

        if weather_condition in ["Rough", "Severe Storm"]:
            weather_score += 25.0
            identified_risks.append(f"Adverse weather condition selected: {weather_condition}.")

        # Composite Weighted Risk Score
        composite_score = (
            0.25 * market_score
            + 0.30 * congestion_score
            + 0.25 * physical_score
            + 0.20 * weather_score
        )
        composite_score = round(max(5.0, min(99.0, composite_score)), 1)

        if composite_score >= 70:
            level = "CRITICAL"
        elif composite_score >= 50:
            level = "ELEVATED"
        elif composite_score >= 30:
            level = "MODERATE"
        else:
            level = "LOW"

        return {
            "status": "success",
            "overall_risk_score": composite_score,
            "risk_level": level,
            "component_scores": {
                "market_risk": round(market_score, 1),
                "congestion_risk": round(congestion_score, 1),
                "physical_clearance_risk": round(physical_score, 1),
                "weather_hazard_risk": round(weather_score, 1),
            },
            "identified_risks": identified_risks,
            "mitigation_clauses": list(set(mitigation_clauses)),
        }
