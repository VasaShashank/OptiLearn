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
from app.auth.security import get_current_user, get_accessible_course

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


class ConsoleRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=5000)


@router.post("/console")
def run_sql_console(payload: ConsoleRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ad-hoc read-only SQL, executed as optiteach_readonly under row-level security."""
    return jsonable_encoder(run_console_query(db, payload.sql, current_user))
