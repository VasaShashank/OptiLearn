from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from typing import Optional
from app.nlp.deterministic import nlp_provider
from app.schemas.schemas import ExtractedCurriculum
from app.database.connection import get_mongo_db
from app.core.rate_limiter import rate_limit
import datetime

router = APIRouter(prefix="/syllabus", tags=["Syllabus Extraction"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB limit
MAX_RAW_TEXT_LENGTH = 500_000       # 500k characters limit

@router.post(
    "/upload",
    response_model=ExtractedCurriculum,
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))]
)
async def upload_syllabus(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None)
):
    mongo_db = get_mongo_db()
    curriculum = None

    try:
        if file:
            content_bytes = await file.read()
            # Enforce max upload file size
            if len(content_bytes) > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Uploaded file exceeds maximum permitted size of 10MB (got {round(len(content_bytes)/(1024*1024), 2)}MB)."
                )

            filename = file.filename.lower() if file.filename else "upload"
            if filename.endswith(".pdf"):
                # PDF Magic Byte Header Verification
                if not content_bytes.startswith(b"%PDF"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid PDF file format: Missing '%PDF' magic header bytes."
                    )
                curriculum = nlp_provider.extract_from_pdf(content_bytes)
            else:
                # Sanitize text
                text = content_bytes.decode("utf-8", errors="ignore").replace("\x00", "")
                curriculum = nlp_provider.extract_from_text(text)
        elif raw_text and raw_text.strip():
            cleaned_text = raw_text.strip().replace("\x00", "")
            if len(cleaned_text) > MAX_RAW_TEXT_LENGTH:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Syllabus text exceeds maximum length of {MAX_RAW_TEXT_LENGTH} characters."
                )
            curriculum = nlp_provider.extract_from_text(cleaned_text)
        else:
            raise HTTPException(
                status_code=400,
                detail="No syllabus content provided. Please upload a PDF file or paste syllabus text to extract."
            )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Syllabus extraction failed: {str(e)}")

    # Save raw extraction draft in MongoDB
    try:
        mongo_db["nlp_extractions"].insert_one({
            "course_code": curriculum.course_code,
            "course_name": curriculum.course_name,
            "confidence_score": curriculum.confidence_score,
            "units_count": len(curriculum.units),
            "raw_payload": curriculum.dict(),
            "extracted_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
    except Exception as e:
        pass # Non-blocking for offline mock

    return curriculum
