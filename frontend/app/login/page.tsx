"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { LogIn, Key, Mail, Sparkles, AlertCircle, ArrowRight, GraduationCap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError(err?.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = () => {
    setEmail("faculty@optiteach.edu");
    setPassword("admin123");
    setError(null);
  };

  return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }} className="animate-fade-in">
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "36px 32px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--brand-start), var(--brand-mid))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              boxShadow: "var(--shadow-glow-brand)",
            }}
          >
            <GraduationCap size={28} color="white" />
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>
            Faculty Portal Login
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Sign in to manage syllabi, run time optimization, and access the presenter mode.
          </p>
        </div>

        {/* Demo Account Callout */}
        <div
          style={{
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px dashed rgba(99, 102, 241, 0.3)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--accent-purple)", display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} /> Demo Faculty Account
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>faculty@optiteach.edu / admin123</div>
          </div>
          <button
            type="button"
            onClick={handleDemoFill}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.75rem" }}
          >
            Auto Fill
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--accent-rose)",
              fontSize: "0.875rem",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: 8, color: "var(--text-secondary)" }}>
              Academic Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="email"
                placeholder="faculty@optiteach.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-text"
                style={{ width: "100%", paddingLeft: 42 }}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: 8, color: "var(--text-secondary)" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Key
                size={16}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-text"
                style={{ width: "100%", paddingLeft: 42 }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "0.9375rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <LogIn size={18} /> Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Don't have a faculty account yet?{" "}
          <Link href="/register" style={{ color: "var(--brand-end)", fontWeight: 600, textDecoration: "none" }}>
            Register here <ArrowRight size={12} style={{ display: "inline" }} />
          </Link>
        </div>
      </div>
    </div>
  );
}
