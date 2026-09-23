"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  Zap,
  FileText,
  Database,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MonitorPlay,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/upload", label: "Syllabus Upload", icon: Upload },
  { href: "/optimization", label: "Optimization", icon: Zap },
  { href: "/lesson-plans", label: "Lesson Plans", icon: FileText },
  { href: "/presenter", label: "Live Presenter", icon: MonitorPlay },
  { href: "/dbms", label: "DBMS Insights", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <aside
      className="sidebar"
      style={{
        width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)",
        minHeight: "100vh",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        transition: "width var(--transition-base)",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? "20px 16px" : "20px 24px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 72,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--brand-start), var(--brand-mid))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <GraduationCap size={20} color="white" />
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
              className="gradient-text"
            >
              OptiTeach
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 500 }}>
              Intelligent Teaching Platform
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "12px 16px" : "10px 16px",
                borderRadius: "var(--radius-md)",
                fontSize: "0.875rem",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
                borderLeft: isActive ? "3px solid var(--brand-start)" : "3px solid transparent",
                textDecoration: "none",
                transition: "all var(--transition-fast)",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={20}
                style={{
                  color: isActive ? "var(--brand-start)" : "var(--text-muted)",
                  flexShrink: 0,
                  transition: "color var(--transition-fast)",
                }}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Faculty Auth & Profile */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border-default)" }}>
        {isAuthenticated && user ? (
          <div
            style={{
              padding: collapsed ? "8px" : "10px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-full)",
                  background: "linear-gradient(135deg, var(--accent-blue), var(--brand-mid))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  flexShrink: 0,
                }}
              >
                {user.full_name?.charAt(0) || "F"}
              </div>
              {!collapsed && (
                <div style={{ overflow: "hidden", lineHeight: 1.2 }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {user.full_name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {user.designation || user.department || "Faculty"}
                  </div>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                onClick={logout}
                title="Sign Out"
                className="btn-ghost"
                style={{
                  padding: "6px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 10,
              padding: collapsed ? "10px" : "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "var(--brand-end)",
              textDecoration: "none",
              fontSize: "0.8125rem",
              fontWeight: 600,
              marginBottom: 8,
              transition: "all var(--transition-fast)",
            }}
          >
            <LogIn size={16} />
            {!collapsed && <span>Faculty Sign In</span>}
          </Link>
        )}

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn-ghost"
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            transition: "all var(--transition-fast)",
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
