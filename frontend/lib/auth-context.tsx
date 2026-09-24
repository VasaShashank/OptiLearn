"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "@/lib/api";
import type { AuthUser, LoginResponse } from "@/lib/types";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (data: {
    email: string;
    password: string;
    full_name: string;
    department: string;
    employee_id: string;
    designation?: string;
  }) => Promise<LoginResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,
  login: async () => {
    throw new Error("AuthProvider not mounted");
  },
  register: async () => {
    throw new Error("AuthProvider not mounted");
  },
  logout: () => {},
});

const TOKEN_KEY = "optilearn_token";
const USER_KEY = "optilearn_user";

function setAuthCookie(token: string) {
  if (typeof document !== "undefined") {
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  }
}

function clearAuthCookie() {
  if (typeof document !== "undefined") {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read from localStorage on mount
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken) {
        setToken(storedToken);
        setAuthCookie(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            // invalid json
          }
        }
        // Verify with /auth/me
        authAPI
          .getMe()
          .then((verifiedUser) => {
            setUser(verifiedUser);
            localStorage.setItem(USER_KEY, JSON.stringify(verifiedUser));
          })
          .catch(() => {
            // Token might be expired or backend offline; keep storedUser for offline dev
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    setLoading(true);
    try {
      const res = await authAPI.login(email, password);
      setToken(res.access_token);
      localStorage.setItem(TOKEN_KEY, res.access_token);

      const authUser: AuthUser = {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
        role: res.role,
        department: res.department || "Computer Science",
        designation: res.designation || "Assistant Professor",
        employee_id: res.employee_id || "FAC-CS-001",
      };

      setUser(authUser);
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      setAuthCookie(res.access_token);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    full_name: string;
    department: string;
    employee_id: string;
    designation?: string;
  }): Promise<LoginResponse> => {
    setLoading(true);
    try {
      const res = await authAPI.register(data);
      setToken(res.access_token);
      localStorage.setItem(TOKEN_KEY, res.access_token);

      const authUser: AuthUser = {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
        role: res.role,
        department: data.department,
        designation: data.designation || "Assistant Professor",
        employee_id: data.employee_id,
      };

      setUser(authUser);
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      setAuthCookie(res.access_token);
      return res;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearAuthCookie();
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
