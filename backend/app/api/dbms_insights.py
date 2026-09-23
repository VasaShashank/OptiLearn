from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.database.connection import get_db
from app.models.entities import Course
from app.schemas.schemas import TableSchemaInfo, QueryDemoResult
from app.services.dbms_insights_service import dbms_insights_service

router = APIRouter(prefix="/dbms", tags=["DBMS Insights & Academic Showcase"])

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
def execute_query(query_id: str, course_id: str = None, db: Session = Depends(get_db)):
    if not course_id:
        c = db.query(Course).first()
        if not c:
            raise HTTPException(status_code=400, detail="No course exists to run demonstration queries against")
        course_id = c.id

    return dbms_insights_service.execute_demo_query(db, query_id, course_id)
