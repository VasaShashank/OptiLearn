"""
Restore a backup made by backup.py.

  python database/scripts/restore.py backups/<timestamp>                     # into the configured DBs
  python database/scripts/restore.py backups/<timestamp> --target-db copy   # into a new PG database
                                                  [--target-mongo-db copy_artifacts]

The PostgreSQL side is restored with pg_restore --clean --if-exists (existing objects are
dropped first). Roles (optiteach_app / optiteach_readonly) are cluster-wide and are not
part of the dump; run `alembic upgrade head` once on a new server so they exist. MongoDB
collections are replaced document-for-document, and validators/indexes are re-applied.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from bson import json_util
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database.config import settings  # noqa: E402
from app.database.connection import mongo_client  # noqa: E402
from app.database.mongo_schema import ensure_mongo_schema  # noqa: E402
from backup import pg_args, pg_tool  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--target-db", help="PostgreSQL database to restore into (created if missing)")
    parser.add_argument("--target-mongo-db", help="MongoDB database to restore into")
    args = parser.parse_args()

    folder = Path(args.folder)
    manifest = json.loads((folder / "manifest.json").read_text())
    url = make_url(settings.MIGRATION_DATABASE_URL)
    target_db = args.target_db or url.database
    env = {**os.environ, "PGPASSWORD": url.password or ""}

    if target_db != url.database:
        admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            if not conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :d"), {"d": target_db}).scalar():
                conn.execute(text(f'CREATE DATABASE "{target_db}"'))
        admin.dispose()

    subprocess.run([pg_tool("pg_restore"), *pg_args(url), "--clean", "--if-exists", "--no-owner",
                    "--single-transaction", "--dbname", target_db, str(folder / "postgres.dump")],
                   env=env, check=True)

    mongo_db = mongo_client[args.target_mongo_db or manifest["mongo_database"]]
    restored = {}
    for path in sorted((folder / "mongo").glob("*.json")):
        name = path.stem
        docs = [json_util.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        mongo_db[name].delete_many({})
        if docs:
            mongo_db[name].insert_many(docs, ordered=False, bypass_document_validation=True)
        restored[name] = len(docs)
    ensure_mongo_schema(mongo_db)

    engine = create_engine(url.set(database=target_db))
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        courses = conn.execute(text("SELECT count(*) FROM courses")).scalar()
    engine.dispose()
    print(f"Restored PostgreSQL {target_db} @ revision {revision} ({courses} courses); "
          f"MongoDB {mongo_db.name}: {restored}")
    if restored != manifest["mongo_documents"]:
        sys.exit(f"Document counts differ from the manifest: {manifest['mongo_documents']}")


if __name__ == "__main__":
    main()
