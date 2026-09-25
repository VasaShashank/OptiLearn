"""
Introspection for the DBMS page: server-side objects read from the system catalogs, and an
ER diagram generated from the live schema's foreign keys (so it can never go stale).
"""
from typing import Any, Dict, List

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

CATALOG_QUERIES = {
    "views": """
        SELECT viewname AS name, 'view' AS kind, pg_get_viewdef(format('%I', viewname)::regclass, true) AS definition
        FROM pg_views WHERE schemaname = 'public'
        UNION ALL
        SELECT matviewname, 'materialized view', pg_get_viewdef(format('%I', matviewname)::regclass, true)
        FROM pg_matviews WHERE schemaname = 'public'
        ORDER BY 1
    """,
    "routines": """
        SELECT p.proname AS name,
               CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS kind,
               pg_get_function_identity_arguments(p.oid) AS arguments,
               CASE WHEN p.prorettype = 'trigger'::regtype THEN 'trigger' ELSE pg_get_function_result(p.oid) END AS returns,
               l.lanname AS language,
               p.prosecdef AS security_definer,
               pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public'
        ORDER BY kind, name
    """,
    "triggers": """
        SELECT t.tgname AS name, c.relname AS table_name, p.proname AS function_name,
               pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
    """,
    "policies": """
        SELECT policyname AS name, tablename AS table_name, cmd AS command,
               array_to_string(roles, ', ') AS roles, qual AS using_expression
        FROM pg_policies WHERE schemaname = 'public'
        ORDER BY tablename
    """,
    "indexes": """
        SELECT i.indexname AS name, i.tablename AS table_name, i.indexdef AS definition,
               ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
               ix.indpred IS NOT NULL AS is_partial,
               COALESCE(s.idx_scan, 0) AS scans
        FROM pg_indexes i
        JOIN pg_class ic ON ic.relname = i.indexname
        JOIN pg_index ix ON ix.indexrelid = ic.oid
        LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = ic.oid
        WHERE i.schemaname = 'public'
        ORDER BY i.tablename, i.indexname
    """,
    "roles": """
        SELECT r.rolname AS name, r.rolcanlogin AS can_login, r.rolbypassrls AS bypass_rls,
               (SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
                FROM information_schema.role_table_grants g
                WHERE g.grantee = r.rolname AND g.table_schema = 'public') AS table_privileges,
               (SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants g
                WHERE g.grantee = r.rolname AND g.table_schema = 'public') AS tables_granted
        FROM pg_roles r
        WHERE r.rolname IN ('optiteach_app', 'optiteach_readonly')
        ORDER BY r.rolname
    """,
}

# Cardinality notation per FK: a unique FK column is one-to-one, otherwise one-to-many
_ONE_TO_ONE, _ONE_TO_MANY = "||--o|", "||--o{"
_DIAGRAM_ATTRIBUTES = {
    "name", "title", "code", "email", "status", "role", "average_score", "difficulty",
    "session_number", "version", "unit_number", "rank", "total_available_minutes", "allocated_minutes",
    "table_name", "operation",
}


class DBCatalogService:
    def database_objects(self, db: Session) -> Dict[str, List[Dict[str, Any]]]:
        if db.bind.dialect.name != "postgresql":
            raise ValueError("The object catalog requires PostgreSQL")
        return {section: [dict(r._mapping) for r in db.execute(text(sql))]
                for section, sql in CATALOG_QUERIES.items()}

    def er_diagram(self, db: Session) -> Dict[str, Any]:
        """Mermaid erDiagram built from the live schema (tables, PK/FK columns, relationships)."""
        insp = inspect(db.bind)
        tables = sorted(t for t in insp.get_table_names() if t not in ("alembic_version", "txn_lab_accounts"))
        lines, relationships = ["erDiagram"], []

        for table in tables:
            pk = set(insp.get_pk_constraint(table).get("constrained_columns", []))
            fks = insp.get_foreign_keys(table)
            fk_cols = {c for fk in fks for c in fk["constrained_columns"]}
            unique_cols = {tuple(u["column_names"]) for u in insp.get_unique_constraints(table)}

            lines.append(f"    {table} {{")
            for col in insp.get_columns(table):
                name = col["name"]
                if name not in pk and name not in fk_cols and name not in _DIAGRAM_ATTRIBUTES:
                    continue  # keys + a few meaningful attributes keep 20 tables readable
                ctype = str(col["type"]).split("(")[0].lower().replace(" ", "_")
                keys = ",".join(k for k, hit in (("PK", name in pk), ("FK", name in fk_cols)) if hit)
                lines.append(f"        {ctype} {name}{' ' + keys if keys else ''}")
            lines.append("    }")

            for fk in fks:
                one_to_one = tuple(fk["constrained_columns"]) in unique_cols or set(fk["constrained_columns"]) == pk
                label = "_".join(fk["constrained_columns"])
                relationships.append(
                    f"    {fk['referred_table']} {_ONE_TO_ONE if one_to_one else _ONE_TO_MANY} {table} : {label}"
                )

        return {"mermaid": "\n".join(lines + sorted(set(relationships))),
                "tables": len(tables), "relationships": len(set(relationships))}

    def explain(self, db: Session, sql: str, params: Dict[str, Any]) -> List[str]:
        if db.bind.dialect.name != "postgresql":
            raise ValueError("EXPLAIN ANALYZE output is shown for PostgreSQL only")
        # ANALYZE executes the statement; demo queries are SELECT-only, and the transaction
        # is rolled back regardless so nothing it touched is kept.
        try:
            rows = db.execute(text(f"EXPLAIN (ANALYZE, BUFFERS, COSTS, FORMAT TEXT) {sql.strip().rstrip(';')}"), params)
            return [r[0] for r in rows]
        finally:
            db.rollback()


db_catalog_service = DBCatalogService()
