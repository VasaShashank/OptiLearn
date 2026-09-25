from pathlib import Path
from pydantic_settings import BaseSettings
import os

# backend/ directory — anchors file-based paths so they don't depend on the CWD
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "OptiTeach"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://postgres:postgres@localhost:5432/optiteach"
    )
    SQLITE_FALLBACK_URL: str = os.getenv(
        "SQLITE_FALLBACK_URL",
        f"sqlite:///{(BACKEND_DIR / 'optiteach.db').as_posix()}"
    )
    
    # MongoDB
    # "mongomock://" skips the server and uses the in-memory engine (tests)
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "optiteach_artifacts")
    
    # Security & Auth
    SECRET_KEY: str = os.getenv("JWT_SECRET", "optiteach-super-secret-jwt-key-for-development-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

    class Config:
        env_file = BACKEND_DIR / ".env"
        extra = "allow"

settings = Settings()
