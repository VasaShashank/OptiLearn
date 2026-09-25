"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { useSession } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login"];

/**
 * Client-side route guard. The API is the real enforcement point (every route checks the
 * bearer token); this only keeps signed-out visitors on the login page.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useSession();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (ready && !user && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, isPublic, pathname, router]);

  if (isPublic) {
    return <main style={{ flex: 1, minHeight: "100vh" }}>{children}</main>;
  }

  if (!ready || !user) {
    return (
      <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" aria-label="Loading" />
      </main>
    );
  }

  return (
    <>
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0, // flex items default to min-width:auto; wide content (ER diagram, tables) must scroll, not widen the page
          marginLeft: "var(--sidebar-width)",
          minHeight: "100vh",
          transition: "margin-left var(--transition-base)",
        }}
      >
        <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>{children}</div>
      </main>
    </>
  );
}
