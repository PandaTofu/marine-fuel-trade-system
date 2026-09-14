import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { User } from "./api";
import i18n from "./i18n";
const Context = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({
  user: null,
  setUser: () => {},
  loading: true,
  error: "",
  refresh: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = async () => {
    setError("");
    try {
      const u = await api<User>("auth/me/");
      setUser(u);
      await i18n.changeLanguage(u.language);
    } catch (e) {
      if (
        (e as { status?: number }).status !== 403 &&
        (e as { status?: number }).status !== 401
      )
        setError((e as Error).message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const end = () => setUser(null);
    window.addEventListener("session-ended", end);
    return () => window.removeEventListener("session-ended", end);
  }, []);
  useEffect(() => {
    if (!user) return;
    let last = Date.now(),
      sent = 0;
    const active = () => {
      const now = Date.now();
      if (now - last >= 1800000) {
        setUser(null);
        return;
      }
      last = now;
      if (now - sent > 60000) {
        sent = now;
        void api("auth/activity/", "POST").catch(() => {});
      }
    };
    const timer = window.setInterval(() => {
      if (Date.now() - last >= 1800000) setUser(null);
    }, 1000);
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((e) => window.addEventListener(e, active));
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, active));
    };
  }, [user?.id]);
  return (
    <Context.Provider
      value={{
        user,
        setUser: (next) => {
          setUser(next);
          if (next) setError("");
        },
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
