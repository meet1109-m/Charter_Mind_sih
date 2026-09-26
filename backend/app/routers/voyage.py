import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user, get_optional_user
from app.models.cargo_request import CargoRequest
from app.models.user import User
from app.models.voyage_plan import VoyagePlan
from app.routers.alerts import check_and_create_operational_alerts
from app.schemas.cargo import CargoRequestResponse
from app.schemas.evaluation import (
    VoyageEvaluationRequest,
    VoyageEvaluationResponse,
)
from app.schemas.voyage import (
    SimulatorOverrides,
    VoyageCostBreakdown,
    VoyagePlanRequest,
    VoyagePlanResponse,
)
from app.services.contract_advisor import compare_contracts
from app.services.cost_calculator import calculate_voyage_cost
from app.services.forecast_engine import determine_optimal_window, generate_forecast
from app.services.idle_predictor import predict_idle_time
from app.services.risk_engine import calculate_risk_scores
from app.services.vessel_scorer import recommend_vessels
from app.utils.constants import (
    PORT_SPECS,
    ROUTE_BASELINE_RATES,
    VESSEL_RATE_MULTIPLIERS,
    VESSEL_SPECS,
)

router = APIRouter(prefix="/voyage", tags=["Voyage Planner & Optimization"])


def _run_voyage_pipeline(
    cargo: CargoRequest,
    overrides: Optional[SimulatorOverrides] = None,
    final_vessel_class: Optional[str] = None,
) -> Dict[str, Any]:
    """Internal helper to orchestrate vessel selection, risk, idle, and cost calculations."""
    port = PORT_SPECS.get(cargo.destination_port)
    if not port:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown port '{cargo.destination_port}'",
        )

    # 1. Recommend & Rank Vessels
    scored_vessels = recommend_vessels(cargo, port, overrides)
    top_recommended = scored_vessels[0]

    # 2. Select final vessel (user override or algorithm choice)
    selected_breakdown = top_recommended
    if final_vessel_class:
        matched = next(
            (s for s in scored_vessels if s.vessel.id.lower() == final_vessel_class.lower()),
            None,
        )
        if matched:
            selected_breakdown = matched

    vessel = selected_breakdown.vessel

    # 3. Calculate multi-vector risk scores
    risk_scores = calculate_risk_scores(cargo, vessel, port, overrides)

    # 4. Predict idle turnaround & waiting hours
    weather = overrides.weather if overrides else "Normal"
    congestion = overrides.congestion if overrides else port.congestion
    idle_result = predict_idle_time(
        port, vessel, weather, congestion, selected_breakdown.compatibility
    )

    # 5. Compute full voyage financial breakdown
    cost_breakdown = calculate_voyage_cost(
        cargo, vessel, port, idle_result, risk_scores, overrides
    )

    return {
        "vessel": vessel,
        "recommended_vessel_class": top_recommended.vessel.name,
        "final_vessel_class": vessel.name,
        "vessel_score": Decimal(str(selected_breakdown.final_score)),
        "risk_scores": risk_scores,
        "idle_result": idle_result,
        "cost_breakdown": cost_breakdown,
    }


class EvaluatedCargo:
    """Lightweight in-memory cargo adapter to interface with domain calculation engines."""

    def __init__(self, req: VoyageEvaluationRequest):
        self.cargo_type = req.cargo_type or "Coal"
        self.cargo_quantity_mt = Decimal(str(req.cargo_quantity_mt))
        self.origin_country = req.origin_country or "Indonesia"
        self.destination_port = req.destination_port or "Paradip"
        self.required_delivery_date = req.required_delivery_date
        self.loading_window_start = req.loading_window_start
        self.loading_window_end = req.loading_window_end
        self.discharge_window_start = req.discharge_window_start
        self.discharge_window_end = req.discharge_window_end
        self.preferred_vessel_type = req.preferred_vessel_type
        self.max_acceptable_freight = (
            Decimal(str(req.max_acceptable_freight))
            if req.max_acceptable_freight is not None
            else None
        )
        self.number_of_voyages = req.number_of_voyages or 1
        self.contract_duration = req.contract_duration or "Single voyage"
        self.priority = req.priority or "Balanced"


