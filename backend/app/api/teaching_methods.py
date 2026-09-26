from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database.connection import get_db
from app.models.entities import TeachingMethod

router = APIRouter(prefix="/teaching-methods", tags=["Teaching Methods"], dependencies=[Depends(get_current_user)])


@router.get("")
def list_teaching_methods(db: Session = Depends(get_db)):
    """Global method catalog (not course-specific), used when recording a taught class."""
    return [
        {"id": m.id, "name": m.name, "category": m.category, "description": m.description}
        for m in db.query(TeachingMethod).order_by(TeachingMethod.name)
    ]
