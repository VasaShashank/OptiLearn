import sys
import uuid
import datetime
from pathlib import Path

# Allow `python -m database.seed.seed_data` from the repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy.orm import Session
from app.database.connection import db_engine, db_dialect, SessionLocal, Base, init_relational_db, get_mongo_db, refresh_dashboard_snapshot
from app.auth.security import hash_password
from app.models.entities import (
    User, Teacher, Course, Section, TeacherConstraint, CourseOutcome,
    Unit, Topic, Concept, ClassSession, TeachingMethod, LessonPlan,
    TeachingSession, Assessment, Question, Performance, MethodEffectiveness,
    prerequisites, teacher_preferred_methods
)
from app.optimization.scoring import scoring_engine
from app.optimization.time_allocator import time_allocator

def seed_database():
    print("Initializing Database tables...")
    if db_dialect == "sqlite":
        Base.metadata.create_all(bind=db_engine)
    # PostgreSQL tables come from Alembic: alembic -c database/migrations/alembic.ini upgrade head
    db: Session = SessionLocal()

    try:
        # Check if already seeded
        existing_course = db.query(Course).filter(Course.code == "CS302").first()
        if existing_course:
            print("Database already contains CS302 course. Cleaning previous seed...")
            db.delete(existing_course)
            db.commit()

        print("Seeding Users and Teacher...")
        # 1. User & Teacher
        user = db.query(User).filter(User.email == "faculty@optiteach.edu").first()
        if not user:
            user = User(
                email="faculty@optiteach.edu",
                hashed_password=hash_password("admin123"),
                full_name="Prof. Alan Turing",
                role="teacher"
            )
            db.add(user)
            db.flush()

        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if not teacher:
            teacher = Teacher(
                user_id=user.id,
                department="Computer Science & Engineering",
                designation="Associate Professor",
                employee_id="FAC-CS-042",
                office_location="Turing Hall, Room 304"
            )
            db.add(teacher)
            db.flush()

        # Department administrator: sees every course (role-based access demo)
        if not db.query(User).filter(User.email == "admin@optiteach.edu").first():
            db.add(User(
                email="admin@optiteach.edu",
                hashed_password=hash_password("admin123"),
                full_name="Dept. Administrator",
                role="admin"
            ))
            db.flush()

        print("Seeding Course: Database Management Systems (CS302)...")
        # 2. Course: CS302
        course = Course(
            teacher_id=teacher.id,
            code="CS302",
            title="Database Management Systems",
            semester="Fall 2026",
            academic_year="2026-2027",
            total_classes=40,
            period_duration=55,
            start_date=datetime.datetime(2026, 8, 1, 9, 0),
            end_date=datetime.datetime(2026, 12, 15, 17, 0)
        )
        db.add(course)
        db.flush()

        # Section
        section = Section(
            course_id=course.id,
            name="Section A",
            room_number="Lab Block 201",
            student_count=64
        )
        db.add(section)

        # Teacher Constraints
        constraint = TeacherConstraint(
            course_id=course.id,
            max_lecture_ratio=0.40,
            min_practice_ratio=0.35,
            revision_threshold_score=60.0,
            default_revision_minutes=10
        )
        db.add(constraint)

        print("Seeding Course Outcomes...")
        # 3. Course Outcomes
        co1 = CourseOutcome(course_id=course.id, code="CO1", description="Understand fundamental database concepts, data models, and entity-relationship diagrams.", bloom_level="Understand")
        co2 = CourseOutcome(course_id=course.id, code="CO2", description="Formulate complex relational algebra expressions and SQL queries for data manipulation.", bloom_level="Apply")
        co3 = CourseOutcome(course_id=course.id, code="CO3", description="Apply relational database design theory and normalization algorithms up to BCNF.", bloom_level="Analyze")
        co4 = CourseOutcome(course_id=course.id, code="CO4", description="Analyze transaction processing, concurrency control protocols, and database recovery.", bloom_level="Analyze")
        co5 = CourseOutcome(course_id=course.id, code="CO5", description="Evaluate physical storage indexing mechanisms and cost-based query optimization.", bloom_level="Evaluate")
        db.add_all([co1, co2, co3, co4, co5])
        db.flush()

        print("Seeding Teaching Methods Catalog & Effectiveness Records...")
        # 4. Teaching Methods
        methods_data = [
            ("Interactive Lecture & Structural Modeling", "conceptual", "Visual architecture mapping and instructor explanation.", 0.35),
            ("Worked Examples & Decomposition", "problem_solving", "Step-by-step problem dissection and solution synthesis on board.", 0.35),
            ("Guided Practice & Formative Exit Check", "active_learning", "Student paired exercises with real-time instructor feedback.", 0.20),
            ("Hands-on Live Demonstration", "practical", "Live terminal queries and query plan inspection.", 0.30),
            ("Recap & Prerequisite Revision", "revision", "Diagnostic error correction and prerequisite concept reinforcement.", 0.20),
            ("Case Study & Schema Review", "analytical", "Dissecting production database schemas and normal form trade-offs.", 0.25)
        ]
        method_entities = {}
        for m_name, cat, desc, ratio in methods_data:
            existing_m = db.query(TeachingMethod).filter(TeachingMethod.name == m_name).first()
            if not existing_m:
                existing_m = TeachingMethod(name=m_name, category=cat, description=desc, typical_time_ratio=ratio)
                db.add(existing_m)
                db.flush()
            method_entities[m_name] = existing_m

        # Teacher's ranked method preferences (normalized association table)
        db.flush()
        for rank, m_name in enumerate(["Worked Examples & Decomposition", "Guided Practice & Formative Exit Check"], start=1):
            db.execute(teacher_preferred_methods.insert().values(
                constraint_id=constraint.id, method_id=method_entities[m_name].id, rank=rank
            ))

        # Method Effectiveness
        eff_records = [
            (method_entities["Worked Examples & Decomposition"].id, "problem_solving", 50.0, 68.0, 18.0, 12),
            (method_entities["Guided Practice & Formative Exit Check"].id, "problem_solving", 52.0, 67.5, 15.5, 10),
            (method_entities["Recap & Prerequisite Revision"].id, "revision", 48.0, 64.0, 16.0, 8),
            (method_entities["Interactive Lecture & Structural Modeling"].id, "conceptual", 55.0, 66.0, 11.0, 14),
            (method_entities["Hands-on Live Demonstration"].id, "practical", 54.0, 71.0, 17.0, 9),
            (method_entities["Case Study & Schema Review"].id, "analytical", 58.0, 70.0, 12.0, 6)
        ]
        # Methods outlive the course, so clear their evidence rows to keep re-seeding idempotent
        db.query(MethodEffectiveness).filter(
            MethodEffectiveness.method_id.in_([m.id for m in method_entities.values()])
        ).delete(synchronize_session=False)
        for mid, ctype, base_s, post_s, gain, cnt in eff_records:
            me = MethodEffectiveness(
                method_id=mid,
                concept_type=ctype,
                baseline_score=base_s,
                post_score=post_s,
                observed_gain=gain,
                sample_sessions_count=cnt
            )
            db.add(me)
        db.flush()

        print("Seeding Units, Topics, and Concepts with Prerequisite Graph...")
        # 5. Units, Topics, Concepts
        # Unit 1
        u1 = Unit(course_id=course.id, unit_number=1, title="Database Architecture & ER Modeling", order_index=1)
        db.add(u1)
        db.flush()
        t1 = Topic(unit_id=u1.id, title="DBMS Architecture & Data Independence", order_index=1, estimated_minutes=110, allocated_minutes=110, status="completed")
        t2 = Topic(unit_id=u1.id, title="Entity-Relationship (ER) Modeling", order_index=2, estimated_minutes=165, allocated_minutes=165, status="completed")
        t3 = Topic(unit_id=u1.id, title="Relational Model & Mapping", order_index=3, estimated_minutes=110, allocated_minutes=110, status="completed")
        db.add_all([t1, t2, t3])
        db.flush()

        c_arch = Concept(topic_id=t1.id, name="3-Schema Architecture", difficulty=2, importance=4, concept_type="conceptual", order_index=1)
        c_er = Concept(topic_id=t2.id, name="Entities, Attributes & Cardinalities", difficulty=3, importance=5, concept_type="conceptual", order_index=1)
        c_map = Concept(topic_id=t3.id, name="ER-to-Relational Mapping", difficulty=3, importance=5, concept_type="procedural", order_index=1)
        db.add_all([c_arch, c_er, c_map])
        db.flush()
        c_map.prerequisites.append(c_er)

        # Unit 2
        u2 = Unit(course_id=course.id, unit_number=2, title="Relational Query Languages (Algebra & SQL)", order_index=2)
        db.add(u2)
        db.flush()
        t4 = Topic(unit_id=u2.id, title="Relational Algebra Operators", order_index=1, estimated_minutes=165, allocated_minutes=165, status="completed")
        t5 = Topic(unit_id=u2.id, title="SQL DDL & Complex Queries", order_index=2, estimated_minutes=220, allocated_minutes=220, status="completed")
        db.add_all([t4, t5])
        db.flush()

        c_ra_ops = Concept(topic_id=t4.id, name="Selection, Projection & Cartesian Product", difficulty=3, importance=4, concept_type="problem_solving", order_index=1)
        c_ra_join = Concept(topic_id=t4.id, name="Relational Joins & Division", difficulty=4, importance=5, concept_type="problem_solving", order_index=2)
        c_sql_dml = Concept(topic_id=t5.id, name="Complex SQL Joins & Aggregations", difficulty=3, importance=5, concept_type="practical", order_index=1)
        c_subq = Concept(topic_id=t5.id, name="Subqueries & Correlated Queries", difficulty=4, importance=5, concept_type="problem_solving", order_index=2)
        db.add_all([c_ra_ops, c_ra_join, c_sql_dml, c_subq])
        db.flush()
        c_ra_ops.prerequisites.append(c_map)
        c_ra_join.prerequisites.append(c_ra_ops)
        c_sql_dml.prerequisites.append(c_ra_join)
        c_subq.prerequisites.append(c_sql_dml)

        # Unit 3 - The Flagship Focal Unit
        u3 = Unit(course_id=course.id, unit_number=3, title="Relational Database Design Theory", order_index=3)
        db.add(u3)
        db.flush()
        t6 = Topic(unit_id=u3.id, title="Functional Dependencies & Keys", order_index=1, estimated_minutes=165, allocated_minutes=165, status="completed")
        t7 = Topic(unit_id=u3.id, title="Relational Normalization (1NF, 2NF, 3NF, BCNF)", order_index=2, estimated_minutes=220, allocated_minutes=220, status="in_progress")
        db.add_all([t6, t7])
        db.flush()

        c_fd = Concept(topic_id=t6.id, name="Functional Dependencies & Armstrong's Axioms", difficulty=3, importance=5, concept_type="analytical", order_index=1)
        c_closure = Concept(topic_id=t6.id, name="Attribute Closure & Minimal Cover", difficulty=4, importance=5, concept_type="problem_solving", order_index=2)
        c_candkey = Concept(topic_id=t6.id, name="Candidate Key Determination", difficulty=4, importance=5, concept_type="problem_solving", order_index=3)

        c_1nf_2nf = Concept(topic_id=t7.id, name="1NF & 2NF Decomposition", difficulty=3, importance=4, concept_type="analytical", order_index=1)
        c_3nf = Concept(topic_id=t7.id, name="Third Normal Form (3NF) & Lossless Joins", difficulty=4, importance=5, concept_type="problem_solving", order_index=2)
        c_bcnf = Concept(topic_id=t7.id, name="Boyce-Codd Normal Form (BCNF)", difficulty=5, importance=5, concept_type="problem_solving", order_index=3)
        db.add_all([c_fd, c_closure, c_candkey, c_1nf_2nf, c_3nf, c_bcnf])
        db.flush()

        c_fd.prerequisites.append(c_map)
        c_closure.prerequisites.append(c_fd)
        c_candkey.prerequisites.append(c_closure)
        c_1nf_2nf.prerequisites.append(c_candkey)
        c_3nf.prerequisites.append(c_1nf_2nf)
        c_bcnf.prerequisites.append(c_3nf)

        # Unit 4
        u4 = Unit(course_id=course.id, unit_number=4, title="Transaction Processing & Concurrency", order_index=4)
        db.add(u4)
        db.flush()
        t8 = Topic(unit_id=u4.id, title="Transaction Concepts & Serializability", order_index=1, estimated_minutes=110, allocated_minutes=110, status="pending")
        t9 = Topic(unit_id=u4.id, title="Concurrency Control Protocols & Recovery", order_index=2, estimated_minutes=165, allocated_minutes=165, status="pending")
        db.add_all([t8, t9])
        db.flush()

        c_acid = Concept(topic_id=t8.id, name="ACID Properties & Transaction States", difficulty=2, importance=4, concept_type="conceptual", order_index=1)
        c_serial = Concept(topic_id=t8.id, name="Conflict & View Serializability", difficulty=4, importance=5, concept_type="analytical", order_index=2)
        c_2pl = Concept(topic_id=t9.id, name="Two-Phase Locking (2PL) & Deadlocks", difficulty=4, importance=5, concept_type="problem_solving", order_index=1)
        c_recovery = Concept(topic_id=t9.id, name="WAL Log-Based Recovery & Checkpoints", difficulty=4, importance=4, concept_type="procedural", order_index=2)
        db.add_all([c_acid, c_serial, c_2pl, c_recovery])
        db.flush()
        c_serial.prerequisites.append(c_acid)
        c_2pl.prerequisites.append(c_serial)
        c_recovery.prerequisites.append(c_acid)

        # Unit 5
        u5 = Unit(course_id=course.id, unit_number=5, title="Storage, Indexing & Query Optimization", order_index=5)
        db.add(u5)
        db.flush()
        t10 = Topic(unit_id=u5.id, title="File Organization & B+ Tree Indexing", order_index=1, estimated_minutes=165, allocated_minutes=165, status="pending")
        t11 = Topic(unit_id=u5.id, title="Query Processing & Heuristic Optimization", order_index=2, estimated_minutes=165, allocated_minutes=165, status="pending")
        db.add_all([t10, t11])
        db.flush()

        c_btree = Concept(topic_id=t10.id, name="B+ Tree Indexing Operations", difficulty=4, importance=5, concept_type="problem_solving", order_index=1)
        c_opt = Concept(topic_id=t11.id, name="Cost-based Query Plans & Heuristics", difficulty=4, importance=4, concept_type="analytical", order_index=1)
        db.add_all([c_btree, c_opt])
        db.flush()
        c_opt.prerequisites.append(c_ra_join)

        print("Seeding Assessments and Concept Performance Deficits...")
        # 6. Assessments
        # Quiz 1: Units 1 & 2
        a1 = Assessment(
            course_id=course.id,
            title="Quiz 1: Relational Algebra & SQL",
            assessment_type="quiz",
            max_marks=20.0,
            scheduled_date=datetime.datetime(2026, 9, 10, 10, 0),
            status="completed"
        )
        db.add(a1)
        db.flush()
        p1 = Performance(concept_id=c_ra_ops.id, assessment_id=a1.id, average_score=78.5, sample_size=62, weakness_flag=False, common_errors="Minor syntax error in Cartesian product")
        p2 = Performance(concept_id=c_sql_dml.id, assessment_id=a1.id, average_score=72.0, sample_size=62, weakness_flag=False, common_errors="GROUP BY column list omissions")
        # Completes evidence for every concept of "Relational Algebra" (relational-division demo)
        p_join = Performance(concept_id=c_ra_join.id, assessment_id=a1.id, average_score=74.0, sample_size=62, weakness_flag=False, common_errors="Division operator rewritten as nested NOT EXISTS incorrectly")
        db.add_all([p1, p2, p_join])

        # Quiz 2: Functional Dependencies & Keys (THE WEAK PREREQUISITE)
        a2 = Assessment(
            course_id=course.id,
            title="Quiz 2: Functional Dependencies & Minimal Cover",
            assessment_type="quiz",
            max_marks=25.0,
            scheduled_date=datetime.datetime(2026, 9, 20, 11, 0),
            status="completed"
        )
        db.add(a2)
        db.flush()
        
        # WEAK PERFORMANCE on Attribute Closure & Minimal Cover!
        p_weak1 = Performance(
            concept_id=c_closure.id,
            assessment_id=a2.id,
            average_score=52.4, # < 60% THRESHOLD
            sample_size=63,
            weakness_flag=True,
            common_errors="Students failed to compute extraneous attributes correctly during minimal cover reduction"
        )
        p_weak2 = Performance(
            concept_id=c_candkey.id,
            assessment_id=a2.id,
            average_score=56.8, # < 60% THRESHOLD
            sample_size=63,
            weakness_flag=True,
            common_errors="Confusing superkeys with minimal candidate keys"
        )
        db.add_all([p_weak1, p_weak2])

        # Upcoming Midterm 2
        a3 = Assessment(
            course_id=course.id,
            title="Midterm 2: Normalization & Transactions",
            assessment_type="midterm",
            max_marks=50.0,
            scheduled_date=datetime.datetime(2026, 10, 15, 14, 0),
            status="upcoming"
        )
        db.add(a3)
        db.flush()

        q_norm = Question(assessment_id=a3.id, question_number=1, max_marks=15.0, text="Decompose relation R into 3NF and verify dependency preservation.")
        q_norm.concepts.append(c_3nf)
        db.add(q_norm)

        print("Seeding Class Sessions and Teaching History...")
        # 7. Class Sessions (40 periods)
        # Sessions 1-14 Completed
        topics_sequence = [t1, t1, t2, t2, t2, t3, t3, t4, t4, t4, t5, t5, t5, t6]
        for s_idx, top in enumerate(topics_sequence, start=1):
            sess = ClassSession(
                course_id=course.id,
                session_number=s_idx,
                duration_minutes=55,
                current_topic_id=top.id,
                status="completed"
            )
            db.add(sess)
            db.flush()

            # Record TeachingSession
            ts = TeachingSession(
                session_id=sess.id,
                method_id=method_entities["Worked Examples & Decomposition"].id if "Problem" in top.title else method_entities["Interactive Lecture & Structural Modeling"].id,
                actual_minutes=55,
                teacher_notes=f"Completed standard syllabus coverage of {top.title}. Cohort participation was high.",
                student_engagement_rating=4,
                conducted_at=datetime.datetime(2026, 8, 15) + datetime.timedelta(days=s_idx * 2)
            )
            db.add(ts)

        # Session 15: FLAGSHIP NEXT CLASS (Relational Normalization)
        s15 = ClassSession(
            course_id=course.id,
            session_number=15,
            duration_minutes=55,
            current_topic_id=t7.id, # Relational Normalization
            status="scheduled"
        )
        db.add(s15)
        db.flush()

        # Remaining Sessions 16-40
        all_remaining_topics = [t7, t7, t7, t8, t8, t9, t9, t9, t10, t10, t10, t11, t11, t11]
        for s_idx in range(16, 41):
            rem_top = all_remaining_topics[(s_idx - 16) % len(all_remaining_topics)]
            sess = ClassSession(
                course_id=course.id,
                session_number=s_idx,
                duration_minutes=55,
                current_topic_id=rem_top.id,
                status="scheduled"
            )
            db.add(sess)

        db.commit()

        # Run Optimizer on Seed Data to populate priority scores and allocations
        print("Running initial Course-Level Time Optimizer...")
        time_allocator.optimize_course_time(db, course.id)

        # Seed MongoDB curriculum graph artifact
        mongo_db = get_mongo_db()
        graph_artifact = {
            "course_id": course.id,
            "title": course.title,
            "seeded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "nodes_count": 22,
            "edges_count": 18
        }
        mongo_db["curriculum_graphs"].update_one(
            {"course_id": course.id},
            {"$set": graph_artifact},
            upsert=True
        )

        refresh_dashboard_snapshot(db)

        print("OptiTeach Seed Dataset successfully populated!")
        print("Teacher: faculty@optiteach.edu / admin123")
        print("Course: CS302 - Database Management Systems")
        print("Flagship Next Class: Period 15 -> Normalization with 10 min Revision for Attribute Closure & Minimal Cover")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
