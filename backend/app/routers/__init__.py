from app.routers.alerts import router as alerts_router
from app.routers.auth import router as auth_router
from app.routers.cargo import router as cargo_router
from app.routers.chatbot import router as chatbot_router
from app.routers.contract import router as contract_router
from app.routers.forecast import router as forecast_router
from app.routers.port import router as port_router
from app.routers.reports import router as reports_router
from app.routers.risk import router as risk_router
from app.routers.seed import router as seed_router
from app.routers.simulator import router as simulator_router
from app.routers.vessel import router as vessel_router
from app.routers.voyage import router as voyage_router

__all__ = [
    "auth_router",
    "cargo_router",
    "chatbot_router",
    "voyage_router",
    "forecast_router",
    "vessel_router",
    "port_router",
    "risk_router",
    "contract_router",
    "simulator_router",
    "alerts_router",
    "reports_router",
    "seed_router",
]
