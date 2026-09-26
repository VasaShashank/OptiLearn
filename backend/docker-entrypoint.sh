#!/bin/sh
# Apply migrations as the schema owner, optionally load the sample course, then serve.
set -e
cd /app
alembic -c database/migrations/alembic.ini upgrade head
if [ "${SEED_SAMPLE_DATA:-0}" = "1" ]; then
  python -m database.seed.seed_data --if-empty
fi
cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
