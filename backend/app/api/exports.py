"""
Export API Routes for Schedules and Reports
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.services.export_service import export_service

router = APIRouter(prefix="/exports", tags=["Exports & Compliance"])

@router.get("/courses/{course_id}/calendar.ics")
def export_course_calendar(course_id: str, db: Session = Depends(get_db)):
    """Export course schedule as iCalendar (.ics) format"""
    try:
        ics_content = export_service.generate_ics_calendar(db, course_id)
        return Response(
            content=ics_content,
            media_type="text/calendar",
            headers={"Content-Disposition": f"attachment; filename=course-{course_id}-schedule.ics"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/lesson-plans/{session_id}/printable")
def export_lesson_plan_printable(session_id: str, db: Session = Depends(get_db)):
    """Export formatted printable HTML lesson plan (saveable as PDF)"""
    try:
        html_content = export_service.generate_lesson_plan_html(db, session_id)
        return Response(
            content=html_content,
            media_type="text/html"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/courses/{course_id}/outcomes-matrix")
def export_course_outcomes_matrix(course_id: str, db: Session = Depends(get_db)):
    """Export NBA/ABET Course Outcome Attainment Matrix"""
    try:
        return export_service.generate_outcome_matrix(db, course_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
