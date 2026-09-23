export interface Course {
  id: string;
  code: string;
  title: string;
  semester: string;
  academic_year: string;
  total_classes: number;
  period_duration: number;
  total_available_minutes: number;
  teacher_name?: string;
  section_name?: string;
  units_count: number;
  topics_count: number;
  concepts_count: number;
  created_at?: string;
}

export interface OutcomeDraft {
  code: string;
  description: string;
  bloom_level: string;
}

export interface ConceptDraft {
  id?: string;
  name: string;
  description?: string;
  difficulty: number;
  importance: number;
  concept_type: string;
  prerequisites: string[];
  bloom_level?: string;
}

export interface TopicDraft {
  id?: string;
  title: string;
  description?: string;
  estimated_minutes: number;
  concepts: ConceptDraft[];
}

export interface UnitDraft {
  id?: string;
  unit_number: number;
  title: string;
  description?: string;
  topics: TopicDraft[];
}

export interface ExtractedCurriculum {
  course_name: string;
  course_code: string;
  outcomes: OutcomeDraft[];
  units: UnitDraft[];
  confidence_score: number;
  extraction_notes: string[];
}

export interface GraphNode {
  id: string;
  name: string;
  topic_id: string;
  topic_title: string;
  unit_number: number;
  difficulty: number;
  importance: number;
  concept_type: string;
  status: "mastered" | "weak" | "bottleneck" | "pending" | "moderate";
  avg_score?: number;
  downstream_count: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship_type: string;
}

export interface CurriculumGraph {
  course_id: string;
  course_title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  bottlenecks: string[];
}

export interface TopicAllocation {
  topic_id: string;
  unit_number: number;
  topic_title: string;
  estimated_minutes: number;
  allocated_minutes: number;
  priority_score: number;
  recommended_periods: number;
  reason_codes: string[];
  explanation: string;
  key_concepts: string[];
}

export interface CourseOptimization {
  course_id: string;
  total_available_minutes: number;
  total_allocated_minutes: number;
  revision_budget_minutes: number;
  assessment_budget_minutes: number;
  unallocated_buffer_minutes: number;
  time_pressure_status: "healthy" | "balanced" | "high_pressure";
  topic_allocations: TopicAllocation[];
  formula_explanation: Record<string, any>;
}

export interface PeriodPhase {
  phase_name: string;
  duration_minutes: number;
  method_name: string;
  activity_description: string;
  concept_ref?: string;
}

export interface NextClassPlan {
  session_number: number;
  topic_id: string;
  topic_title: string;
  unit_number: number;
  period_duration: number;
  target_concepts: string[];
  revision_needed: boolean;
  revision_minutes: number;
  revision_concept?: string;
  revision_reason?: string;
  recommended_methods: string[];
  phases: PeriodPhase[];
  total_phase_minutes: number;
  why_explanation: string;
  learning_gain_prediction: number;
}

export interface LessonPlan {
  id: string;
  session_id: string;
  session_number: number;
  topic_id: string;
  topic_title: string;
  title: string;
  status: string;
  teacher_overridden: boolean;
  phases: PeriodPhase[];
  learning_objectives: string[];
  worked_examples: string[];
  active_exercises: string[];
  misconceptions: string[];
  assessment_questions: string[];
  created_at?: string;
}

export interface AssessmentItem {
  id: string;
  title: string;
  assessment_type: string;
  max_marks: number;
  scheduled_date?: string;
  status: string;
  questions_count: number;
  performances: Array<{
    concept_id: string;
    concept_name: string;
    average_score: number;
    weakness_flag: boolean;
    common_errors?: string;
  }>;
}

export interface AlertItem {
  id: string;
  severity: "danger" | "warning" | "info" | "success";
  title: string;
  message: string;
  action_label?: string;
  action_route?: string;
}

export interface CourseAnalytics {
  course_id: string;
  progress_percentage: number;
  completed_sessions: number;
  total_sessions: number;
  planned_minutes: number;
  actual_minutes_taught: number;
  remaining_minutes: number;
  concept_health: {
    strong: number;
    moderate: number;
    weak: number;
    bottleneck: number;
  };
  teaching_method_effectiveness: Array<{
    method_name: string;
    category: string;
    concept_type: string;
    baseline_score: number;
    post_score: number;
    observed_gain: number;
    sessions_tracked: number;
  }>;
  alerts: AlertItem[];
}

export interface TableColumn {
  name: string;
  type: string;
  primary_key: boolean;
  foreign_key?: string;
  nullable: boolean;
}

export interface TableSchemaInfo {
  table_name: string;
  description: string;
  row_count: number;
  normal_form: string;
  columns: TableColumn[];
}

export interface QueryDemoResult {
  query_id: string;
  title: string;
  category: string;
  sql: string;
  purpose: string;
  params: Record<string, any>;
  row_count: number;
  columns: string[];
  rows: Record<string, any>[];
  execution_time_ms: number;
}
