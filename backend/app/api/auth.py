from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.entities import User, Teacher
from app.schemas.schemas import Token, LoginRequest, RegisterRequest, UserOut
from app.auth.security import (
    hash_password, verify_password, needs_rehash, create_access_token, get_current_user,
    login_rate_limiter, client_key,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _token_for(user: User) -> Token:
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return Token(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role
    )


@router.post("/register", response_model=Token)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="teacher"  # self-registration never grants admin
    )
    db.add(user)
    db.flush()
    db.add(Teacher(
        user_id=user.id,
        department=payload.department,
        designation=payload.designation or "Assistant Professor",
        employee_id=payload.employee_id
    ))
    try:
        db.commit()
    except IntegrityError:
        # UNIQUE(email) / UNIQUE(employee_id) — also covers a concurrent duplicate registration
        db.rollback()
        raise HTTPException(status_code=400, detail="Email or employee ID already registered")
    db.refresh(user)
    return _token_for(user)


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    key = client_key(request, payload.email)
    login_rate_limiter.check(key)

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        login_rate_limiter.record_failure(key)
        # Same message for unknown email and wrong password: no account enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    login_rate_limiter.reset(key)
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(payload.password)
        db.commit()
    return _token_for(user)


@router.get("/me", response_model=UserOut)
def get_profile(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active
    )
