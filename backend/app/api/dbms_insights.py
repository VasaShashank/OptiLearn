from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database.connection import get_db
from app.models.entities import Course, Teacher, User
from app.schemas.schemas import TableSchemaInfo, QueryDemoResult
from app.services.dbms_insights_service import dbms_insights_service
from app.services.sql_console_service import run_console_query
from app.services.transaction_lab_service import transaction_lab_service
from app.auth.security import get_current_user, get_accessible_course, require_admin
from app.services.artifact_service import artifact_service
from app.services.db_catalog_service import db_catalog_service

router = APIRouter(prefix="/dbms", tags=["DBMS Insights & Academic Showcase"], dependencies=[Depends(get_current_user)])

@router.get("/status")
def get_db_status():
    return dbms_insights_service.get_database_status()

@router.get("/schema", response_model=List[TableSchemaInfo])
def get_relational_schema(db: Session = Depends(get_db)):
    return dbms_insights_service.get_schema_summary(db)

@router.get("/queries")
def list_demo_queries():
    return dbms_insights_service.list_demo_queries()

@router.post("/queries/{query_id}/execute", response_model=QueryDemoResult)
def execute_query(query_id: str, course_id: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not course_id:
        query = db.query(Course)
        if current_user.role != "admin":
            query = query.join(Teacher).filter(Teacher.user_id == current_user.id)
        c = query.order_by(Course.created_at).first()
        if not c:
            raise HTTPException(status_code=400, detail="No course exists to run demonstration queries against")
        course_id = c.id
    get_accessible_course(course_id, current_user, db)

    return dbms_insights_service.execute_demo_query(db, query_id, course_id)


@router.post("/queries/{query_id}/explain")
def explain_query(query_id: str, course_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """EXPLAIN (ANALYZE, BUFFERS) of a demo query: the executed plan, timings and index use."""
    get_accessible_course(course_id, current_user, db)
    return dbms_insights_service.explain_demo_query(db, query_id, course_id)


@router.get("/objects")
def list_database_objects(db: Session = Depends(get_db)):
    """Views, routines, triggers, RLS policies, indexes and roles from the system catalogs."""
    return jsonable_encoder(db_catalog_service.database_objects(db))


@router.get("/er-diagram")
def get_er_diagram(db: Session = Depends(get_db)):
    """Mermaid erDiagram generated from the live schema."""
    return db_catalog_service.er_diagram(db)


class ConsoleRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=5000)


@router.post("/console")
def run_sql_console(payload: ConsoleRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ad-hoc read-only SQL, executed as optiteach_readonly under row-level security."""
    return jsonable_encoder(run_console_query(db, payload.sql, current_user))


@router.get("/transaction-lab")
def list_transaction_scenarios():
    return transaction_lab_service.list_scenarios()


@router.post("/transaction-lab/{scenario}")
def run_transaction_scenario(scenario: str, db: Session = Depends(get_db)):
    """Runs interleaved transactions on the txn_lab_accounts scratch table and returns the timeline."""
    return jsonable_encoder(transaction_lab_service.run(db.bind, scenario))



# ---------------------------------------------------------------- MongoDB (NoSQL) side
@router.get("/nosql/aggregations")
def list_nosql_aggregations():
    return artifact_service.list_aggregations()


@router.post("/nosql/aggregations/{aggregation_id}/execute")
def run_nosql_aggregation(aggregation_id: str, course_id: str, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    get_accessible_course(course_id, current_user, db)
    return jsonable_encoder(artifact_service.run_aggregation(aggregation_id, course_id))


@router.get("/consistency")
def cross_store_consistency(course_id: str = None, db: Session = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    """Compare PostgreSQL pointers with MongoDB documents. Without course_id: all courses (admin)."""
    if course_id:
        get_accessible_course(course_id, current_user, db)
    elif current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required for a global check")
    return jsonable_encoder(artifact_service.consistency_report(db, course_id))


@router.post("/consistency/repair")
def repair_cross_store_consistency(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return artifact_service.repair(db)
