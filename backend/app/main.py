from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from app.database.config import settings
from app.database.connection import get_db_info, logger
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.syllabus import router as syllabus_router
from app.api.dbms_insights import router as dbms_router
from app.api.exports import router as exports_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PostgreSQL schema is owned by Alembic migrations (database/migrations) because it
    carries views, triggers and functions that create_all() cannot express.
    SQLite is the zero-config dev/test fallback and is built directly from the ORM.
    """
    from app.database.connection import db_engine, db_dialect, Base
    from app.models import entities  # noqa: F401 — ensure models are registered
    if db_dialect == "sqlite":
        Base.metadata.create_all(bind=db_engine)
    elif not inspect(db_engine).has_table("alembic_version"):
        logger.error(
            "Database schema is not initialised. Run: "
            "alembic -c database/migrations/alembic.ini upgrade head"
        )
    yield

app = FastAPI(
    title="OptiTeach API",
    description="A DBMS-Centric Intelligent Course Teaching & Optimization Platform",
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for seamless local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(courses_router, prefix=settings.API_PREFIX)
app.include_router(syllabus_router, prefix=settings.API_PREFIX)
app.include_router(dbms_router, prefix=settings.API_PREFIX)
app.include_router(exports_router, prefix=settings.API_PREFIX)

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "philosophy": "DBMS is the CORE. AI/Optimization is the INTELLIGENCE. Dashboard is the PRODUCT.",
        "docs_url": "/docs"
    }

@app.get("/health")
def healthcheck():
    return {
        "status": "healthy",
        "database": get_db_info()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
