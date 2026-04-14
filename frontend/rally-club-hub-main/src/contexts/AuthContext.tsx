import React, { createContext, useContext, useEffect, useState } from "react";
import { auth as authApi } from "@/lib/api";

type AppRole = "admin" | "coach" | "player" | "parent";

interface UserData {
  id: number;
  full_name: string;
  email: string;
  role: AppRole;
  is_active?: boolean;
}

interface AuthContextType {
  user: UserData | null;
  role: AppRole | null;
  profile: UserData | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authApi.me();
      setUser(res.data as UserData);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUser();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user as UserData);
  };

  const signOut = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem("token");
    setUser(null);
  };

  const role = user?.role ?? null;
  const profile = user;

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
