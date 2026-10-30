from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.init_db import seed_database
from app.db.session import Base, SessionLocal, engine


def initialize_and_seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db, write_report=True)
    finally:
        db.close()


# Ensure tables and image_url columns are always initialized even when TestClient is used without context manager
initialize_and_seed()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_and_seed()
    yield


app = FastAPI(
    title=f"{settings.APP_NAME} — Indian Household Food Intelligence API",
    description=(
        "Evidence-based Indian food composition, multilingual search (English, Hindi, Kannada), "
        "condition-aware nutrition guidance, household profiles, recipe calculator, label OCR, "
        "barcode lookup, product comparison, and meal suggestions."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def safe_global_exception_handler(request: Request, exc: Exception):
    """
    Security safeguard: Prevent internal stack traces from leaking in unhandled 500 responses.
    """
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal processing error occurred. No personal or image data was persisted.",
            "error_type": exc.__class__.__name__,
        },
    )


app.include_router(api_router, prefix=settings.API_V1_STR)
