from pathlib import Path
from typing import Any
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "gharplate.db"

_TRUTHY_STRINGS = {"1", "true", "yes", "on", "y", "t"}
_FALSY_STRINGS = {"0", "false", "no", "off", "n", "f"}

_BOOLEAN_FIELD_DEFAULTS: dict[str, bool] = {
    "DEBUG": False,
    "SESSION_COOKIE_SECURE": False,
    "ENABLE_LOCAL_AI_ASSISTANT": True,
    "ENABLE_EXTERNAL_BARCODE_LOOKUP": True,
    "ENABLE_FOODDATA_CENTRAL": True,
    "ENABLE_USDA_FDC_LOOKUP": True,
    "ENABLE_OCR": True,
    "ENABLE_EXPERIMENTAL_DISH_RECOGNITION": True,
    "ENABLE_EXTERNAL_WEB_SEARCH": False,
    "ENABLE_ONLINE_RECIPE_SEARCH": True,
    "ENABLE_PRODUCT_CACHE": True,
}

_NUMERIC_FIELD_DEFAULTS: dict[str, int | float] = {
    "MAX_UPLOAD_SIZE_BYTES": 5 * 1024 * 1024,
    "SESSION_EXPIRE_HOURS": 24,
    "SESSION_REMEMBER_ME_DAYS": 30,
    "OLLAMA_TIMEOUT_SECONDS": 120.0,
    "OPEN_FOOD_FACTS_CACHE_HOURS": 168,
    "OPEN_FOOD_FACTS_TIMEOUT_SECONDS": 6.0,
    "FDC_TIMEOUT_SECONDS": 6.0,
    "WEB_SEARCH_TIMEOUT_SECONDS": 8.0,
    "RECIPE_PROVIDER_TIMEOUT_SECONDS": 6.0,
    "PRODUCT_CACHE_HOURS": 168,
    "EXTERNAL_PROVIDER_MIN_INTERVAL_SECONDS": 0.5,
}

_NON_EMPTY_STRING_DEFAULTS: dict[str, str] = {
    "APP_NAME": "GharPlate",
    "APP_ENV": "development",
    "APP_VERSION": "3.0.0",
    "API_V1_STR": "/api/v1",
    "DATABASE_URL": f"sqlite:///{DEFAULT_SQLITE_PATH}",
    "CORS_ORIGINS": (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,"
        "http://localhost:8080,http://127.0.0.1:8080"
    ),
    "ALLOWED_IMAGE_MIMES": "image/jpeg,image/png,image/webp",
    "SESSION_COOKIE_NAME": "gharplate_session",
    "CSRF_COOKIE_NAME": "gharplate_csrf",
    "SESSION_COOKIE_SAMESITE": "lax",
    "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
}


