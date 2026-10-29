"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { DashboardSession } from "@/lib/dashboard-session";
import styles from "./dashboard.module.css";
export type Attempt = { body: string; key: string; uncertain: boolean };
type Context = {
  session: DashboardSession;
  localSimulation: boolean;
  attempts: Map<string, Attempt>;
};
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const DashboardContext = createContext<Context | null>(null);
export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("Dashboard session required");
  return value;
}
export function DashboardProvider({
  apiBase,
  localSimulation,
  children,
}: {
  apiBase: string;
  localSimulation: boolean;
  children: ReactNode;
}) {
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempts] = useState(() => new Map<string, Attempt>());
  const [session] = useState(
    () =>
      new DashboardSession(apiBase, () => {
        setSignedIn(false);
        attempts.clear();
        setError("Your session ended. Sign in again.");
      }),
  );
  const loginGeneration = useRef(0);
  useEffect(
    () => () => {
      session.clear();
    },
    [session],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ([...attempts.values()].some((a) => a.uncertain))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [attempts]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const generation = ++loginGeneration.current;
    setBusy(true);
    setError("");
    try {
      await session.login(
        String(data.get("email")),
        String(data.get("password")),
      );
      if (generation === loginGeneration.current) {
        form.reset();
        setSignedIn(true);
      }
    } catch (e) {
      if (generation === loginGeneration.current)
        setError(e instanceof Error ? e.message : "Sign-in unavailable.");
    } finally {
      if (generation === loginGeneration.current) setBusy(false);
    }
  }
  async function logout() {
    loginGeneration.current++;
    setSignedIn(false);
    attempts.clear();
    setError("");
    try {
      await session.logout();
    } catch {
      setError(
        "This page is cleared. Server sign-out could not be confirmed; sign in again to replace your session.",
      );
    }
  }
  return (
    <div className={`container ${styles.root}`}>
      <header className={styles.heading}>
        <div>
          <p className="eyebrow">Member area</p>
          <h1>Member dashboard</h1>
        </div>
        {signedIn && (
          <button className={styles.secondary} onClick={logout}>
            Sign out
          </button>
        )}
      </header>
      {!signedIn ? (
        <section className={styles.panel} aria-labelledby="sign-in-heading">
          <h2 id="sign-in-heading">Sign in to your dashboard</h2>
          <p>
            Your session stays in memory. Reloading this page requires sign-in
            again.
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <form
            method="post"
            onSubmit={login}
            className={styles.form}
            aria-busy={busy}
          >
            <label htmlFor="dashboard-email">Email</label>
            <input
              id="dashboard-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              disabled={busy || !interactive}
            />
            <label htmlFor="dashboard-password">Password</label>
            <input
              id="dashboard-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              disabled={busy || !interactive}
            />
            <button disabled={busy || !interactive}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      ) : (
        <DashboardContext.Provider
          value={{ session, localSimulation, attempts: attempts }}
        >
          <nav aria-label="Member navigation">
            <Link href="/dashboard">Dashboard overview</Link>
            {" · "}
            <Link href="/dashboard/loans">Loans and applications</Link>
          </nav>
          {children}
        </DashboardContext.Provider>
      )}
    </div>
  );
}
