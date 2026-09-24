const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("optilearn_token");
  }
  return null;
}

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────
export const authAPI = {
  login: (email: string, password: string) =>
    fetchAPI<LoginResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),
  register: (data: { email: string; password: string; full_name: string; department: string; employee_id: string; designation?: string }) =>
    fetchAPI<LoginResponse>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => fetchAPI<AuthUser>("/auth/me"),
};

// ── Courses ───────────────────────────────────────
import type {
  Course,
  ExtractedCurriculum,
  CurriculumGraph,
  CourseOptimization,
  NextClassPlan,
  LessonPlan,
  AssessmentItem,
  CourseAnalytics,
  TableSchemaInfo,
  QueryDemoResult,
  AuthUser,
  LoginResponse,
  RichLessonPlanAsset,
} from "./types";

export const coursesAPI = {
  list: () => fetchAPI<Course[]>("/courses"),
  get: (id: string) => fetchAPI<Course>(`/courses/${id}`),
  create: (data: {
    code: string;
    title: string;
    semester: string;
    academic_year?: string;
    total_classes?: number;
    period_duration?: number;
    section_name?: string;
    student_count?: number;
  }) => fetchAPI<Course>("/courses", { method: "POST", body: JSON.stringify(data) }),
  getGraph: (id: string) => fetchAPI<CurriculumGraph>(`/courses/${id}/graph`),
  updateConcept: (courseId: string, conceptId: string, data: { difficulty?: number; importance?: number; name?: string; prerequisites?: string[] }) =>
    fetchAPI<{ status: string; concept_id: string }>(`/courses/${courseId}/concepts/${conceptId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  addPrerequisite: (courseId: string, sourceId: string, targetId: string) =>
    fetchAPI<{ status: string; message: string; source_id: string; target_id: string }>(`/courses/${courseId}/prerequisites`, {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    }),
  deletePrerequisite: (courseId: string, sourceId: string, targetId: string) =>
    fetchAPI<{ status: string; message: string }>(`/courses/${courseId}/prerequisites/${sourceId}/${targetId}`, {
      method: "DELETE",
    }),
  reorderCurriculum: (courseId: string, data: { topic_orders?: { id: string; order_index: number }[]; concept_moves?: { id: string; topic_id?: string; order_index?: number }[] }) =>
    fetchAPI<{ status: string; message: string }>(`/courses/${courseId}/curriculum/reorder`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  confirmCurriculum: (id: string, data: unknown) =>
    fetchAPI(`/courses/${id}/curriculum/confirm`, { method: "POST", body: JSON.stringify(data) }),
  optimize: (id: string) =>
    fetchAPI<CourseOptimization>(`/courses/${id}/optimize`, { method: "POST" }),
  getOptimization: (id: string) =>
    fetchAPI<CourseOptimization>(`/courses/${id}/optimization`),
  optimizeNextClass: (id: string, sessionNumber?: number) =>
    fetchAPI<NextClassPlan>(
      `/courses/${id}/optimize-next-class${sessionNumber ? `?session_number=${sessionNumber}` : ""}`,
      { method: "POST" }
    ),
  listLessonPlans: (id: string, sessionNumber?: number, status?: string) => {
    const params = new URLSearchParams();
    if (sessionNumber) params.append("session_number", sessionNumber.toString());
    if (status) params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<LessonPlan[]>(`/courses/${id}/lesson-plans${query}`);
  },
  generateLessonPlan: (id: string, data: unknown) =>
    fetchAPI<LessonPlan>(`/courses/${id}/lesson-plans/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getRichContent: (courseId: string, sessionNumber: number) =>
    fetchAPI<RichLessonPlanAsset>(`/courses/${courseId}/lesson-plans/${sessionNumber}/rich-content`),
  saveRichContent: (courseId: string, sessionNumber: number, data: Partial<RichLessonPlanAsset>) =>
    fetchAPI<RichLessonPlanAsset>(`/courses/${courseId}/lesson-plans/${sessionNumber}/rich-content`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logTeachingSession: (courseId: string, sessionNumber: number, data: { actual_minutes: number; student_engagement_rating: number; teacher_notes?: string; completion_rate?: number }) =>
    fetchAPI<{ status: string; session_id: string }>(`/courses/${courseId}/sessions/${sessionNumber}/conduct`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listAssessments: (id: string) => fetchAPI<AssessmentItem[]>(`/courses/${id}/assessments`),
  createAssessment: (id: string, data: unknown) =>
    fetchAPI(`/courses/${id}/assessments`, { method: "POST", body: JSON.stringify(data) }),
  recordResults: (courseId: string, assessmentId: string, data: unknown) =>
    fetchAPI(`/courses/${courseId}/assessments/${assessmentId}/results`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAnalytics: (id: string) => fetchAPI<CourseAnalytics>(`/courses/${id}/analytics`),
  uploadSyllabus: async (courseId: string, file?: File, rawText?: string) => {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else if (rawText) {
      formData.append("raw_text", rawText);
    }
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/courses/${courseId}/syllabus`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to upload syllabus to course");
    }
    return res.json();
  },
};

// ── Syllabus ──────────────────────────────────────
export const syllabusAPI = {
  upload: async (file?: File, rawText?: string): Promise<ExtractedCurriculum> => {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else if (rawText) {
      formData.append("raw_text", rawText);
    }
    const res = await fetch(`${API_BASE}/syllabus/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Syllabus extraction failed");
    }
    return res.json();
  },
};

// ── DBMS Insights ─────────────────────────────────
export const dbmsAPI = {
  getStatus: () => fetchAPI<Record<string, unknown>>("/dbms/status"),
  getSchema: () => fetchAPI<TableSchemaInfo[]>("/dbms/schema"),
  listQueries: () =>
    fetchAPI<Array<{ id: string; title: string; category: string; purpose: string }>>("/dbms/queries"),
  executeQuery: (queryId: string, courseId?: string) =>
    fetchAPI<QueryDemoResult>(
      `/dbms/queries/${queryId}/execute${courseId ? `?course_id=${courseId}` : ""}`,
      { method: "POST" }
    ),
};

// ── Health ─────────────────────────────────────────
export const healthAPI = {
  check: () =>
    fetch(API_BASE.replace("/api", "") + "/health")
      .then((r) => r.json())
      .catch(() => ({ status: "unreachable" })),
};

// ── Exports ────────────────────────────────────────
export const exportsAPI = {
  getCalendarUrl: (courseId: string) => `${API_BASE}/exports/courses/${courseId}/calendar.ics`,
  getPrintableLessonPlanUrl: (sessionId: string) => `${API_BASE}/exports/lesson-plans/${sessionId}/printable`,
  getOutcomesMatrix: (courseId: string) => fetchAPI<{ course_id: string; standard: string; outcomes_count: number; attainment_matrix: any[] }>(`/exports/courses/${courseId}/outcomes-matrix`),
};

