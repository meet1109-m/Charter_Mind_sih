from app.schemas.alert import AlertBase, AlertCreate, AlertResponse, AlertType
from app.schemas.cargo import (
    CargoPriority,
    CargoRequestBase,
    CargoRequestCreate,
    CargoRequestResponse,
    CargoRequestUpdate,
    CargoStatus,
    CargoType,
    DestinationPort,
    OriginCountry,
    VesselClass,
)
from app.schemas.contract import (
    ContractCompareRequest,
    ContractComparisonResult,
    ContractStrategy,
)
from app.schemas.forecast import (
    CharterRecommendation,
    FeatureContribution,
    ForecastDataPoint,
    ForecastHorizon,
    ForecastRequest,
    ForecastResult,
    HistoricalBdiPoint,
    OptimalCharterWindow,
    TrendDirection,
)
from app.schemas.idle import IdleFactor, IdlePredictionResult, ImpactLevel, ShiftDirection
from app.schemas.port import (
    PortCompatibilityRequest,
    PortCongestion,
    PortName,
    PortSnapshotResponse,
    PortSpec,
    WeatherRiskLevel,
)
from app.schemas.report import ReportCreate, ReportResponse, ReportType
from app.schemas.risk import RiskScoreRequest, RiskScoreResult
from app.schemas.user import UserBase, UserCreate, UserResponse, UserRole, UserUpdate
from app.schemas.vessel import (
    PortCompatibilityResult,
    VesselRecommendRequest,
    VesselRecommendResponse,
    VesselScoreBreakdown,
    VesselSpec,
)
from app.schemas.evaluation import (
    VoyageEvaluationRequest,
    VoyageEvaluationResponse,
)
from app.schemas.voyage import (
    CongestionLevel,
    RiskBucket,
    SimulatorOverrides,
    VesselAvailability,
    VoyageCostBreakdown,
    VoyagePlanRequest,
    VoyagePlanResponse,
    WeatherCondition,
)

__all__ = [
    # User
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserRole",
    # Cargo
    "CargoType",
    "OriginCountry",
    "DestinationPort",
    "VesselClass",
    "CargoPriority",
    "CargoStatus",
    "CargoRequestBase",
    "CargoRequestCreate",
    "CargoRequestUpdate",
    "CargoRequestResponse",
    # Voyage
    "CongestionLevel",
    "WeatherCondition",
    "VesselAvailability",
    "RiskBucket",
    "SimulatorOverrides",
    "VoyagePlanRequest",
    "VoyageCostBreakdown",
    "VoyagePlanResponse",
    # Vessel
    "VesselSpec",
    "PortCompatibilityResult",
    "VesselScoreBreakdown",
    "VesselRecommendRequest",
    "VesselRecommendResponse",
    # Port
    "PortName",
    "PortCongestion",
    "WeatherRiskLevel",
    "PortSpec",
    "PortSnapshotResponse",
    "PortCompatibilityRequest",
    # Forecast
    "TrendDirection",
    "CharterRecommendation",
    "ForecastHorizon",
    "ForecastDataPoint",
    "HistoricalBdiPoint",
    "FeatureContribution",
    "OptimalCharterWindow",
    "ForecastResult",
    "ForecastRequest",
    # Risk
    "RiskScoreResult",
    "RiskScoreRequest",
    # Contract
    "ContractStrategy",
    "ContractComparisonResult",
    "ContractCompareRequest",
    # Alert
    "AlertType",
    "AlertBase",
    "AlertCreate",
    "AlertResponse",
    # Idle
    "ImpactLevel",
    "ShiftDirection",
    "IdleFactor",
    "IdlePredictionResult",
    # Report
    "ReportType",
    "ReportCreate",
    "ReportResponse",
]
