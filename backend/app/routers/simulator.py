import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.cargo_request import CargoRequest
from app.models.user import User
from app.routers.alerts import check_and_create_operational_alerts
from app.schemas.forecast import ForecastResult
from app.schemas.idle import IdlePredictionResult
from app.schemas.risk import RiskScoreResult
from app.schemas.vessel import VesselScoreBreakdown
from app.schemas.voyage import SimulatorOverrides, VoyageCostBreakdown
from app.services.cost_calculator import calculate_voyage_cost
from app.services.forecast_engine import generate_forecast
from app.services.idle_predictor import predict_idle_time
from app.services.risk_engine import calculate_risk_scores
from app.services.vessel_scorer import recommend_vessels
from app.utils.constants import PORT_SPECS, ROUTE_BASELINE_RATES

router = APIRouter(prefix="/simulator", tags=["What-If Scenario Simulator"])


class SimulatorRunRequest(BaseModel):
    cargo_request_id: uuid.UUID = Field(..., description="Cargo request ID to execute simulation for")
    simulator_overrides: Optional[SimulatorOverrides] = Field(
        default_factory=SimulatorOverrides,
        description="Dynamic levers: congestion, weather, freight rate offset, vessel availability",
    )


class SimulatorCombinedResponse(BaseModel):
    cargo_request_id: uuid.UUID
    cost_breakdown: VoyageCostBreakdown
    vessel_recommendations: List[VesselScoreBreakdown]
    risk_scores: RiskScoreResult
    idle_prediction: IdlePredictionResult
    forecast: ForecastResult


@router.post(
    "/run",
    response_model=SimulatorCombinedResponse,
    summary="Run interactive What-If scenario simulation",
)
async def run_simulation(
    req: SimulatorRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SimulatorCombinedResponse:
    """
    Executes the entire maritime modeling pipeline with simulated market and port levers:
    - Port congestion shifts (Low, Medium, High, Critical)
    - Marine sea states (Normal, Rough, Severe)
    - Freight benchmark price shocks (offset percentage)
    - Vessel supply constraints (Available, Limited, Scarce)
    
    Returns real-time re-calculated costs, vessel rankings, risk scores, idle times, and forecasts.
    """
    stmt = (
        select(CargoRequest)
        .where(
            CargoRequest.id == req.cargo_request_id,
            CargoRequest.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    cargo = result.scalar_one_or_none()
    if not cargo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cargo request {req.cargo_request_id} not found",
        )

    port = PORT_SPECS.get(cargo.destination_port)
    if not port:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Port '{cargo.destination_port}' not found in specifications",
        )

    overrides = req.simulator_overrides or SimulatorOverrides()

    # 1. Vessel Rankings under scenario
    vessel_recommendations = recommend_vessels(cargo, port, overrides)
    top_vessel = vessel_recommendations[0].vessel
    top_compat = vessel_recommendations[0].compatibility

    # 2. Risk Engine under scenario
    risk_scores = calculate_risk_scores(cargo, top_vessel, port, overrides)

    # 3. Idle turnaround under scenario
    idle_prediction = predict_idle_time(
        port, top_vessel, overrides.weather, overrides.congestion, top_compat
    )

    # 4. Voyage Cost under scenario
    cost_breakdown = calculate_voyage_cost(
        cargo, top_vessel, port, idle_prediction, risk_scores, overrides
    )

    # 5. ML Forecast under scenario
    base_rate = ROUTE_BASELINE_RATES.get(cargo.origin_country, {}).get(
        cargo.destination_port, 18.0
    )
    route_name = f"{cargo.origin_country} → {cargo.destination_port}"
    forecast = generate_forecast(route_name, base_rate, 30, overrides)

    # Automatically create operational alerts if risk breaches High/Critical or idle wait > 48h
    await check_and_create_operational_alerts(
        db=db,
        user_id=current_user.id,
        risk_scores=risk_scores,
        idle_hours=idle_prediction.expected_idle_hours,
        port_name=port.name,
        origin_country=cargo.origin_country,
        cargo_type=cargo.cargo_type,
    )

    return SimulatorCombinedResponse(
        cargo_request_id=cargo.id,
        cost_breakdown=cost_breakdown,
        vessel_recommendations=vessel_recommendations,
        risk_scores=risk_scores,
        idle_prediction=idle_prediction,
        forecast=forecast,
    )
