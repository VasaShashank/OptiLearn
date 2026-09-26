"""
MongoDB collection contracts: $jsonSchema validators and indexes.

MongoDB is schemaless by default; these validators make the document store enforce the
shape the application relies on, while leaving room for fields that legitimately vary
(e.g. extra NLP metadata). validationLevel "moderate" validates inserts and updates of
already-valid documents, so legacy documents from before a rule existed stay readable.
"""
import logging
from typing import Any, Dict, List, Tuple

from pymongo import ASCENDING, DESCENDING

logger = logging.getLogger("optiteach.database")

NLP_DRAFT_TTL_SECONDS = 90 * 24 * 3600  # unconfirmed extraction drafts expire after 90 days

PHASE_SCHEMA = {
    "bsonType": "object",
    "required": ["phase_name", "duration_minutes"],
    "properties": {
        "phase_name": {"bsonType": "string", "minLength": 1},
        "duration_minutes": {"bsonType": ["int", "long"], "minimum": 1},
        "method_name": {"bsonType": "string"},
        "activity_description": {"bsonType": "string"},
    },
}

COLLECTIONS: Dict[str, Dict[str, Any]] = {
    "lesson_plan_documents": {
        "validator": {"$jsonSchema": {
            "bsonType": "object",
            "required": ["lesson_plan_id", "course_id", "session_number", "version", "phases", "edited_at"],
            "properties": {
                "lesson_plan_id": {"bsonType": "string"},
                "course_id": {"bsonType": "string"},
                "session_number": {"bsonType": ["int", "long"], "minimum": 1},
                "version": {"bsonType": ["int", "long"], "minimum": 1},
                "parent_doc_id": {"bsonType": ["string", "null"]},
                "phases": {"bsonType": "array", "minItems": 1, "items": PHASE_SCHEMA},
                "learning_objectives": {"bsonType": "array", "items": {"bsonType": "string"}},
                "resources": {"bsonType": "array", "maxItems": 50, "items": {
                    "bsonType": "object",
                    "required": ["kind", "title"],
                    "properties": {
                        "kind": {"enum": ["slides", "video", "link", "dataset", "code", "formula"]},
                        "title": {"bsonType": "string", "minLength": 1},
                        "url": {"bsonType": ["string", "null"]},
                        "content": {"bsonType": ["string", "null"]},
                        "language": {"bsonType": ["string", "null"]},
                    },
                }},
                "change_note": {"bsonType": ["string", "null"]},
                "edited_by": {"bsonType": ["string", "null"]},
            },
        }},
        "indexes": [
            # Partial: documents written before versioning have neither field, and a plain
            # unique index would treat all of them as the same (null, null) key
            ([("lesson_plan_id", ASCENDING), ("version", DESCENDING)], {
                "unique": True, "name": "uq_plan_version",
                "partialFilterExpression": {"lesson_plan_id": {"$type": "string"}, "version": {"$type": "number"}},
            }),
            ([("course_id", ASCENDING), ("session_number", ASCENDING)], {"name": "ix_course_session"}),
        ],
    },
    "curriculum_graphs": {
        "validator": {"$jsonSchema": {
            "bsonType": "object",
            "required": ["course_id", "version", "nodes", "edges", "created_at"],
            "properties": {
                "course_id": {"bsonType": "string"},
                "version": {"bsonType": ["int", "long"], "minimum": 1},
                "nodes": {"bsonType": "array", "items": {
                    "bsonType": "object", "required": ["id", "name"],
                    "properties": {"id": {"bsonType": "string"}, "name": {"bsonType": "string"}},
                }},
                "edges": {"bsonType": "array", "items": {
                    "bsonType": "object", "required": ["source", "target"],
                    "properties": {"source": {"bsonType": "string"}, "target": {"bsonType": "string"}},
                }},
                "reason": {"bsonType": "string"},
            },
        }},
        "indexes": [
            ([("course_id", ASCENDING), ("version", DESCENDING)], {
                "unique": True, "name": "uq_course_graph_version",
                "partialFilterExpression": {"version": {"$type": "number"}},
            }),
        ],
    },
    "nlp_extractions": {
        "validator": {"$jsonSchema": {
            "bsonType": "object",
            "required": ["extracted_at", "confidence_score", "raw_payload"],
            "properties": {
                "extracted_at": {"bsonType": "date"},
                "confidence_score": {"bsonType": ["double", "int"], "minimum": 0, "maximum": 1},
                "course_id": {"bsonType": ["string", "null"]},
                "raw_payload": {"bsonType": "object"},
            },
        }},
        "indexes": [
            ([("course_id", ASCENDING), ("extracted_at", DESCENDING)], {"name": "ix_course_extracted"}),
            # TTL index: MongoDB's background task deletes drafts older than the TTL
            ([("extracted_at", ASCENDING)], {"expireAfterSeconds": NLP_DRAFT_TTL_SECONDS, "name": "ttl_extracted_at"}),
        ],
    },
}


def ensure_mongo_schema(mongo_db) -> List[Tuple[str, str]]:
    """Create/upgrade validators and indexes. Idempotent; safe to run on every startup."""
    applied = []
    is_mock = type(mongo_db.client).__module__.startswith("mongomock")
    existing = set(mongo_db.list_collection_names())
    for name, spec in COLLECTIONS.items():
        if not is_mock:  # mongomock does not implement validators
            if name in existing:
                mongo_db.command("collMod", name, validator=spec["validator"], validationLevel="moderate")
            else:
                mongo_db.create_collection(name, validator=spec["validator"], validationLevel="moderate")
            applied.append((name, "validator"))
        for keys, options in spec["indexes"]:
            mongo_db[name].create_index(keys, **options)
            applied.append((name, options["name"]))
    logger.info(f"MongoDB schema ensured ({'mongomock' if is_mock else 'server'}): {len(applied)} validators/indexes")
    return applied
