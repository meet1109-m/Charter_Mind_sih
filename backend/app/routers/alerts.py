import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.alert import Alert
from app.models.user import User
from app.schemas.alert import AlertCreate, AlertResponse

router = APIRouter(prefix="/alerts", tags=["Operational Alerts & Warnings"])

DEFAULT_SEED_ALERTS = [
    {
        "type": "danger",
        "title": "Critical Anchorage Congestion Alert - Paradip",
        "message": "Mechanized coal berth queue has extended to 4.2 days due to monsoon swell constraints. Recommend shifting prompt parcel stem to Dhamra.",
        "impact_metric": "+$54,000 demurrage",
        "action_required": True,
    },
    {
        "type": "warning",
        "title": "Singapore VLSFO Bunker Fuel Price Surge",
        "message": "Singapore Marine 0.5% VLSFO benchmark gained +$24/MT in 48h. Recommend adjusting voyage speed regime to eco-steaming (12.5kn).",
        "impact_metric": "+3.8% voyage OPEX",
        "action_required": True,
    },
    {
        "type": "info",
        "title": "Favorable Ballaster Fleet Influx in Bay of Bengal",
        "message": "14 Panamax bulkers clearing discharge at Haldia are repositioning prompt. Softening prompt Pacific spot charter bids.",
        "impact_metric": "-$1.40/MT freight",
        "action_required": False,
    },
    {
        "type": "warning",
        "title": "Sandheads Bar Draft Restriction Notice - Haldia",
        "message": "SMP Kolkata issued seasonal tidal draft ceiling of 8.6m across Eden Channel through September. Supramax vessels require lighterage.",
        "impact_metric": "Draft constraint",
        "action_required": True,
    },
    {
        "type": "success",
        "title": "CoA Volume Discount Advisory - Vizag Corridor",
        "message": "Multiple-voyage freight strategy generated for 3-stem coking coal commitment from Australia, unlocking guaranteed vessel priority.",
        "impact_metric": "₹142.5 Lakhs saved",
        "action_required": False,
    },
]


async def check_and_create_operational_alerts(
    db: AsyncSession,
    user_id: uuid.UUID,
    risk_scores: Optional[Any] = None,
    idle_hours: Optional[float] = None,
    port_name: Optional[str] = None,
    origin_country: Optional[str] = None,
    cargo_type: Optional[str] = None,
) -> List[Alert]:
    """
    Evaluates scenario metrics and automatically generates an operational Alert row when:
    1. The risk bucket is 'High' or 'Critical'
    2. Expected pre-berthing idle waiting hours exceed 48.0 hours
    
    Prevents duplicate alerts if an active (undismissed) alert for that exact condition already exists.
    """
    created_alerts: List[Alert] = []

    # 1. Evaluate Risk Bucket Thresholds ('High' or 'Critical')
    if risk_scores is not None:
        bucket = getattr(risk_scores, "bucket", None)
        overall_score = getattr(risk_scores, "overall_score", 0.0)
        primary_driver = getattr(risk_scores, "primary_driver", "Voyage Risk")
        summary_sentence = getattr(risk_scores, "summary_sentence", "")

        if bucket in ["High", "Critical"]:
            alert_type = "danger" if bucket == "Critical" else "warning"
            port_label = port_name or "Discharge Port"
            title = f"{bucket} Maritime Risk Alert - {port_label}"
            impact_metric = f"Risk Score: {overall_score}/100 ({bucket})"
            message = (
                summary_sentence
                or f"Voyage scenario evaluation triggered an elevated {bucket} risk alert driven by {primary_driver}."
            )

            # Check if an undismissed alert for this exact condition/title already exists for user
            stmt = select(Alert).where(
                Alert.user_id == user_id,
                Alert.is_dismissed == False,
                Alert.title == title,
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if not existing:
                new_alert = Alert(
                    user_id=user_id,
                    type=alert_type,
                    title=title,
                    message=message,
                    impact_metric=impact_metric,
                    action_required=True,
                    is_dismissed=False,
                )
                db.add(new_alert)
                created_alerts.append(new_alert)

    # 2. Evaluate Pre-berthing Idle Waiting Hours Threshold (> 48.0 hours)
    if idle_hours is not None and idle_hours > 48.0:
        port_label = port_name or "Anchorage"
        title = f"Critical Berth Delay Advisory - {port_label}"
        alert_type = "danger" if idle_hours >= 72.0 else "warning"
        impact_metric = f"+{idle_hours:.1f}h idle wait"
        message = (
            f"Projected pre-berthing wait time at {port_label} has reached {idle_hours:.1f} hours, "
            f"exceeding the 48.0-hour demurrage mitigation threshold."
        )

        stmt = select(Alert).where(
            Alert.user_id == user_id,
            Alert.is_dismissed == False,
            Alert.title == title,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            new_alert = Alert(
                user_id=user_id,
                type=alert_type,
                title=title,
                message=message,
                impact_metric=impact_metric,
                action_required=True,
                is_dismissed=False,
            )
            db.add(new_alert)
            created_alerts.append(new_alert)

    if created_alerts:
        await db.commit()
        for a in created_alerts:
            await db.refresh(a)

    return created_alerts



@router.get(
    "",
    response_model=List[AlertResponse],
    summary="List active operational notifications for current user",
)
async def list_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Alert]:
    """
    Retrieve all non-dismissed alerts for the current user.
    If the user has no alerts in PostgreSQL, seeds 5 initial maritime operational notices.
    """
    stmt = (
        select(Alert)
        .where(
            Alert.user_id == current_user.id,
            Alert.is_dismissed == False,
        )
        .order_by(desc(Alert.created_at))
    )
    result = await db.execute(stmt)
    alerts = list(result.scalars().all())

    # Seed initial alerts if user has zero alerts
    if not alerts:
        count_stmt = select(Alert).where(Alert.user_id == current_user.id).limit(1)
        has_any = (await db.execute(count_stmt)).scalar_one_or_none()
        if not has_any:
            new_alerts: List[Alert] = []
            for seed in DEFAULT_SEED_ALERTS:
                a = Alert(
                    user_id=current_user.id,
                    type=seed["type"],
                    title=seed["title"],
                    message=seed["message"],
                    impact_metric=seed["impact_metric"],
                    action_required=seed["action_required"],
                    is_dismissed=False,
                )
                db.add(a)
                new_alerts.append(a)
            await db.commit()
            for a in new_alerts:
                await db.refresh(a)
            return new_alerts

    return alerts


@router.post(
    "",
    response_model=AlertResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom operational alert",
)
async def create_alert(
    alert_in: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Alert:
    """Create a new notification entry for the authenticated user."""
    alert = Alert(
        user_id=current_user.id,
        type=alert_in.type,
        title=alert_in.title,
        message=alert_in.message,
        impact_metric=alert_in.impact_metric,
        action_required=alert_in.action_required,
        is_dismissed=False,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post(
    "/{alert_id}/dismiss",
    response_model=AlertResponse,
    summary="Dismiss an operational alert",
)
async def dismiss_alert(
    alert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Alert:
    """Mark an alert as dismissed (is_dismissed = True)."""
    stmt = select(Alert).where(
        Alert.id == alert_id,
        Alert.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )

    alert.is_dismissed = True
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete(
    "/{alert_id}",
    summary="Permanently delete an alert",
)
async def delete_alert(
    alert_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Remove an alert permanently from PostgreSQL."""
    stmt = select(Alert).where(
        Alert.id == alert_id,
        Alert.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert {alert_id} not found",
        )

    await db.delete(alert)
    await db.commit()
    return {"status": "success", "message": f"Alert {alert_id} deleted successfully"}
