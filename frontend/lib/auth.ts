"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  user_id: string;
  email: string;
  full_name: string;
  role: "teacher" | "admin" | string;
}

interface StoredSession extends SessionUser {
  access_token: string;
}

const STORAGE_KEY = "optiteach_session";
const listeners = new Set<() => void>();

function read(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null; // storage unavailable (private mode, blocked) or corrupt
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return read()?.access_token ?? null;
}

export function saveSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* session then lasts only for this page load */
  }
  listeners.forEach((fn) => fn());
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

/** Current user (null when signed out); `ready` is false until storage has been read. */
export function useSession(): { user: SessionUser | null; ready: boolean } {
  const [state, setState] = useState<{ user: SessionUser | null; ready: boolean }>({ user: null, ready: false });

  useEffect(() => {
    const sync = () => {
      const s = read();
      setState({
        user: s ? { user_id: s.user_id, email: s.email, full_name: s.full_name, role: s.role } : null,
        ready: true,
      });
    };
    sync();
    listeners.add(sync);
    window.addEventListener("storage", sync); // sign-out in another tab
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
}
