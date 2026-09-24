from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.entities import User, Teacher
from app.schemas.schemas import Token, LoginRequest, RegisterRequest, UserOut
from app.auth.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.rate_limiter import rate_limit

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token, dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))])
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="teacher"
    )
    db.add(user)
    db.flush()

    teacher = Teacher(
        user_id=user.id,
        department=payload.department,
        designation=payload.designation or "Assistant Professor",
        employee_id=payload.employee_id
    )
    db.add(teacher)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role
    )

@router.post("/login", response_model=Token, dependencies=[Depends(rate_limit(max_requests=20, window_seconds=60))])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role
    )

@router.get("/me", response_model=UserOut)
def get_profile(current_user: User = Depends(get_current_user)):
    dept = current_user.teacher_profile.department if current_user.teacher_profile else None
    desig = current_user.teacher_profile.designation if current_user.teacher_profile else None
    emp_id = current_user.teacher_profile.employee_id if current_user.teacher_profile else None
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        department=dept,
        designation=desig,
        employee_id=emp_id
    )
