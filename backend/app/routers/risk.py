from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.cargo_request import CargoRequest
from app.models.port_snapshot import PortSnapshot
from app.models.user import User
from app.routers.alerts import check_and_create_operational_alerts
from app.schemas.port import PortSpec
from app.schemas.risk import RiskScoreRequest, RiskScoreResult
from app.services.risk_engine import calculate_risk_scores
from app.utils.constants import PORT_SPECS, VESSEL_SPECS

router = APIRouter(prefix="/risk", tags=["Risk Engine & Vulnerability Assessment"])


@router.post(
    "/score",
    response_model=RiskScoreResult,
    summary="Calculate comprehensive multi-vector risk scores",
)
async def score_risk(
    req: RiskScoreRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RiskScoreResult:
    """
    Evaluates 5-vector maritime risks (Market, Port, Weather, Vessel, Commodity)
    combining database records, live port snapshots, and What-If scenario levers.
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

    # Resolve destination port spec
    base_port = PORT_SPECS.get(cargo.destination_port)
    if not base_port:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Port '{cargo.destination_port}' not found in specifications",
        )

    # Check for live port snapshot to update congestion/weather
    snap_stmt = (
        select(PortSnapshot)
        .where(PortSnapshot.port_id == base_port.id)
        .order_by(desc(PortSnapshot.recorded_at))
        .limit(1)
    )
    snap_res = await db.execute(snap_stmt)
    snapshot = snap_res.scalar_one_or_none()

    active_port = base_port
    if snapshot:
        # Clone PortSpec with live snapshot values
        active_port = PortSpec(
            id=base_port.id,
            name=base_port.name,
            state=base_port.state,
            coordinates=base_port.coordinates,
            max_draft=base_port.max_draft,
            max_loa=base_port.max_loa,
            max_beam=base_port.max_beam,
            congestion=snapshot.congestion_level,
            berthing_wait_days=float(snapshot.berthing_wait_days),
            handling_rate_mt_per_day=float(snapshot.handling_rate_mt_per_day),
            handling_rating=base_port.handling_rating,
            weather_risk=snapshot.weather_risk,
            base_port_fee_usd=base_port.base_port_fee_usd,
            cargo_handling_cost_per_mt=base_port.cargo_handling_cost_per_mt,
            description=base_port.description,
        )

    default_vessel = VESSEL_SPECS.get(
        (cargo.preferred_vessel_type or "panamax").lower(),
        VESSEL_SPECS["panamax"],
    )

    risk_result = calculate_risk_scores(cargo, default_vessel, active_port, req.simulator_overrides)

    # Automatically create operational alerts if risk breaches High/Critical threshold
    await check_and_create_operational_alerts(
        db=db,
        user_id=current_user.id,
        risk_scores=risk_result,
        port_name=active_port.name,
        origin_country=cargo.origin_country,
        cargo_type=cargo.cargo_type,
    )

    return risk_result
