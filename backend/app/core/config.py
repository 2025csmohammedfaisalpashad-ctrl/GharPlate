import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = BACKEND_DIR / "gharplate.db"


class Settings(BaseSettings):
    APP_NAME: str = "GharPlate"
    APP_ENV: str = "development"
    APP_VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

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
    SESSION_COOKIE_SECURE: bool = False  # Automatically True when APP_ENV == "production"
    SESSION_COOKIE_SAMESITE: str = "lax"

    # Local Ollama AI Assistant
    ENABLE_LOCAL_AI_ASSISTANT: bool = True
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = ""
    OLLAMA_TIMEOUT_SECONDS: int = 120

    # Open Food Facts (Primary packaged barcode & product discovery provider — API v3 primary)
    ENABLE_EXTERNAL_BARCODE_LOOKUP: bool = True
    OPEN_FOOD_FACTS_API_V3_URL: str = "https://world.openfoodfacts.org/api/v3/product"
    OPEN_FOOD_FACTS_API_URL: str = "https://world.openfoodfacts.org/api/v2/product"
    OPEN_FOOD_FACTS_SEARCH_URL: str = "https://world.openfoodfacts.org/cgi/search.pl"
    OPEN_FOOD_FACTS_USER_AGENT: str = (
        "GharPlate/2.0 (https://github.com/gharplate/gharplate; educational-nutrition-platform)"
    )
    OPEN_FOOD_FACTS_CACHE_HOURS: int = 168
    OPEN_FOOD_FACTS_TIMEOUT_SECONDS: float = 6.0

    # USDA FoodData Central (Supplemental generic & branded food composition provider)
    ENABLE_FOODDATA_CENTRAL: bool = True
    FDC_API_KEY: str = ""
    FDC_API_BASE_URL: str = "https://api.nal.usda.gov/fdc/v1"
    FDC_TIMEOUT_SECONDS: float = 6.0

    # External Web Search Provider Adapter (Brave Search / Tavily)
    ENABLE_EXTERNAL_WEB_SEARCH: bool = False
    WEB_SEARCH_PROVIDER: str = ""  # "brave", "tavily", or ""
    BRAVE_SEARCH_API_KEY: str = ""
    TAVILY_API_KEY: str = ""
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

    VISION_PROVIDER: str = "heuristic_local"
    GEMINI_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_image_mimes_list(self) -> list[str]:
        return [mime.strip() for mime in self.ALLOWED_IMAGE_MIMES.split(",") if mime.strip()]

    @property
    def cookie_secure_flag(self) -> bool:
        return bool(self.SESSION_COOKIE_SECURE or self.APP_ENV.lower() == "production")


settings = Settings()