class Settings(BaseSettings):
    APP_NAME: str = "GharPlate"
    APP_ENV: str = "development"
    APP_VERSION: str = "3.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = f"sqlite:///{DEFAULT_SQLITE_PATH}"

    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:8080"
    )
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB strict limit
    ALLOWED_IMAGE_MIMES: str = "image/jpeg,image/png,image/webp"

    # Authentication & Server-Side Session Cookie Settings
    SESSION_COOKIE_NAME: str = "gharplate_session"
    CSRF_COOKIE_NAME: str = "gharplate_csrf"
    SESSION_EXPIRE_HOURS: int = 24
    SESSION_REMEMBER_ME_DAYS: int = 30
    SESSION_COOKIE_SECURE: bool = False  # Automatically True when APP_ENV == "production" unless explicitly overridden
    SESSION_COOKIE_SAMESITE: str = "lax"

    # Local Ollama AI Assistant
    ENABLE_LOCAL_AI_ASSISTANT: bool = True
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = ""
    OLLAMA_TIMEOUT_SECONDS: float = 120.0

    # OCR & Dish Recognition Feature Flags
    ENABLE_OCR: bool = True
    ENABLE_EXPERIMENTAL_DISH_RECOGNITION: bool = True

    # Open Food Facts (Primary packaged barcode & product discovery provider — API v3 primary)
    ENABLE_EXTERNAL_BARCODE_LOOKUP: bool = True
    OPEN_FOOD_FACTS_API_V3_URL: str = "https://world.openfoodfacts.org/api/v3/product"
    OPEN_FOOD_FACTS_API_URL: str = "https://world.openfoodfacts.org/api/v2/product"
    OPEN_FOOD_FACTS_SEARCH_URL: str = "https://world.openfoodfacts.org/cgi/search.pl"
    OPEN_FOOD_FACTS_USER_AGENT: str = (
        "GharPlate/3.0 (https://github.com/gharplate/gharplate; educational-nutrition-platform)"
    )
    OPEN_FOOD_FACTS_CACHE_HOURS: int = 168
    OPEN_FOOD_FACTS_TIMEOUT_SECONDS: float = 6.0

    # USDA FoodData Central (Supplemental generic & branded food composition provider)
    ENABLE_FOODDATA_CENTRAL: bool = True
    ENABLE_USDA_FDC_LOOKUP: bool = True
    FDC_API_KEY: str = ""
    USDA_FDC_API_KEY: str = ""
    FDC_API_BASE_URL: str = "https://api.nal.usda.gov/fdc/v1"
    FDC_TIMEOUT_SECONDS: float = 6.0

    # External Web Search Provider Adapter (Brave Search / Tavily)
    ENABLE_EXTERNAL_WEB_SEARCH: bool = False
    WEB_SEARCH_PROVIDER: str = ""  # "brave", "tavily", or ""
    BRAVE_SEARCH_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
    WEB_SEARCH_API_KEY: str = ""
    WEB_SEARCH_TIMEOUT_SECONDS: float = 8.0

    # Online Recipe Discovery Providers (Edamam Recipe API v2 + TheMealDB Open API)
    ENABLE_ONLINE_RECIPE_SEARCH: bool = True
    EDAMAM_APP_ID: str = ""
    EDAMAM_APP_KEY: str = ""
    EDAMAM_RECIPE_API_URL: str = "https://api.edamam.com/api/recipes/v2"
    THEMEALDB_API_URL: str = "https://www.themealdb.com/api/json/v1/1"
    RECIPE_PROVIDER_TIMEOUT_SECONDS: float = 6.0

    # Data Caching & Rate Limiting
    ENABLE_PRODUCT_CACHE: bool = True
    PRODUCT_CACHE_HOURS: int = 168
    EXTERNAL_PROVIDER_MIN_INTERVAL_SECONDS: float = 0.5

    VISION_PROVIDER: str = "ollama_local_vision"
    OLLAMA_VISION_MODEL: str = "qwen2.5vl:7b"
    OLLAMA_VISION_BASE_URL: str = ""
    GEMINI_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    @model_validator(mode="before")
    @classmethod
    def sanitize_blank_env_values(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        sanitized = dict(data)
        raw_cookie_secure = sanitized.get("SESSION_COOKIE_SECURE")
        explicit_cookie_secure = not (
            raw_cookie_secure is None
            or (isinstance(raw_cookie_secure, str) and raw_cookie_secure.strip() == "")
        )

        for key, value in list(sanitized.items()):
            if value is None or (isinstance(value, str) and value.strip() == ""):
                if key in _BOOLEAN_FIELD_DEFAULTS:
                    sanitized[key] = _BOOLEAN_FIELD_DEFAULTS[key]
                elif key in _NUMERIC_FIELD_DEFAULTS:
                    sanitized[key] = _NUMERIC_FIELD_DEFAULTS[key]
                elif key in _NON_EMPTY_STRING_DEFAULTS:
                    sanitized[key] = _NON_EMPTY_STRING_DEFAULTS[key]
                else:
                    sanitized[key] = ""
            elif key in _BOOLEAN_FIELD_DEFAULTS and isinstance(value, str):
                cleaned = value.strip().lower()
                if cleaned in _TRUTHY_STRINGS:
                    sanitized[key] = True
                elif cleaned in _FALSY_STRINGS:
                    sanitized[key] = False

        app_env = str(
            sanitized.get("APP_ENV", _NON_EMPTY_STRING_DEFAULTS["APP_ENV"])
        ).strip().lower()
        if app_env == "production" and not explicit_cookie_secure:
            sanitized["SESSION_COOKIE_SECURE"] = True

        return sanitized

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_image_mimes_list(self) -> list[str]:
        return [mime.strip() for mime in self.ALLOWED_IMAGE_MIMES.split(",") if mime.strip()]

    @property
    def cookie_secure_flag(self) -> bool:
        return bool(self.SESSION_COOKIE_SECURE or self.APP_ENV.strip().lower() == "production")


settings = Settings()
