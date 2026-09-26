from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.contract import ContractComparisonResult
from app.schemas.forecast import ForecastResult, OptimalCharterWindow
from app.schemas.idle import IdlePredictionResult
from app.schemas.risk import RiskScoreResult
from app.schemas.vessel import VesselScoreBreakdown
from app.schemas.voyage import SimulatorOverrides, VoyageCostBreakdown


class VoyageEvaluationRequest(BaseModel):
    cargo_type: str = Field("Coal", description="Commodity type")
    cargo_quantity_mt: float = Field(75000.0, description="Cargo parcel quantity in Metric Tons")
    origin_country: str = Field("Indonesia", description="Loading origin basin")
    destination_port: str = Field("Paradip", description="Destination discharge port")
    required_delivery_date: Optional[date] = None
    loading_window_start: Optional[date] = None
    loading_window_end: Optional[date] = None
    discharge_window_start: Optional[date] = None
    discharge_window_end: Optional[date] = None
    preferred_vessel_type: Optional[str] = Field("Let AI decide", description="Preferred vessel class or 'Let AI decide'")
    priority: Optional[str] = Field("Balanced", description="Optimization priority: Balanced, Lowest cost, Fastest delivery, Lowest risk")
    max_acceptable_freight: Optional[float] = None
    number_of_voyages: Optional[int] = Field(1, description="Total voyages committed")
    contract_duration: Optional[str] = Field("Single voyage", description="Contract tenure")
    selected_vessel_id: Optional[str] = Field(None, description="Active selected vessel class id")
    simulator_overrides: Optional[SimulatorOverrides] = Field(default_factory=SimulatorOverrides)
    horizon_days: Optional[int] = Field(30, description="Forecast horizon days (7, 14, 30, 60)")


class VoyageEvaluationResponse(BaseModel):
    vessel_recommendations: List[VesselScoreBreakdown] = Field(default_factory=list)
    top_vessel_breakdown: Optional[VesselScoreBreakdown] = None
    idle_prediction: Optional[IdlePredictionResult] = None
    risk_scores: Optional[RiskScoreResult] = None
    voyage_cost: Optional[VoyageCostBreakdown] = None
    contract_comparison: Optional[ContractComparisonResult] = None
    forecast: Optional[ForecastResult] = None
    optimal_window: Optional[OptimalCharterWindow] = None

    model_config = ConfigDict(from_attributes=True)
