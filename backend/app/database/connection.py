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

def init_relational_db():
    global db_engine, db_dialect, SessionLocal
    # Try PostgreSQL first
    try:
        engine = create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3} if "postgresql" in settings.DATABASE_URL else {}
        )
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_engine = engine
        db_dialect = "postgresql"
        logger.info(f"Connected to Primary PostgreSQL Database at {settings.DATABASE_URL}")
    except Exception as e:
        logger.warning(
            f"Could not connect to PostgreSQL ({e}). Falling back to SQLite for local zero-config execution."
        )
        engine = create_engine(
            settings.SQLITE_FALLBACK_URL,
            connect_args={"check_same_thread": False}
        )
        # Enable Foreign Key enforcement in SQLite to preserve relational integrity
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()
        
        db_engine = engine
        db_dialect = "sqlite"
        logger.info(f"Connected to Relational Database via SQLite (Foreign Keys Enforced) at {settings.SQLITE_FALLBACK_URL}")

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
        "postgres_target_url": settings.DATABASE_URL,
        "mongo_target_url": settings.MONGODB_URL
    }
