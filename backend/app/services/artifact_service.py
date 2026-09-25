"""
MongoDB artifact service: the document side of OptiTeach's polyglot persistence.

PostgreSQL holds the authoritative, relational academic state. MongoDB holds artifacts
whose shape is nested, versioned or evolving and which are read whole:
  * curriculum_graphs      - immutable snapshots of the concept graph, one per confirmation
  * lesson_plan_documents  - every saved version of a lesson plan's rich content
  * nlp_extractions        - raw extractor output (drafts, expire via TTL index)
"""
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_mongo_db
from app.models.entities import ClassSession, Concept, Course, LessonPlan, Topic, Unit, User

LIST_FIELDS = ["learning_objectives", "worked_examples", "active_exercises", "misconceptions", "assessment_questions"]
PHASE_FIELDS = ["phase_name", "duration_minutes", "method_name", "activity_description"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serializable(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in doc.items()}


class ArtifactService:
    # ------------------------------------------------------------------ curriculum graph snapshots
    def snapshot_curriculum_graph(self, db: Session, course_id: str, reason: str) -> Dict[str, Any]:
        """Append an immutable snapshot of the course's concept graph as the next version."""
        concepts = (
            db.query(Concept)
            .options(joinedload(Concept.topic).joinedload(Topic.unit), joinedload(Concept.prerequisites))
            .join(Topic).join(Unit)
            .filter(Unit.course_id == course_id)
            .all()
        )
        nodes = [{
            "id": c.id, "name": c.name, "topic": c.topic.title, "unit_number": c.topic.unit.unit_number,
            "difficulty": c.difficulty, "importance": c.importance, "concept_type": c.concept_type,
        } for c in concepts]
        edges = [{"source": p.id, "target": c.id, "source_name": p.name, "target_name": c.name}
                 for c in concepts for p in c.prerequisites]
        stats = {
            "units": len({c.topic.unit_id for c in concepts}),
            "topics": len({c.topic_id for c in concepts}),
            "concepts": len(nodes),
            "edges": len(edges),
        }

        collection = get_mongo_db()["curriculum_graphs"]
        for _ in range(3):  # unique (course_id, version) index arbitrates concurrent snapshots
            latest = collection.find_one({"course_id": course_id, "version": {"$type": "number"}},
                                         sort=[("version", -1)], projection={"version": 1})
            version = (latest["version"] if latest else 0) + 1
            try:
                collection.insert_one({"course_id": course_id, "version": version, "reason": reason,
                                       "nodes": nodes, "edges": edges, "stats": stats, "created_at": _now()})
                return {"version": version, **stats}
            except DuplicateKeyError:
                continue
        raise RuntimeError("Could not allocate a curriculum graph version")

    def list_graph_versions(self, course_id: str) -> List[Dict[str, Any]]:
        cursor = get_mongo_db()["curriculum_graphs"].find(
            {"course_id": course_id, "version": {"$type": "number"}},
            projection={"_id": 0, "version": 1, "reason": 1, "stats": 1, "created_at": 1},
        ).sort("version", -1)
        return [_serializable(d) for d in cursor]

    def diff_graph_versions(self, course_id: str, from_version: int, to_version: int) -> Dict[str, Any]:
        """Concept IDs are regenerated on every confirmation, so compare by concept name."""
        col = get_mongo_db()["curriculum_graphs"]
        a = col.find_one({"course_id": course_id, "version": from_version})
        b = col.find_one({"course_id": course_id, "version": to_version})
        if not a or not b:
            raise ValueError("Curriculum graph version not found")

        nodes_a = {n["name"]: n for n in a["nodes"]}
        nodes_b = {n["name"]: n for n in b["nodes"]}
        edge_key = lambda e: (e.get("source_name"), e.get("target_name"))
        edges_a, edges_b = {edge_key(e) for e in a["edges"]}, {edge_key(e) for e in b["edges"]}

        changed = []
        for name in sorted(nodes_a.keys() & nodes_b.keys()):
            deltas = {f: {"from": nodes_a[name].get(f), "to": nodes_b[name].get(f)}
                      for f in ("topic", "difficulty", "importance", "concept_type")
                      if nodes_a[name].get(f) != nodes_b[name].get(f)}
            if deltas:
                changed.append({"concept": name, "changes": deltas})

        return {
            "from_version": from_version, "to_version": to_version,
            "concepts_added": sorted(nodes_b.keys() - nodes_a.keys()),
            "concepts_removed": sorted(nodes_a.keys() - nodes_b.keys()),
            "concepts_changed": changed,
            "prerequisites_added": [{"prerequisite": s, "concept": t} for s, t in sorted(edges_b - edges_a)],
            "prerequisites_removed": [{"prerequisite": s, "concept": t} for s, t in sorted(edges_a - edges_b)],
        }

    # ------------------------------------------------------------------ lesson plan history
    def _plan(self, db: Session, course_id: str, session_number: int) -> LessonPlan:
        lp = (
            db.query(LessonPlan).join(ClassSession, LessonPlan.session_id == ClassSession.id)
            .filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number)
            .first()
        )
        if not lp:
            raise ValueError(f"Lesson plan for session {session_number} not found")
        return lp

    def lesson_plan_history(self, db: Session, course_id: str, session_number: int) -> List[Dict[str, Any]]:
        lp = self._plan(db, course_id, session_number)
        docs = list(get_mongo_db()["lesson_plan_documents"].find(
            {"lesson_plan_id": lp.id},
            projection={"version": 1, "change_note": 1, "edited_by": 1, "edited_at": 1, "parent_doc_id": 1},
        ).sort("version", -1))
        editors = dict(db.query(User.id, User.email).filter(User.id.in_({d.get("edited_by") for d in docs} - {None})).all())
        return [{
            "version": d["version"],
            "document_id": d["_id"],
            "parent_document_id": d.get("parent_doc_id"),
            "change_note": d.get("change_note"),
            "edited_by": editors.get(d.get("edited_by"), "optimizer" if not d.get("edited_by") else "unknown user"),
            "edited_at": d.get("edited_at"),
            "is_current": d["_id"] == lp.mongo_doc_id,
        } for d in docs]

    def diff_lesson_plan_versions(self, db: Session, course_id: str, session_number: int,
                                  from_version: int, to_version: int) -> Dict[str, Any]:
        lp = self._plan(db, course_id, session_number)
        col = get_mongo_db()["lesson_plan_documents"]
        a = col.find_one({"lesson_plan_id": lp.id, "version": from_version})
        b = col.find_one({"lesson_plan_id": lp.id, "version": to_version})
        if not a or not b:
            raise ValueError("Lesson plan version not found")

        phase_changes = []
        phases_a, phases_b = a.get("phases", []), b.get("phases", [])
        for i in range(max(len(phases_a), len(phases_b))):
            pa = phases_a[i] if i < len(phases_a) else None
            pb = phases_b[i] if i < len(phases_b) else None
            if pa is None or pb is None:
                phase_changes.append({"index": i + 1, "change": "added" if pa is None else "removed",
                                      "phase": (pb or pa).get("phase_name")})
                continue
            fields = {f: {"from": pa.get(f), "to": pb.get(f)} for f in PHASE_FIELDS if pa.get(f) != pb.get(f)}
            if fields:
                phase_changes.append({"index": i + 1, "change": "modified", "phase": pb.get("phase_name"), "fields": fields})

        list_changes = {}
        for field in LIST_FIELDS:
            old, new = a.get(field, []), b.get(field, [])
            added, removed = [x for x in new if x not in old], [x for x in old if x not in new]
            if added or removed:
                list_changes[field] = {"added": added, "removed": removed}

        return {"from_version": from_version, "to_version": to_version,
                "phases": phase_changes, "content": list_changes,
                "change_note": b.get("change_note")}

    # ------------------------------------------------------------------ NLP extraction drafts
    def record_extraction(self, curriculum, course_id: Optional[str], extracted_by: Optional[str]) -> None:
        get_mongo_db()["nlp_extractions"].insert_one({
            "course_id": course_id,
            "extracted_by": extracted_by,
            "course_code": curriculum.course_code,
            "course_name": curriculum.course_name,
            "confidence_score": float(curriculum.confidence_score),
            "units_count": len(curriculum.units),
            "raw_payload": curriculum.model_dump(),
            "extracted_at": _now(),  # BSON date: required by the TTL index
        })

    # ------------------------------------------------------------------ aggregation pipelines
    @staticmethod
    def _current_plan_versions(course_id: str) -> List[Dict[str, Any]]:
        """Latest version per lesson plan: $sort + $group/$first + $replaceRoot."""
        return [
            {"$match": {"course_id": course_id, "lesson_plan_id": {"$type": "string"}}},
            {"$sort": {"version": -1}},
            {"$group": {"_id": "$lesson_plan_id", "doc": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$doc"}},
        ]

    def aggregation_catalog(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "method_minutes",
                "title": "Teaching time by method",
                "collection": "lesson_plan_documents",
                "purpose": "Minutes of class time per teaching method across the current version of every lesson plan.",
                "stages": ["$match", "$sort", "$group ($first)", "$replaceRoot", "$unwind", "$group ($sum, $addToSet)", "$project ($size)", "$sort"],
                "build": lambda cid: self._current_plan_versions(cid) + [
                    {"$unwind": "$phases"},
                    {"$group": {"_id": "$phases.method_name",
                                "total_minutes": {"$sum": "$phases.duration_minutes"},
                                "phase_count": {"$sum": 1},
                                "plans": {"$addToSet": "$lesson_plan_id"}}},
                    {"$project": {"_id": 0, "method": "$_id", "total_minutes": 1, "phase_count": 1,
                                  "plans_using_it": {"$size": "$plans"}}},
                    {"$sort": {"total_minutes": -1}},
                ],
            },
            {
                "id": "revision_by_topic",
                "title": "Revision time by topic",
                "collection": "lesson_plan_documents",
                "purpose": "Which topics' lesson plans set aside time for prerequisite revision, and how much.",
                "stages": ["$match", "$sort", "$group ($first)", "$replaceRoot", "$unwind", "$match ($regex)", "$group", "$sort"],
                "build": lambda cid: self._current_plan_versions(cid) + [
                    {"$unwind": "$phases"},
                    {"$match": {"phases.phase_name": {"$regex": "revision|recap", "$options": "i"}}},
                    {"$group": {"_id": "$topic_title", "revision_minutes": {"$sum": "$phases.duration_minutes"},
                                "sessions": {"$sum": 1}}},
                    {"$project": {"_id": 0, "topic": "$_id", "revision_minutes": 1, "sessions": 1}},
                    {"$sort": {"revision_minutes": -1}},
                ],
            },
            {
                "id": "edit_activity",
                "title": "Teacher review activity per plan",
                "collection": "lesson_plan_documents",
                "purpose": "How many versions each plan has and how many of them were teacher edits (human-in-the-loop).",
                "stages": ["$match", "$group ($sum, $cond, $max)", "$project", "$sort"],
                "build": lambda cid: [
                    {"$match": {"course_id": cid, "lesson_plan_id": {"$type": "string"}}},
                    {"$group": {"_id": "$lesson_plan_id",
                                "session_number": {"$first": "$session_number"},
                                "topic": {"$first": "$topic_title"},
                                "versions": {"$sum": 1},
                                "teacher_edits": {"$sum": {"$cond": [{"$ne": ["$edited_by", None]}, 1, 0]}},
                                "latest_version": {"$max": "$version"}}},
                    {"$project": {"_id": 0, "session_number": 1, "topic": 1, "versions": 1,
                                  "teacher_edits": 1, "latest_version": 1}},
                    {"$sort": {"session_number": 1}},
                ],
            },
            {
                "id": "graph_growth",
                "title": "Curriculum graph over time",
                "collection": "curriculum_graphs",
                "purpose": "Concept and prerequisite counts across the course's curriculum snapshots.",
                "stages": ["$match", "$project ($size)", "$sort"],
                "build": lambda cid: [
                    {"$match": {"course_id": cid, "version": {"$type": "number"}}},
                    {"$project": {"_id": 0, "version": 1, "reason": 1, "created_at": 1,
                                  "concepts": {"$size": "$nodes"}, "prerequisites": {"$size": "$edges"}}},
                    {"$sort": {"version": 1}},
                ],
            },
            {
                "id": "extraction_quality",
                "title": "Syllabus extraction confidence",
                "collection": "nlp_extractions",
                "purpose": "Average, lowest and highest extractor confidence for this course's uploaded syllabi.",
                "stages": ["$match", "$group ($avg, $min, $max)", "$project"],
                "build": lambda cid: [
                    {"$match": {"course_id": cid}},
                    {"$group": {"_id": None, "extractions": {"$sum": 1},
                                "avg_confidence": {"$avg": "$confidence_score"},
                                "min_confidence": {"$min": "$confidence_score"},
                                "max_confidence": {"$max": "$confidence_score"},
                                "avg_units": {"$avg": "$units_count"}}},
                    {"$project": {"_id": 0}},
                ],
            },
        ]

    def list_aggregations(self) -> List[Dict[str, Any]]:
        return [{k: v for k, v in a.items() if k != "build"} for a in self.aggregation_catalog()]

    def run_aggregation(self, aggregation_id: str, course_id: str) -> Dict[str, Any]:
        spec = next((a for a in self.aggregation_catalog() if a["id"] == aggregation_id), None)
        if not spec:
            raise ValueError(f"Aggregation {aggregation_id} not found")
        pipeline = spec["build"](course_id)
        rows = [_serializable(r) for r in get_mongo_db()[spec["collection"]].aggregate(pipeline)]
        return {**{k: v for k, v in spec.items() if k != "build"}, "pipeline": pipeline,
                "row_count": len(rows), "rows": rows}

    # ------------------------------------------------------------------ cross-store consistency
    def consistency_report(self, db: Session, course_id: Optional[str]) -> Dict[str, Any]:
        """
        PostgreSQL and MongoDB share no transaction or foreign keys, so drift is possible
        (e.g. a course delete cascades in SQL but not in Mongo). This compares both sides.
        course_id=None checks every course (admin).
        """
        mongo = get_mongo_db()
        plan_query = db.query(LessonPlan.id, LessonPlan.mongo_doc_id).join(ClassSession, LessonPlan.session_id == ClassSession.id)
        doc_filter: Dict[str, Any] = {}
        if course_id:
            plan_query = plan_query.filter(ClassSession.course_id == course_id)
            doc_filter["course_id"] = course_id
        plans = dict(plan_query.all())
        course_ids = {cid for (cid,) in db.query(Course.id)}

        existing_doc_ids = {d["_id"] for d in mongo["lesson_plan_documents"].find(
            {"_id": {"$in": [doc for doc in plans.values() if doc]}}, projection={"_id": 1})}
        dangling = [{"lesson_plan_id": pid, "missing_document_id": doc}
                    for pid, doc in plans.items() if doc and doc not in existing_doc_ids]

        orphans = []
        for d in mongo["lesson_plan_documents"].find(doc_filter, projection={"lesson_plan_id": 1, "course_id": 1, "version": 1}):
            if d.get("lesson_plan_id") in plans:
                continue
            reason = ("course deleted" if d.get("course_id") not in course_ids
                      else "pre-versioning legacy document" if d.get("lesson_plan_id") is None
                      else "lesson plan deleted")
            orphans.append({"document_id": d["_id"], "course_id": d.get("course_id"), "reason": reason})

        stale_graphs = []
        for cid in ([course_id] if course_id else sorted(course_ids)):
            latest = mongo["curriculum_graphs"].find_one({"course_id": cid, "version": {"$type": "number"}},
                                                         sort=[("version", -1)], projection={"stats": 1, "version": 1})
            sql_concepts = db.query(Concept.id).join(Topic).join(Unit).filter(Unit.course_id == cid).count()
            if sql_concepts and (not latest or latest.get("stats", {}).get("concepts") != sql_concepts):
                stale_graphs.append({"course_id": cid, "sql_concepts": sql_concepts,
                                     "snapshot_concepts": latest.get("stats", {}).get("concepts") if latest else None})

        orphan_graphs = [] if course_id else [
            {"course_id": cid} for cid in mongo["curriculum_graphs"].distinct("course_id") if cid not in course_ids
        ]

        return {
            "scope": course_id or "all courses",
            "lesson_plans_checked": len(plans),
            "dangling_pointers": dangling,
            "orphan_documents": orphans,
            "orphan_graph_snapshots": orphan_graphs,
            "stale_graph_snapshots": stale_graphs,
            "consistent": not (dangling or orphans or orphan_graphs or stale_graphs),
        }

    def repair(self, db: Session) -> Dict[str, int]:
        """Admin repair: drop orphans (never history of live plans) and re-snapshot stale graphs."""
        report = self.consistency_report(db, None)
        mongo = get_mongo_db()
        removed_docs = mongo["lesson_plan_documents"].delete_many(
            {"_id": {"$in": [o["document_id"] for o in report["orphan_documents"]]}}).deleted_count
        removed_graphs = mongo["curriculum_graphs"].delete_many(
            {"course_id": {"$in": [o["course_id"] for o in report["orphan_graph_snapshots"]]}}).deleted_count
        for stale in report["stale_graph_snapshots"]:
            self.snapshot_curriculum_graph(db, stale["course_id"], reason="Consistency repair")
        return {"orphan_documents_removed": removed_docs, "orphan_graph_snapshots_removed": removed_graphs,
                "graphs_resnapshotted": len(report["stale_graph_snapshots"]),
                "dangling_pointers_reported": len(report["dangling_pointers"])}

    def delete_course_artifacts(self, course_id: str) -> None:
        """Compensating cleanup when a course is deleted from PostgreSQL."""
        mongo = get_mongo_db()
        for name in ("lesson_plan_documents", "curriculum_graphs", "nlp_extractions"):
            mongo[name].delete_many({"course_id": course_id})


artifact_service = ArtifactService()
