import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import engine, init_db, is_sqlite
from app.middleware.cors import setup_cors
from app.routers import (
    alerts_router,
    auth_router,
    cargo_router,
    chatbot_router,
    contract_router,
    forecast_router,
    port_router,
    reports_router,
    risk_router,
    seed_router,
    simulator_router,
    vessel_router,
    voyage_router,
)
from app.utils.firebase_admin import get_firebase_app, initialize_firebase, is_mock_mode

# Configure structured application logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s:%(lineno)d - %(message)s",
)
logger = logging.getLogger("uvicorn.error")
# Reload trigger for chatbot router integration


# 1. Modern FastAPI Lifespan Context Manager (Startup & Graceful Shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Modern FastAPI lifespan context manager handling startup and graceful shutdown."""
    logger.info(f"Starting {settings.APP_NAME} (Version: {settings.API_VERSION})...")
    logger.info(f"Debug Mode: {settings.DEBUG}")

    # A. Initialize Firebase Admin SDK singleton
    fb_app = initialize_firebase()
    if is_mock_mode():
        logger.warning("Firebase Admin initialized in local development mock authentication mode.")
    elif fb_app:
        logger.info("Firebase Admin SDK successfully connected.")

    # B. Auto-create database tables via Base.metadata.create_all() (with SQLite fallback)
    try:
        await init_db()
        db_type = "SQLite" if is_sqlite else "PostgreSQL"
        logger.info(f"{db_type} database tables verified and initialized successfully.")
    except Exception as err:
        logger.warning(
            f"Database table initialization notice: {err}. "
            f"Ensure database is accessible."
        )

    # C. Print startup banner with documentation URL
    banner = (
        f"\n{'='*70}\n"
        f"  {settings.APP_NAME} {settings.API_VERSION} IS READY!\n"
        f"  Interactive Swagger Docs: http://localhost:8000/docs\n"
        f"  ReDoc Documentation:     http://localhost:8000/redoc\n"
        f"  Base API Endpoint:        http://localhost:8000{settings.API_V1_PREFIX}\n"
        f"{'='*70}\n"
    )
    print(banner)

    yield

    # Shutdown: Cleanly dispose database connection pool
    logger.info(f"Shutting down {settings.APP_NAME}... Disposing database connection pool.")
    try:
        await engine.dispose()
        logger.info("Database connection pool disposed successfully.")
    except Exception as err:
        logger.warning(f"Notice while disposing database engine: {err}")


# 2. Initialize FastAPI Application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    description=(
        "Production-ready backend for Maritime Bulk Freight Forecasting, "
        "Vessel Optimization, and Chartering Intelligence (SIH Hackathon)."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# 3. Configure Cross-Origin Resource Sharing
setup_cors(app)


# 4. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(f"Unhandled error handling request {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": "An internal server error occurred.",
            "detail": str(exc) if settings.DEBUG else None,
        },
    )


# 5. Root & Health Check Endpoints
@app.get("/", tags=["Health Check"], summary="Root service status")
async def root() -> Dict[str, str]:
    """Root health check endpoint."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.API_VERSION,
    }


@app.get(f"{settings.API_V1_PREFIX}/health", tags=["Health Check"], summary="API v1 system health")
@app.get("/health", tags=["Health Check"], summary="Alternative health check")
@app.get("/api/health", tags=["Health Check"], summary="Compatibility health check alias")
async def api_health() -> Dict[str, Any]:
    """Inspect database connectivity and Firebase SDK state."""
    db_status = "connected"
    active_dialect = "sqlite" if is_sqlite else "postgresql"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as err:
        db_status = f"unreachable ({err})"

    fb_status = "mock_dev" if is_mock_mode() else ("initialized" if get_firebase_app() else "not_configured")

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "database_dialect": active_dialect,
        "firebase": fb_status,
    }


@app.get("/api/model-info", tags=["Freight Forecasting"], summary="ML model metadata (compatibility alias)")
@app.get(f"{settings.API_V1_PREFIX}/ml/model-info", tags=["Freight Forecasting"], summary="ML model metadata and benchmarks")
async def root_model_info() -> Dict[str, Any]:
    """Inspect trained Ridge regression model metadata, feature importances, and validation metrics."""
    from app.services.forecast_engine import MLModelManager
    return MLModelManager.get_instance().metadata


# 6. Mount all Domain Routers under /api/v1
prefix = settings.API_V1_PREFIX

app.include_router(auth_router, prefix=prefix, tags=["Authentication"])
app.include_router(cargo_router, prefix=prefix, tags=["Cargo Requests"])
app.include_router(vessel_router, prefix=prefix, tags=["Vessel Intelligence"])
app.include_router(port_router, prefix=prefix, tags=["Port Intelligence"])
app.include_router(voyage_router, prefix=prefix, tags=["Voyage Planning"])
app.include_router(forecast_router, prefix=prefix, tags=["Freight Forecasting"])
app.include_router(risk_router, prefix=prefix, tags=["Risk Engine"])
app.include_router(contract_router, prefix=prefix, tags=["Contract Advisor"])
app.include_router(simulator_router, prefix=prefix, tags=["What-If Simulator"])
app.include_router(alerts_router, prefix=prefix, tags=["Alerts"])
app.include_router(reports_router, prefix=prefix, tags=["Reports"])
app.include_router(chatbot_router, prefix=prefix, tags=["AI Chatbot"])

# Dev / Admin Seed Router (only if DEBUG=True)
if settings.DEBUG:
    app.include_router(seed_router, prefix=prefix, tags=["Dev Seed"])
