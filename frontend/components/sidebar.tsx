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
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/upload", label: "Syllabus Upload", icon: Upload },
  { href: "/optimization", label: "Optimization", icon: Zap },
  { href: "/lesson-plans", label: "Lesson Plans", icon: FileText },
  { href: "/dbms", label: "DBMS Insights", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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

      {/* Collapse Toggle */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border-default)" }}>
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
