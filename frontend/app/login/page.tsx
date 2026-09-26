"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, LogIn, UserPlus, AlertCircle } from "lucide-react";
import { authAPI } from "@/lib/api";
import { saveSession } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  { label: "Teacher (owns CS302)", email: "faculty@optiteach.edu", password: "admin123" },
  { label: "Administrator (all courses)", email: "admin@optiteach.edu", password: "admin123" },
];

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", department: "", employee_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = mode === "login"
        ? await authAPI.login(form.email, form.password)
        : await authAPI.register(form);
      saveSession(session);
      // Only same-site paths: never follow an absolute URL from the query string
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="glass-card animate-fade-in-up" style={{ width: "100%", maxWidth: 420, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center",
            justifyContent: "center", background: "linear-gradient(135deg, var(--brand-start), var(--brand-mid))",
          }}>
            <GraduationCap size={22} color="white" />
          </div>
          <div>
            <div className="gradient-text" style={{ fontSize: "1.25rem", fontWeight: 700 }}>OptiTeach</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Sign in to plan your teaching</div>
          </div>
        </div>

        <div className="tab-list" style={{ marginBottom: 20 }}>
          <button type="button" className={`tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Sign in</button>
          <button type="button" className={`tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Create account</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <>
              <Field label="Full name"><input className="input" required value={form.full_name} onChange={set("full_name")} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Department"><input className="input" required value={form.department} onChange={set("department")} /></Field>
                <Field label="Employee ID"><input className="input" required value={form.employee_id} onChange={set("employee_id")} /></Field>
              </div>
            </>
          )}
          <Field label="Email"><input className="input" type="email" autoComplete="email" required value={form.email} onChange={set("email")} /></Field>
          <Field label={mode === "register" ? "Password (8+ characters)" : "Password"}>
            <input className="input" type="password" required minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={set("password")} />
          </Field>

          {error && (
            <div role="alert" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem", color: "var(--redpen)" }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", marginTop: 4 }}>
            {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create teacher account"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
              Demo accounts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" className="btn btn-ghost" style={{ justifyContent: "space-between", fontSize: "0.9rem" }}
                  onClick={() => setForm({ ...form, email: a.email, password: a.password })}>
                  <span>{a.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.85rem" }}>{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
      {label}
      {children}
    </label>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for static rendering
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
