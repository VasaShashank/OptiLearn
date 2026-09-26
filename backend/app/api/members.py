from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import get_accessible_course, get_current_user, get_owned_course
from app.database.connection import get_db
from app.models.entities import Course, CourseMember, Teacher, User

router = APIRouter(prefix="/courses", tags=["Co-teaching"], dependencies=[Depends(get_current_user)])


class MemberIn(BaseModel):
    email: EmailStr
    role: Literal["co_teacher", "viewer"]


def _serialize(course: Course, db: Session):
    owner = course.teacher
    members = (
        db.query(CourseMember, Teacher, User)
        .join(Teacher, CourseMember.teacher_id == Teacher.id)
        .join(User, Teacher.user_id == User.id)
        .filter(CourseMember.course_id == course.id)
        .order_by(CourseMember.added_at)
        .all()
    )
    return {
        "owner": {"teacher_id": owner.id, "name": owner.user.full_name, "email": owner.user.email},
        "members": [
            {"teacher_id": t.id, "name": u.full_name, "email": u.email, "role": m.role, "added_at": m.added_at}
            for m, t, u in members
        ],
    }


@router.get("/{course_id}/members")
def list_members(course: Course = Depends(get_accessible_course), db: Session = Depends(get_db)):
    """Who has access to the course: the owner, co-teachers and viewers."""
    return _serialize(course, db)


@router.put("/{course_id}/members")
def add_or_update_member(payload: MemberIn, course: Course = Depends(get_owned_course), db: Session = Depends(get_db)):
    """Share the course with another teacher by email, or change their role. Owner only."""
    teacher = db.query(Teacher).join(User).filter(User.email == payload.email.lower()).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="No teacher account uses that email")
    if teacher.id == course.teacher_id:
        raise HTTPException(status_code=400, detail="That teacher already owns the course")
    member = db.get(CourseMember, (course.id, teacher.id))
    if member:
        member.role = payload.role
    else:
        db.add(CourseMember(course_id=course.id, teacher_id=teacher.id, role=payload.role))
    try:
        db.commit()
    except (IntegrityError, DBAPIError) as exc:  # e.g. trg_course_member_not_owner on PostgreSQL
        db.rollback()
        raise HTTPException(status_code=400, detail=str(getattr(exc, "orig", exc)).splitlines()[0])
    return _serialize(course, db)


@router.delete("/{course_id}/members/{teacher_id}", status_code=204)
def remove_member(teacher_id: str, course: Course = Depends(get_owned_course), db: Session = Depends(get_db)):
    member = db.get(CourseMember, (course.id, teacher_id))
    if not member:
        raise HTTPException(status_code=404, detail="That teacher is not a member of this course")
    db.delete(member)
    db.commit()
    return Response(status_code=204)
