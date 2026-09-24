"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    return (
      <main style={{ flex: 1, minHeight: "100vh", width: "100%" }}>
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-width)",
          minHeight: "100vh",
          transition: "margin-left var(--transition-base)",
        }}
      >
        <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </>
  );
}
