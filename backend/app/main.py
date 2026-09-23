from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.config import settings
from app.database.connection import init_relational_db, init_mongo_db, get_db_info
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.syllabus import router as syllabus_router
from app.api.dbms_insights import router as dbms_router
from app.api.exports import router as exports_router

app = FastAPI(
    title="OptiTeach API",
    description="A DBMS-Centric Intelligent Course Teaching & Optimization Platform",
    version=settings.VERSION
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

@app.on_event("startup")
def on_startup():
    """Create all tables on startup if they don't exist"""
    from app.database.connection import db_engine, Base
    from app.models import entities  # noqa: F401 — ensure models are registered
    Base.metadata.create_all(bind=db_engine)

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
