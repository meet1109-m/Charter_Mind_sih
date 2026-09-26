import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.cargo import CargoRequestResponse, VesselClass

CongestionLevel = Literal["Low", "Medium", "High", "Critical"]
WeatherCondition = Literal["Normal", "Rough", "Severe"]
VesselAvailability = Literal["Available", "Limited", "Scarce"]
RiskBucket = Literal["Low", "Medium", "High", "Critical"]


class SimulatorOverrides(BaseModel):
    congestion: Optional[CongestionLevel] = Field("Medium", description="Port anchorage congestion level override")
    weather: Optional[WeatherCondition] = Field("Normal", description="Marine sea state and weather risk override")
    freight_rate_offset_percent: Optional[float] = Field(0.0, description="Percentage adjustment to spot benchmark freight rate")
    vessel_availability: Optional[VesselAvailability] = Field("Available", description="Fleet chartering market availability")
    port_traffic_zscore: Optional[float] = Field(None, description="Port traffic throughput Z-score override")
    forecast_volatility_signal: Optional[float] = Field(None, description="Forecast freight market volatility signal override")


class VoyagePlanRequest(BaseModel):
    cargo_request_id: uuid.UUID = Field(..., description="ID of the associated cargo request")
    simulator_overrides: Optional[SimulatorOverrides] = Field(default_factory=SimulatorOverrides, description="Optional what-if scenario levers")
    final_vessel_class: Optional[VesselClass] = Field(None, description="Manually selected vessel class override")


class VoyageCostBreakdown(BaseModel):
    freight_cost_usd: Decimal = Field(..., description="Vessel freight hire cost (USD)")
    port_charges_usd: Decimal = Field(..., description="Discharge port and agency charges (USD)")
    loading_discharge_cost_usd: Decimal = Field(..., description="Terminal cargo handling and stevedoring (USD)")
    idle_waiting_cost_usd: Decimal = Field(..., description="Vessel anchorage idle waiting cost (USD)")
    demurrage_exposure_usd: Decimal = Field(..., description="Estimated laytime demurrage penalty risk (USD)")
    total_cost_usd: Decimal = Field(..., description="Total voyage landed expenditure (USD)")
    total_cost_inr: Decimal = Field(..., description="Total voyage landed cost in INR")
    total_cost_inr_lakhs: float = Field(..., description="Total cost in INR Lakhs (₹)")
    total_cost_inr_crores: float = Field(..., description="Total cost in INR Crores (₹)")
    cost_per_mt_usd: Decimal = Field(..., description="Effective landed cost per Metric Ton in USD")
    freight_rate_per_mt: Decimal = Field(..., description="Base freight rate per Metric Ton in USD")
    percentages: Dict[str, float] = Field(
        default_factory=dict,
        description="Share of total cost: freight, port, handling, idle, demurrage",
    )


class VoyagePlanResponse(BaseModel):
    id: uuid.UUID
    cargo_request_id: uuid.UUID
    user_id: uuid.UUID
    recommended_vessel_class: str
    final_vessel_class: str
    vessel_score: Optional[Decimal] = None
    freight_cost_usd: Decimal
    port_charges_usd: Decimal
    loading_discharge_cost_usd: Decimal
    idle_waiting_cost_usd: Decimal
    demurrage_exposure_usd: Decimal
    total_cost_usd: Decimal
    total_cost_inr: Decimal
    cost_per_mt_usd: Decimal
    freight_rate_per_mt: Decimal
    expected_idle_hours: Decimal
    risk_score_overall: Decimal
    risk_bucket: str
    simulator_overrides: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    cost_breakdown: Optional[VoyageCostBreakdown] = None
    cargo_request: Optional[CargoRequestResponse] = None

    model_config = ConfigDict(from_attributes=True)
