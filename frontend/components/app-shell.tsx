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
      <main className="app-main">
        <div className="app-main__inner">{children}</div>
      </main>
    </>
  );
}
