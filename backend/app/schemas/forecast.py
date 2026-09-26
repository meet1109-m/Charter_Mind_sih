import uuid
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.voyage import SimulatorOverrides

TrendDirection = Literal["Rising", "Falling", "Stable"]
CharterRecommendation = Literal["Charter Now", "Wait", "Avoid"]
ForecastHorizon = Literal[7, 14, 30, 60]


class ForecastDataPoint(BaseModel):
    date: str = Field(..., description="Date formatted string (YYYY-MM-DD)")
    day_index: int = Field(..., description="Zero-based or sequential day index")
    is_forecast: bool = Field(..., description="True if forecasted, False if historical ground-truth")
    predicted: float = Field(..., description="Forecasted freight rate (USD/MT)")
    lower_bound: float = Field(..., description="Lower 90% confidence interval bound")
    upper_bound: float = Field(..., description="Upper 90% confidence interval bound")
    historical: Optional[float] = Field(None, description="Actual observed freight rate if available")

    model_config = ConfigDict(from_attributes=True)


class FeatureContribution(BaseModel):
    factor: str = Field(..., description="Key market driver (e.g. Brent Crude, Port Queues, Iron Ore Demand)")
    contribution_percent: float = Field(..., description="Weight of factor on freight trajectory (%)")
    direction: Literal["up", "down"] = Field(..., description="Impact vector on rates")
    description: str = Field(..., description="Analytical commentary explaining impact")

    model_config = ConfigDict(from_attributes=True)


class OptimalCharterWindow(BaseModel):
    recommendation: CharterRecommendation = Field(..., description="Actionable advisory: Charter Now, Wait, or Avoid")
    best_window_start: str = Field(..., description="Optimal charter fixing window start date")
    best_window_end: str = Field(..., description="Optimal charter fixing window end date")
    potential_savings_usd: float = Field(..., description="Estimated cost savings vs spot high in USD")
    potential_savings_inr: float = Field(..., description="Estimated cost savings in INR")
    potential_savings_lakhs: float = Field(..., description="Savings in INR Lakhs (₹)")
    trade_off_sentence: str = Field(..., description="Concise charter strategy trade-off summary")
    detailed_rationale: str = Field(..., description="Thorough macroeconomic and fleet supply rationale")

    model_config = ConfigDict(from_attributes=True)


class HistoricalBdiPoint(BaseModel):
    date: str = Field(..., description="Monthly observation date (YYYY-MM-DD)")
    bdi: float = Field(..., description="Baltic Dry Index (BDI) price / benchmark value")

    model_config = ConfigDict(from_attributes=True)


class ForecastResult(BaseModel):
    route: str = Field(..., description="Trade corridor name (e.g. Indonesia -> Paradip)")
    current_rate: float = Field(..., description="Current spot benchmark rate (USD/MT)")
    projected_rate_14d: float = Field(..., description="Projected rate at +14 days (USD/MT)")
    projected_rate_30d: float = Field(..., description="Projected rate at +30 days (USD/MT)")
    trend: TrendDirection = Field(..., description="Predicted freight trajectory")
    trend_percent: float = Field(..., description="Anticipated price shift percentage (%)")
    confidence_score: float = Field(..., ge=0.0, le=100.0, description="Rule-based forecast reliability indicator (0-100) reflecting known route, vessel elasticity, and operational risk adjustments")
    horizon_days: int = Field(..., description="Forecast horizon period in days")
    data_points: List[ForecastDataPoint] = Field(default_factory=list)
    historical_bdi: List[HistoricalBdiPoint] = Field(default_factory=list, description="Genuine monthly Baltic Dry Index historical observations")
    feature_contributions: List[FeatureContribution] = Field(default_factory=list)
    net_expected_change_percent: float = Field(...)
    optimal_charter_window: Optional[OptimalCharterWindow] = None

    model_config = ConfigDict(from_attributes=True)


class ForecastRequest(BaseModel):
    cargo_request_id: uuid.UUID = Field(..., description="Target cargo parcel request")
    horizon_days: ForecastHorizon = Field(30, description="Forecast timeframe (7, 14, 30, or 60 days)")
    simulator_overrides: Optional[SimulatorOverrides] = Field(default_factory=SimulatorOverrides)
