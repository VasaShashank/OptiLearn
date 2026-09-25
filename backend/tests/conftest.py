import os
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

# Isolate the suite from any developer database: a throwaway SQLite file and
# in-memory Mongo. Must be set before `app` is imported anywhere.
_test_db_dir = tempfile.mkdtemp(prefix="optiteach-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(_test_db_dir, 'test.db').as_posix()}")
os.environ.setdefault("MONGODB_URL", "mongomock://")


@pytest.fixture(scope="session", autouse=True)
def seeded_database():
    from database.seed.seed_data import seed_database
    seed_database()
    yield
