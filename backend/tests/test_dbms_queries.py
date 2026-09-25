"""DBMS Insights demo queries on the portable (SQLite) path."""
from app.services.dbms_insights_service import DEMO_QUERIES

def _course_id(api):
    return next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")


def test_portable_queries_run_and_postgres_only_queries_are_refused(api):
    cid = _course_id(api)
    for q in DEMO_QUERIES:
        resp = api.post(f"/api/dbms/queries/{q['id']}/execute?course_id={cid}")
        if q.get("requires") == "postgresql":
            assert resp.status_code == 400, q["id"]
            assert "postgresql-only" in resp.json()["detail"]
        else:
            assert resp.status_code == 200, (q["id"], resp.text)
            assert resp.json()["sql_features"], q["id"]


def test_query_catalog_lists_features(api):
    catalog = api.get("/api/dbms/queries").json()
    assert len(catalog) == len(DEMO_QUERIES)
    recursive = next(q for q in catalog if q["id"] == "q11_curriculum_depth_recursive")
    assert "WITH RECURSIVE" in recursive["sql_features"]


def test_schema_summary_reports_real_row_counts(api):
    tables = {t["table_name"]: t for t in api.get("/api/dbms/schema").json()}
    assert tables["concepts"]["row_count"] == 19
    assert "1NF" in tables["teacher_preferred_methods"]["normal_form"]


def test_er_diagram_is_generated_from_foreign_keys(api):
    er = api.get("/api/dbms/er-diagram").json()
    assert er["mermaid"].startswith("erDiagram")
    assert "units ||--o{ topics : unit_id" in er["mermaid"]
    assert "users ||--o| teachers : user_id" in er["mermaid"]  # UNIQUE FK -> one-to-one


def test_postgres_only_introspection_is_refused_on_sqlite(api):
    assert api.get("/api/dbms/objects").status_code == 400
    cid = _course_id(api)
    assert api.post(f"/api/dbms/queries/q1_topics_remaining/explain?course_id={cid}").status_code == 400
