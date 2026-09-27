from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # Application Information
    APP_NAME: str = "SIH Freight Forecasting API"
    API_VERSION: str = "v1"
    DEBUG: bool = True

    # Database Configuration (PostgreSQL 15 asyncpg connection)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/sih_freight_db"

    # Firebase Admin SDK Configuration
    FIREBASE_PROJECT_ID: str = "chartermind-417f3"
    FIREBASE_SERVICE_ACCOUNT_PATH: str = "serviceAccount.json"
    FIREBASE_SERVICE_ACCOUNT_JSON: Optional[str] = None

    # Gemini AI Configuration
    GEMINI_API_KEY: Optional[str] = None

    # CORS Allowed Origins (Comma-separated string)
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Machine Learning Model & Data Artifact Paths (Optional override for Docker/Cloud)
    ML_MODEL_DIR: Optional[str] = None
    ML_DATA_DIR: Optional[str] = None

    @property
    def API_V1_PREFIX(self) -> str:
        """API v1 prefix based on API_VERSION."""
        return f"/api/{self.API_VERSION}"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated origins into a trimmed list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=(".env", "app/.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton instance of application settings."""
    return Settings()


settings: Settings = get_settings()
