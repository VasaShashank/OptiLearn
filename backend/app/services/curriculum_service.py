import networkx as nx
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.entities import Course, Unit, Topic, Concept, CourseOutcome, ClassSession, Performance, prerequisites
from app.schemas.schemas import ConfirmCurriculumRequest, CurriculumGraphResponse, GraphNode, GraphEdge
from app.database.connection import get_mongo_db

class CurriculumService:
    """
    Curriculum Graph & Confirmation Service.
    Transforms confirmed curriculum drafts into authoritative 3NF relational models in PostgreSQL,
    generates initial class sessions, and caches rich graph topologies in MongoDB.
    """

    def confirm_and_persist(self, db: Session, course_id: str, payload: ConfirmCurriculumRequest) -> Dict[str, Any]:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        # Update course title and code if provided
        if payload.course_name:
            course.title = payload.course_name.strip()
        if payload.course_code:
            course.code = payload.course_code.strip()

        # Start transactional commit
        # 1. Clear previous unconfirmed structure if any
        existing_units = db.query(Unit).filter(Unit.course_id == course_id).all()
        for u in existing_units:
            db.delete(u)
        db.flush()

        # 2. Clear old course outcomes and insert newly confirmed outcomes
        existing_outcomes = db.query(CourseOutcome).filter(CourseOutcome.course_id == course_id).all()
        for oc in existing_outcomes:
            db.delete(oc)
        db.flush()

        for oc in payload.outcomes:
            co = CourseOutcome(
                course_id=course_id,
                code=oc.code,
                description=oc.description,
                bloom_level=oc.bloom_level
            )
            db.add(co)
        db.flush()

        # 3. Insert Units, Topics, Concepts
        concept_name_map: Dict[str, Concept] = {}
        prereq_declarations: List[tuple] = [] # (concept_entity, list_of_prereq_names)

        total_topics = 0
        for u_draft in payload.units:
            unit = Unit(
                course_id=course_id,
                unit_number=u_draft.unit_number,
                title=u_draft.title,
                description=u_draft.description,
                order_index=u_draft.unit_number
            )
            db.add(unit)
            db.flush()

            for t_idx, t_draft in enumerate(u_draft.topics, start=1):
                total_topics += 1
                topic = Topic(
                    unit_id=unit.id,
                    title=t_draft.title,
                    description=t_draft.description,
                    order_index=t_idx,
                    estimated_minutes=t_draft.estimated_minutes,
                    allocated_minutes=t_draft.estimated_minutes, # baseline
                    status="pending"
                )
                db.add(topic)
                db.flush()

                for c_idx, c_draft in enumerate(t_draft.concepts, start=1):
                    concept = Concept(
                        topic_id=topic.id,
                        name=c_draft.name,
                        description=c_draft.description,
                        difficulty=c_draft.difficulty,
                        importance=c_draft.importance,
                        concept_type=c_draft.concept_type,
                        order_index=c_idx
                    )
                    db.add(concept)
                    db.flush()
                    concept_name_map[concept.name] = concept
                    if c_draft.prerequisites:
                        prereq_declarations.append((concept, c_draft.prerequisites))

        # 4. Resolve Directed Prerequisite Edges in PostgreSQL
        for concept, prereq_names in prereq_declarations:
            for p_name in prereq_names:
                if p_name in concept_name_map and concept_name_map[p_name].id != concept.id:
                    p_entity = concept_name_map[p_name]
                    if p_entity not in concept.prerequisites:
                        concept.prerequisites.append(p_entity)

        # 5. Populate Initial Class Sessions if empty
        existing_sessions = db.query(ClassSession).filter(ClassSession.course_id == course_id).count()
        if existing_sessions == 0:
            # Map topics sequentially across total_classes
            all_topics = db.query(Topic).join(Topic.unit).filter(Topic.unit.has(course_id=course_id)).order_by(Topic.unit_id, Topic.order_index).all()
            for s_num in range(1, course.total_classes + 1):
                # Assign topic round-robin or sequential
                t_idx = min(len(all_topics) - 1, (s_num - 1) // 2) if all_topics else None
                assigned_topic = all_topics[t_idx] if (all_topics and t_idx is not None) else None
                
                cs = ClassSession(
                    course_id=course_id,
                    session_number=s_num,
                    duration_minutes=course.period_duration,
                    current_topic_id=assigned_topic.id if assigned_topic else None,
                    status="scheduled"
                )
                db.add(cs)

        db.commit()

        # 6. Save Graph Artifact to MongoDB
        mongo_db = get_mongo_db()
        graph_artifact = {
            "course_id": course_id,
            "total_units": len(payload.units),
            "total_topics": total_topics,
            "total_concepts": len(concept_name_map),
            "adjacency_list": {
                c.id: [p.id for p in c.prerequisites] for c in concept_name_map.values()
            }
        }
        mongo_db["curriculum_graphs"].update_one(
            {"course_id": course_id},
            {"$set": graph_artifact},
            upsert=True
        )

        return {
            "status": "success",
            "message": f"Successfully confirmed curriculum: {len(payload.units)} units, {total_topics} topics, {len(concept_name_map)} concepts.",
            "total_concepts": len(concept_name_map),
            "course_id": course_id
        }

    def get_graph(self, db: Session, course_id: str) -> CurriculumGraphResponse:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        concepts = (
            db.query(Concept)
            .join(Topic, Concept.topic_id == Topic.id)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id))
            .all()
        )

        dag = nx.DiGraph()
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []

        # Build Graph
        for c in concepts:
            dag.add_node(c.id, entity=c)
            for p in c.prerequisites:
                dag.add_edge(p.id, c.id)
                edges.append(GraphEdge(source=p.id, target=c.id))

        bottlenecks = []
        for c in concepts:
            downstream_count = len(nx.descendants(dag, c.id)) if c.id in dag else 0
            
            # Check performance
            performances = db.query(Performance).filter(Performance.concept_id == c.id).all()
            avg_score = None
            status = "pending"
            if performances:
                avg_score = round(sum(p.average_score for p in performances) / len(performances), 1)
                if avg_score >= 70.0:
                    status = "mastered"
                elif avg_score < 60.0:
                    status = "weak"
                else:
                    status = "moderate"

            if downstream_count >= 2 and (avg_score is not None and avg_score < 60.0):
                status = "bottleneck"
                bottlenecks.append(c.id)

            nodes.append(GraphNode(
                id=c.id,
                name=c.name,
                topic_id=c.topic_id,
                topic_title=c.topic.title if c.topic else "",
                unit_number=c.topic.unit.unit_number if (c.topic and c.topic.unit) else 1,
                difficulty=c.difficulty,
                importance=c.importance,
                concept_type=c.concept_type,
                status=status,
                avg_score=avg_score,
                downstream_count=downstream_count
            ))

        return CurriculumGraphResponse(
            course_id=course_id,
            course_title=course.title,
            nodes=nodes,
            edges=edges,
            bottlenecks=bottlenecks
        )

curriculum_service = CurriculumService()
