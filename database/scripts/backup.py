"""
Consistent-enough backup of both stores into one timestamped folder:

  backups/<UTC timestamp>/
      postgres.dump        pg_dump custom format (schema + data, restorable with pg_restore)
      mongo/<collection>.json   MongoDB Extended JSON, one document per line (keeps dates/types)
      manifest.json        row/document counts and the Alembic revision at backup time

Usage (repo root):  python database/scripts/backup.py [--out backups]
Restore:            python database/scripts/restore.py backups/<timestamp> [--target-db NAME]

pg_dump runs in a single REPEATABLE READ snapshot, so the relational side is internally
consistent. The two stores are not snapshotted together; run the cross-store consistency
check (DBMS page -> Audit & Consistency) after a restore.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.database.config import settings  # noqa: E402
from app.database.connection import get_mongo_db  # noqa: E402


def pg_tool(name: str) -> str:
    env = os.getenv(name.upper().replace("_", ""))
    candidates = [env, shutil.which(name)]
    candidates += sorted(Path("C:/Program Files/PostgreSQL").glob(f"*/bin/{name}.exe"), reverse=True)
    for c in candidates:
        if c and Path(c).exists():
            return str(c)
    sys.exit(f"{name} not found on PATH")


def pg_args(url) -> list:
    return ["-h", url.host or "localhost", "-p", str(url.port or 5432), "-U", url.username]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "backups"))
    args = parser.parse_args()

    url = make_url(settings.MIGRATION_DATABASE_URL)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    folder = Path(args.out) / stamp
    (folder / "mongo").mkdir(parents=True)

    env = {**os.environ, "PGPASSWORD": url.password or ""}
    subprocess.run([pg_tool("pg_dump"), *pg_args(url), "--format=custom", "--no-owner",
                    "--file", str(folder / "postgres.dump"), url.database], env=env, check=True)

    engine = create_engine(url)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        tables = conn.execute(text(
            "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname"
        )).all()
    engine.dispose()

    mongo = get_mongo_db()
    documents = {}
    for name in sorted(mongo.list_collection_names()):
        count = 0
        with open(folder / "mongo" / f"{name}.json", "w", encoding="utf-8") as fh:
            for doc in mongo[name].find():
                fh.write(json_util.dumps(doc, json_options=json_util.CANONICAL_JSON_OPTIONS) + "\n")
                count += 1
        documents[name] = count

    manifest = {
        "created_at": stamp,
        "postgres_database": url.database,
        "alembic_revision": revision,
        "table_rows_estimate": {t: n for t, n in tables},
        "mongo_database": settings.MONGODB_DB_NAME,
        "mongo_documents": documents,
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Backup written to {folder}")
    print(f"  PostgreSQL {url.database} @ revision {revision}; MongoDB {sum(documents.values())} documents")


if __name__ == "__main__":
    main()
