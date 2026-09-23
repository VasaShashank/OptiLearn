from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import Optional
from app.nlp.deterministic import nlp_provider
from app.schemas.schemas import ExtractedCurriculum
from app.database.connection import get_mongo_db
import datetime

router = APIRouter(prefix="/syllabus", tags=["Syllabus Extraction"])

@router.post("/upload", response_model=ExtractedCurriculum)
async def upload_syllabus(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None)
):
    mongo_db = get_mongo_db()
    curriculum = None

    try:
        if file:
            content_bytes = await file.read()
            filename = file.filename.lower()
            if filename.endswith(".pdf"):
                curriculum = nlp_provider.extract_from_pdf(content_bytes)
            else:
                text = content_bytes.decode("utf-8", errors="ignore")
                curriculum = nlp_provider.extract_from_text(text)
        elif raw_text and raw_text.strip():
            curriculum = nlp_provider.extract_from_text(raw_text.strip())
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
