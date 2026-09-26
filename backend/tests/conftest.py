import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

# Add backend and root to sys.path
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# Isolate the suite from any real database: a throwaway SQLite file and in-memory Mongo,
# forced even when DATABASE_URL is set (e.g. in CI). Must happen before `app` is imported.
# PostgreSQL/MongoDB-backed tests use their own throwaway databases (fixtures below).
_test_db_dir = tempfile.mkdtemp(prefix="optiteach-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_db_dir, 'test.db').as_posix()}"
os.environ["MONGODB_URL"] = "mongomock://"


@pytest.fixture(scope="session", autouse=True)
def seeded_database():
    from database.seed.seed_data import seed_database
    seed_database()
    yield


def login_client(email: str, password: str):
    """TestClient that sends a bearer token for the given user on every request."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


@pytest.fixture(scope="session")
def api(seeded_database):
    """Authenticated client for the seeded CS302 teacher."""
    return login_client("faculty@optiteach.edu", "admin123")


# ---------------------------------------------------------------------------
# PostgreSQL test database (tests needing it are skipped if no server is reachable)
# ---------------------------------------------------------------------------
PG_ADMIN_URL = os.getenv("TEST_PG_ADMIN_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
PG_TEST_DB = "optiteach_test"
PG_TEST_URL = PG_ADMIN_URL.rsplit("/", 1)[0] + f"/{PG_TEST_DB}"
PG_APP_TEST_URL = os.getenv(
    "TEST_PG_APP_URL", f"postgresql://optiteach_app:optiteach_app_dev@localhost:5432/{PG_TEST_DB}"
)


def _run_with_test_db(args):
    subprocess.run(
        [sys.executable, *args], cwd=root_dir, check=True, capture_output=True,
        env={**os.environ, "DATABASE_URL": PG_APP_TEST_URL, "MIGRATION_DATABASE_URL": PG_TEST_URL,
             "MONGODB_URL": "mongomock://"},
    )


@pytest.fixture(scope="session")
def pg():
    """Superuser engine on a fresh optiteach_test DB: migrated as owner, seeded as optiteach_app."""
    from sqlalchemy import create_engine, text

    try:
        admin = create_engine(PG_ADMIN_URL, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 3})
        with admin.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS {PG_TEST_DB} WITH (FORCE)"))
            conn.execute(text(f"CREATE DATABASE {PG_TEST_DB}"))
    except Exception as exc:
        pytest.skip(f"PostgreSQL not available: {exc}")

    _run_with_test_db(["-m", "alembic", "-c", "database/migrations/alembic.ini", "upgrade", "head"])
    _run_with_test_db(["-m", "database.seed.seed_data"])

    engine = create_engine(PG_TEST_URL)
    yield engine
    engine.dispose()
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {PG_TEST_DB} WITH (FORCE)"))
    admin.dispose()


@pytest.fixture(scope="session")
def pg_app(pg):
    """Engine connected as the least-privilege optiteach_app role."""
    from sqlalchemy import create_engine

    engine = create_engine(PG_APP_TEST_URL)
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def real_mongo_db():
    """A throwaway database on a real MongoDB server, with validators and indexes applied."""
    import uuid
    from pymongo import MongoClient
    from pymongo.errors import ServerSelectionTimeoutError
    from app.database.mongo_schema import ensure_mongo_schema

    try:
        client = MongoClient(os.getenv("TEST_MONGO_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
    except ServerSelectionTimeoutError:
        pytest.skip("MongoDB server not available")
    name = f"optiteach_test_{uuid.uuid4().hex[:6]}"
    db = client[name]
    ensure_mongo_schema(db)
    yield db
    client.drop_database(name)
    client.close()