@router.post(
    "/evaluate",
    response_model=VoyageEvaluationResponse,
    summary="Real-time multi-engine voyage evaluation without database persistence",
)
async def evaluate_voyage(
    req: VoyageEvaluationRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> VoyageEvaluationResponse:
    """
    Real-time in-memory calculation endpoint powering the frontend interactive simulator.
    Evaluates:
    1. Multi-vessel scoring & ranking across Capesize, Panamax, Supramax, and Handysize.
    2. Port navigational compatibility (draft, LOA, beam envelopes and safety margins).
    3. Multi-vector composite risk scores (market, port, weather, vessel, commodity).
    4. Anchorage turnaround & idle waiting hours prediction.
    5. Full landed voyage cost accounting (USD & INR breakdowns, per MT metrics).
    6. Spot vs CoA contract structure trade-offs.
    7. Machine learning freight rate forecasting & optimal chartering laycan advisory.
    """
    port = PORT_SPECS.get(req.destination_port) or list(PORT_SPECS.values())[0]
    temp_cargo = EvaluatedCargo(req)

    # 1. Recommend & Rank Vessels
    scored_vessels = recommend_vessels(temp_cargo, port, req.simulator_overrides)
    top_recommended = scored_vessels[0] if scored_vessels else None

    # 2. Final Vessel Choice (User override or algorithm recommendation)
    selected_breakdown = top_recommended
    if req.selected_vessel_id and scored_vessels:
        matched = next(
            (s for s in scored_vessels if s.vessel.id.lower() == req.selected_vessel_id.lower()),
            None,
        )
        if matched:
            selected_breakdown = matched

    vessel = selected_breakdown.vessel if selected_breakdown else list(VESSEL_SPECS.values())[1]

    # 3. Multi-vector risk assessment
    risk_scores = calculate_risk_scores(temp_cargo, vessel, port, req.simulator_overrides)

    # 4. Idle turnaround & waiting hours
    weather = req.simulator_overrides.weather if req.simulator_overrides else "Normal"
    congestion = req.simulator_overrides.congestion if req.simulator_overrides else port.congestion
    idle_result = predict_idle_time(
        port,
        vessel,
        weather,
        congestion,
        selected_breakdown.compatibility if selected_breakdown else None,
    )

    # 5. Full voyage cost accounting
    cost_breakdown = calculate_voyage_cost(
        temp_cargo, vessel, port, idle_result, risk_scores, req.simulator_overrides
    )

    # 6. Spot vs CoA contract comparison
    contract_comp = compare_contracts(temp_cargo, vessel, cost_breakdown, risk_scores)

    # 7. ML freight rate forecast
    route_name = f"{req.origin_country} → {req.destination_port}"
    base_rate = ROUTE_BASELINE_RATES.get(req.origin_country, {}).get(
        req.destination_port, 18.0
    )
    mult = VESSEL_RATE_MULTIPLIERS.get(vessel.id.lower(), 1.0)
    adjusted_base_rate = round(base_rate * mult, 2)

    forecast_result = generate_forecast(
        route=route_name,
        base_rate=adjusted_base_rate,
        horizon_days=req.horizon_days or 30,
        overrides=req.simulator_overrides,
        vessel_class=vessel.name,
        cargo_type=req.cargo_type or "Coal",
    )

    # 8. Optimal charter window advisory
    optimal_window = determine_optimal_window(forecast_result, temp_cargo, risk_scores)

    # Automatically create operational alerts if risk breaches High/Critical or idle wait > 48h
    if current_user and db:
        await check_and_create_operational_alerts(
            db=db,
            user_id=current_user.id,
            risk_scores=risk_scores,
            idle_hours=idle_result.expected_idle_hours,
            port_name=port.name,
            origin_country=req.origin_country,
            cargo_type=req.cargo_type,
        )

    return VoyageEvaluationResponse(
        vessel_recommendations=scored_vessels,
        top_vessel_breakdown=selected_breakdown,
        idle_prediction=idle_result,
        risk_scores=risk_scores,
        voyage_cost=cost_breakdown,
        contract_comparison=contract_comp,
        forecast=forecast_result,
        optimal_window=optimal_window,
    )


@router.post(
    "/plan",
    response_model=VoyagePlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate and persist an optimized voyage plan",
)
async def create_voyage_plan(
    req: VoyagePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoyagePlanResponse:
    """
    Executes the comprehensive maritime calculation engine and saves the optimized plan to PostgreSQL:
    1. Fetches CargoRequest for authenticated user
    2. Recommends best vessel class
    3. Evaluates composite risk scores
    4. Predicts anchorage idle time
    5. Calculates full landed freight cost breakdown
    6. Persists VoyagePlan
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

    pipeline = _run_voyage_pipeline(cargo, req.simulator_overrides, req.final_vessel_class)
    cost: VoyageCostBreakdown = pipeline["cost_breakdown"]
    risk = pipeline["risk_scores"]
    idle = pipeline["idle_result"]

    overrides_dict = req.simulator_overrides.model_dump() if req.simulator_overrides else {}

    plan = VoyagePlan(
        cargo_request_id=cargo.id,
        user_id=current_user.id,
        recommended_vessel_class=pipeline["recommended_vessel_class"],
        final_vessel_class=pipeline["final_vessel_class"],
        vessel_score=pipeline["vessel_score"],
        freight_cost_usd=cost.freight_cost_usd,
        port_charges_usd=cost.port_charges_usd,
        loading_discharge_cost_usd=cost.loading_discharge_cost_usd,
        idle_waiting_cost_usd=cost.idle_waiting_cost_usd,
        demurrage_exposure_usd=cost.demurrage_exposure_usd,
        total_cost_usd=cost.total_cost_usd,
        total_cost_inr=cost.total_cost_inr,
        cost_per_mt_usd=cost.cost_per_mt_usd,
        freight_rate_per_mt=cost.freight_rate_per_mt,
        expected_idle_hours=Decimal(str(idle.expected_idle_hours)),
        risk_score_overall=Decimal(str(risk.overall_score)),
        risk_bucket=risk.bucket,
        simulator_overrides=overrides_dict,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)

    res = VoyagePlanResponse.model_validate(plan)
    res.cost_breakdown = cost
    res.cargo_request = CargoRequestResponse.model_validate(cargo)
    return res


@router.post(
    "/simulate",
    response_model=VoyagePlanResponse,
    summary="Simulate voyage plan without persisting to DB (What-If)",
)
async def simulate_voyage_plan(
    req: VoyagePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoyagePlanResponse:
    """Executes the calculation pipeline with What-If scenario overrides without modifying PostgreSQL."""
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

    pipeline = _run_voyage_pipeline(cargo, req.simulator_overrides, req.final_vessel_class)
    cost: VoyageCostBreakdown = pipeline["cost_breakdown"]
    risk = pipeline["risk_scores"]
    idle = pipeline["idle_result"]

    overrides_dict = req.simulator_overrides.model_dump() if req.simulator_overrides else {}

    # Build simulated transient VoyagePlan response
    transient_id = uuid.uuid4()
    from datetime import datetime, timezone

    return VoyagePlanResponse(
        id=transient_id,
        cargo_request_id=cargo.id,
        user_id=current_user.id,
        recommended_vessel_class=pipeline["recommended_vessel_class"],
        final_vessel_class=pipeline["final_vessel_class"],
        vessel_score=pipeline["vessel_score"],
        freight_cost_usd=cost.freight_cost_usd,
        port_charges_usd=cost.port_charges_usd,
        loading_discharge_cost_usd=cost.loading_discharge_cost_usd,
        idle_waiting_cost_usd=cost.idle_waiting_cost_usd,
        demurrage_exposure_usd=cost.demurrage_exposure_usd,
        total_cost_usd=cost.total_cost_usd,
        total_cost_inr=cost.total_cost_inr,
        cost_per_mt_usd=cost.cost_per_mt_usd,
        freight_rate_per_mt=cost.freight_rate_per_mt,
        expected_idle_hours=Decimal(str(idle.expected_idle_hours)),
        risk_score_overall=Decimal(str(risk.overall_score)),
        risk_bucket=risk.bucket,
        simulator_overrides=overrides_dict,
        created_at=datetime.now(timezone.utc),
        cost_breakdown=cost,
        cargo_request=CargoRequestResponse.model_validate(cargo),
    )


@router.get(
    "/plans",
    response_model=List[VoyagePlanResponse],
    summary="List all voyage plans for the current user",
)
async def list_voyage_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[VoyagePlanResponse]:
    """Retrieve saved voyage plans for the authenticated user ordered by created_at DESC."""
    stmt = (
        select(VoyagePlan)
        .options(selectinload(VoyagePlan.cargo_request))
        .where(VoyagePlan.user_id == current_user.id)
        .order_by(desc(VoyagePlan.created_at))
    )
    result = await db.execute(stmt)
    plans = result.scalars().all()

    responses: List[VoyagePlanResponse] = []
    for p in plans:
        item = VoyagePlanResponse.model_validate(p)
        if p.cargo_request:
            item.cargo_request = CargoRequestResponse.model_validate(p.cargo_request)
        responses.append(item)
    return responses


@router.get(
    "/plans/{plan_id}",
    response_model=VoyagePlanResponse,
    summary="Get details of a specific voyage plan",
)
async def get_voyage_plan(
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VoyagePlanResponse:
    """Retrieve a single saved voyage plan with its cost breakdown and linked cargo parcel."""
    stmt = (
        select(VoyagePlan)
        .options(selectinload(VoyagePlan.cargo_request))
        .where(
            VoyagePlan.id == plan_id,
            VoyagePlan.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Voyage plan {plan_id} not found",
        )

    res = VoyagePlanResponse.model_validate(plan)
    if plan.cargo_request:
        res.cargo_request = CargoRequestResponse.model_validate(plan.cargo_request)
    return res
