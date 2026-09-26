from datetime import datetime, timezone
from decimal import Decimal
from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.port_snapshot import PortSnapshot
from app.models.user import User
from app.schemas.port import PortSnapshotResponse, PortSpec
from app.utils.constants import PORT_SPECS

router = APIRouter(prefix="/port", tags=["Port Intelligence & Congestion"])


@router.get(
    "",
    response_model=List[PortSpec],
    summary="List all East Coast Indian commercial ports",
)
async def list_ports(
    current_user: User = Depends(get_current_user),
) -> List[PortSpec]:
    """Retrieve specifications and operational parameters for Paradip, Dhamra, Vizag, Haldia, Kolkata."""
    return list(PORT_SPECS.values())


@router.get(
    "/{port_id}",
    response_model=PortSpec,
    summary="Get specifications of a specific port",
)
async def get_port(
    port_id: str,
    current_user: User = Depends(get_current_user),
) -> PortSpec:
    """Fetch draft, crane limits, handling rates, and base dues for a designated port."""
    matched = PORT_SPECS.get(port_id) or next(
        (p for p in PORT_SPECS.values() if p.id.lower() == port_id.lower()),
        None,
    )
    if not matched:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Port '{port_id}' not found. Available: {list(PORT_SPECS.keys())}",
        )
    return matched


@router.get(
    "/{port_id}/snapshot",
    response_model=PortSnapshotResponse,
    summary="Get live operational conditions and queue snapshot for a port",
)
async def get_port_snapshot(
    port_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortSnapshotResponse:
    """
    Fetch the latest recorded queue snapshot from PostgreSQL.
    Falls back to static default values from port specifications if no DB entry exists yet.
    """
    spec = PORT_SPECS.get(port_id) or next(
        (p for p in PORT_SPECS.values() if p.id.lower() == port_id.lower()),
        None,
    )
    if not spec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Port '{port_id}' not found",
        )

    stmt = (
        select(PortSnapshot)
        .where(PortSnapshot.port_id == spec.id)
        .order_by(desc(PortSnapshot.recorded_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    snapshot = result.scalar_one_or_none()

    if snapshot:
        return PortSnapshotResponse.model_validate(snapshot)

    # Persist and cache newly computed port snapshot into DB
    new_snapshot = PortSnapshot(
        port_id=spec.id,
        congestion_level=spec.congestion,
        berthing_wait_days=Decimal(str(spec.berthing_wait_days)),
        handling_rate_mt_per_day=Decimal(str(spec.handling_rate_mt_per_day)),
        weather_risk=spec.weather_risk,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(new_snapshot)
    await db.commit()
    await db.refresh(new_snapshot)
    return PortSnapshotResponse.model_validate(new_snapshot)
