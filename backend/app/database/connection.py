import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.engine import Engine
import pymongo
import mongomock
from app.database.config import settings

logger = logging.getLogger("optiteach.database")
logging.basicConfig(level=logging.INFO)

Base = declarative_base()

# -------------------------------------------------------------
# Relational DB Engine Setup (PostgreSQL with SQLite Fallback)
# -------------------------------------------------------------
db_engine = None
db_dialect = "unknown"
SessionLocal = None

def _create_sqlite_engine(url: str) -> Engine:
    engine = create_engine(url, connect_args={"check_same_thread": False})

    # Enable Foreign Key enforcement in SQLite to preserve relational integrity
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine

def init_relational_db():
    global db_engine, db_dialect, SessionLocal
    url = settings.DATABASE_URL
    try:
        if url.startswith("sqlite"):
            engine = _create_sqlite_engine(url)
        else:
            engine = create_engine(
                url,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 3} if url.startswith("postgresql") else {}
            )
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_engine = engine
        logger.info(f"Connected to primary {engine.dialect.name} database at {engine.url.render_as_string(hide_password=True)}")
    except Exception as e:
        logger.warning(
            f"Could not connect to primary database ({e}). Falling back to SQLite for local zero-config execution."
        )
        db_engine = _create_sqlite_engine(settings.SQLITE_FALLBACK_URL)
        logger.info(f"Connected to Relational Database via SQLite (Foreign Keys Enforced) at {settings.SQLITE_FALLBACK_URL}")

    db_dialect = db_engine.dialect.name
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    return db_engine

init_relational_db()

def get_db():
    """FastAPI Dependency for Relational DB Session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------------------------------------
# MongoDB Setup (PyMongo with MongoMock Fallback)
# -------------------------------------------------------------
mongo_client = None
mongo_db = None
mongo_mode = "unknown"

def init_mongo_db():
    global mongo_client, mongo_db, mongo_mode
    try:
        if settings.MONGODB_URL.startswith("mongomock://"):
            raise ConnectionError("in-memory engine requested via MONGODB_URL")
        client = pymongo.MongoClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
        # Force a call to verify connection
        client.admin.command('ping')
        mongo_client = client
        mongo_db = client[settings.MONGODB_DB_NAME]
        mongo_mode = "mongodb"
        logger.info(f"Connected to Primary MongoDB at {settings.MONGODB_URL} (Database: {settings.MONGODB_DB_NAME})")
    except Exception as e:
        logger.warning(
            f"Could not connect to MongoDB server ({e}). Initializing In-Memory MongoMock engine."
        )
        mock_client = mongomock.MongoClient()
        mongo_client = mock_client
        mongo_db = mock_client[settings.MONGODB_DB_NAME]
        mongo_mode = "mongomock"
        logger.info(f"Initialized MongoMock Engine (Database: {settings.MONGODB_DB_NAME})")

    return mongo_db

init_mongo_db()

def get_mongo_db():
    """FastAPI Dependency for MongoDB / MongoMock"""
    return mongo_db

def get_db_info():
    """Status metadata for DBMS Insights and Diagnostic APIs"""
    return {
        "relational_dialect": db_dialect,
        "relational_connected": db_engine is not None,
        "nosql_mode": mongo_mode,
        "nosql_connected": mongo_db is not None,
        "postgres_target_url": db_engine.url.render_as_string(hide_password=True) if db_engine else None,
        "mongo_target_url": settings.MONGODB_URL
    }
