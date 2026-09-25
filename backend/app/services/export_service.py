"""
Multi-Format Export Service (iCalendar .ics, Printable Lesson Plan HTML, ABET/NBA Matrix)
"""
from html import escape as html_escape
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.entities import Course, ClassSession, LessonPlan, Topic, CourseOutcome, Performance
from app.database.connection import get_mongo_db

class ExportService:
    """
    Exports course data, schedules, and pedagogical artifacts into standard external formats.
    """

    def generate_ics_calendar(self, db: Session, course_id: str) -> str:
        """
        Generate RFC 5545 compliant iCalendar string for calendar import.
        """
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//OptiTeach//Course Schedule//EN",
            f"X-WR-CALNAME:{course.code} - {course.title}",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH"
        ]

        now_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        sessions = (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course_id)
            .order_by(ClassSession.session_number)
            .all()
        )

        for s in sessions:
            dt_start = s.scheduled_date or (datetime.now() + timedelta(days=s.session_number))
            dt_end = dt_start + timedelta(minutes=course.period_duration)
            dt_start_str = dt_start.strftime("%Y%m%dT%H%M%SZ")
            dt_end_str = dt_end.strftime("%Y%m%dT%H%M%SZ")

            topic_title = s.current_topic.title if s.current_topic else f"Class Session #{s.session_number}"
            summary = f"[{course.code}] Period {s.session_number}: {topic_title}"
            description = f"OptiTeach Period {s.session_number}\\nTopic: {topic_title}\\nStatus: {s.status}"

            lines.extend([
                "BEGIN:VEVENT",
                f"UID:optiteach-{course.id}-{s.session_number}@optiteach.university.edu",
                f"DTSTAMP:{now_str}",
                f"DTSTART:{dt_start_str}",
                f"DTEND:{dt_end_str}",
                f"SUMMARY:{summary}",
                f"DESCRIPTION:{description}",
                "LOCATION:Department Lecture Hall",
                "STATUS:CONFIRMED",
                "END:VEVENT"
            ])

        lines.append("END:VCALENDAR")
        return "\r\n".join(lines)

    def generate_lesson_plan_html(self, db: Session, session_id: str) -> str:
        """
        Generate high-resolution printable HTML for a lesson plan (can be saved as PDF).
        """
        lp = db.query(LessonPlan).filter(LessonPlan.session_id == session_id).first()
        if not lp:
            raise ValueError("Lesson plan not found")

        mongo_db = get_mongo_db()
        doc = mongo_db["lesson_plan_documents"].find_one({"_id": lp.mongo_doc_id}) or {}

        phases = doc.get("phases", [])
        objectives = doc.get("learning_objectives", [])
        worked_examples = doc.get("worked_examples", [])
        misconceptions = doc.get("misconceptions", [])
        questions = doc.get("assessment_questions", [])

        # Everything interpolated below can originate from an uploaded syllabus or a teacher
        # edit, so it is HTML-escaped to prevent stored XSS in the printable page.
        esc = lambda value: html_escape(str(value))
        phases_rows = "".join(
            f"<tr><td><b>{esc(p.get('phase_name', ''))}</b></td><td>{esc(p.get('duration_minutes', 0))} mins</td><td>{esc(p.get('method_name', ''))}</td><td>{esc(p.get('activity_description', ''))}</td></tr>"
            for p in phases
        )

        obj_items = "".join(f"<li>{esc(o)}</li>" for o in objectives)
        ex_items = "".join(f"<li>{esc(e)}</li>" for e in worked_examples)
        misc_items = "".join(f"<li>{esc(m)}</li>" for m in misconceptions)
        q_items = "".join(f"<li>{esc(q)}</li>" for q in questions)
        title = esc(lp.title)
        topic_title = esc(lp.topic.title if lp.topic else '')

        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.6; }}
  .header {{ border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; }}
  h1 {{ margin: 0; color: #0f172a; font-size: 24px; }}
  .badge {{ display: inline-block; padding: 4px 10px; background: #e0e7ff; color: #4338ca; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }}
  th, td {{ border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 14px; }}
  th {{ background: #f8fafc; font-weight: 600; }}
  .section-title {{ font-size: 16px; font-weight: 700; color: #334155; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }}
  ul {{ padding-left: 20px; }}
  li {{ margin-bottom: 6px; font-size: 14px; }}
</style>
</head>
<body>
<div class="header">
  <span class="badge">OptiTeach Structured Lesson Plan</span>
  <h1>{title}</h1>
  <p><b>Topic:</b> {topic_title} | <b>Period:</b> {lp.session.session_number if lp.session else 1}</p>
</div>

<div class="section-title">⏱️ Period Phases Breakdown</div>
<table>
  <thead>
    <tr><th>Phase</th><th>Duration</th><th>Teaching Method</th><th>Activity Description</th></tr>
  </thead>
  <tbody>
    {phases_rows}
  </tbody>
</table>

<div class="section-title">🎯 Learning Objectives</div>
<ul>{obj_items}</ul>

<div class="section-title">📖 Worked Examples</div>
<ul>{ex_items}</ul>

<div class="section-title">⚠️ Common Misconceptions</div>
<ul>{misc_items}</ul>

<div class="section-title">✅ Formative Assessment Questions</div>
<ul>{q_items}</ul>
</body>
</html>"""
        return html

    def generate_outcome_matrix(self, db: Session, course_id: str) -> Dict[str, Any]:
        """
        Generate NBA/ABET Course Outcome attainment matrix.
        """
        outcomes = db.query(CourseOutcome).filter(CourseOutcome.course_id == course_id).all()
        matrix = []
        for o in outcomes:
            concepts = o.concepts
            avg_attainment = 75.0
            if concepts:
                perfs = []
                for c in concepts:
                    for p in c.performances:
                        perfs.append(p.average_score)
                if perfs:
                    avg_attainment = round(sum(perfs) / len(perfs), 1)

            matrix.append({
                "outcome_code": o.code,
                "description": o.description,
                "bloom_level": o.bloom_level,
                "linked_concepts_count": len(concepts),
                "attainment_percentage": avg_attainment,
                "target_met": avg_attainment >= 65.0
            })

        return {
            "course_id": course_id,
            "standard": "NBA / ABET Criterion 3",
            "outcomes_count": len(matrix),
            "attainment_matrix": matrix
        }

export_service = ExportService()
