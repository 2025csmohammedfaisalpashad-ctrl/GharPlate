import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "gharplate.db"


class Settings(BaseSettings):
    APP_NAME: str = "GharPlate"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8080"
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB strict limit
    ALLOWED_IMAGE_MIMES: str = "image/jpeg,image/png,image/webp"

    OPEN_FOOD_FACTS_API_URL: str = "https://world.openfoodfacts.org/api/v2/product"
    OPEN_FOOD_FACTS_USER_AGENT: str = (
        "GharPlate/1.0 (https://github.com/gharplate/gharplate; educational-nutrition-platform)"
    )
    ENABLE_EXTERNAL_BARCODE_LOOKUP: bool = True

    VISION_PROVIDER: str = "heuristic_local"
    GEMINI_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_image_mimes_list(self) -> List[str]:
        return [mime.strip() for mime in self.ALLOWED_IMAGE_MIMES.split(",") if mime.strip()]


settings = Settings()
