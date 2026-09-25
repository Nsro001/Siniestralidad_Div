import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import PortfolioDashboard from "./components/PortfolioDashboard";
import Login from "./components/Login";
import AdminAccounts from "./components/AdminAccounts";
import { supabase } from "./lib/supabase";
import { fetchMe } from "./api";
import type { AccountProfile } from "./types";

export default function AuthApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [issue, setIssue] = useState("");
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"dashboard" | "reports" | "admin" | "password">("dashboard");
  const [reportClient, setReportClient] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!supabase) { setInitializing(false); return; }
    // La suscripción emite INITIAL_SESSION; el callback no hace llamadas async al SDK.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setInitializing(false);
      if (!next) { setProfile(null); setIssue(""); setView("dashboard"); setReportClient(""); setPassword(""); setConfirmation(""); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const refresh = () => fetchMe().then(value => {
      if (!cancelled) { setProfile(value); setIssue(""); }
    }).catch(err => {
      if (!cancelled) { setProfile(null); setIssue(err instanceof Error ? err.message : "No se pudo verificar el acceso."); }
    });
    void refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    const expired = () => { setProfile(null); setIssue("La sesión expiró. Sal y vuelve a ingresar."); };
    window.addEventListener("session-expired", expired);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("session-expired", expired); };
  }, [session?.user.id, session?.access_token, retry]);
  async function logout() {
    setProfile(null);
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) setIssue("No se pudo cerrar la sesión. Intenta nuevamente.");
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordNotice("");
    if (password !== confirmation) { setPasswordNotice("Las contraseñas no coinciden."); return; }
    setSaving(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      setPasswordNotice(error ? "No se pudo cambiar la contraseña. Revisa la política de contraseñas o vuelve a iniciar sesión." : "Contraseña actualizada.");
      if (!error) { setPassword(""); setConfirmation(""); }
    } catch { setPasswordNotice("No se pudo conectar. Intenta nuevamente."); }
    finally { setSaving(false); }
  }
  if (initializing) return <main className="account-ui login-page" role="status">Cargando sesión…</main>;
  if (!session) return <Login />;
  if (!profile || profile.id !== session.user.id) return <main className="account-ui login-page"><section className="glass-panel login-card">
    <p role={issue ? "alert" : "status"}>{issue || "Verificando tu cuenta…"}</p>
    {issue && <button className="account-primary mt-4" onClick={() => { setIssue(""); setRetry(value => value + 1); }}>Reintentar conexión</button>}
    <button className="account-secondary mt-4" onClick={logout}>Salir</button>
  </section></main>;
  return <>
    <header className="account-ui account-bar no-print">
      <div><strong>{profile.full_name || profile.email}</strong><p className="account-muted text-sm">{profile.role === "admin" ? "Administrador" : profile.role === "manager" ? "Jefe" : "KAM"}</p></div>
      <nav aria-label="Cuenta" className="account-nav">
        <button aria-current={view === "dashboard" ? "page" : undefined} onClick={() => setView("dashboard")}>Inicio</button>
        <button aria-current={view === "reports" ? "page" : undefined} onClick={() => setView("reports")}>Reportes</button>
        {profile.role === "admin" && <button aria-current={view === "admin" ? "page" : undefined} onClick={() => setView("admin")}>Usuarios y clientes</button>}
        <button aria-current={view === "password" ? "page" : undefined} onClick={() => { setView("password"); setPasswordNotice(""); }}>Mi contraseña</button>
        <button onClick={logout}>Cerrar sesión</button>
      </nav>
    </header>
    {view === "dashboard" ? <PortfolioDashboard profile={profile} onOpenClient={name => { setReportClient(name); setView("reports"); }} /> : view === "admin" && profile.role === "admin" ? <AdminAccounts /> : view === "password" ?
      <main className="account-ui accounts-page no-print"><section className="glass-panel account-card max-w-lg">
        <h1 className="font-display text-2xl">Cambiar contraseña</h1>
        <form className="account-form mt-4" onSubmit={changePassword}>
          <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Repite la contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
          <button className="account-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar contraseña"}</button>
          {passwordNotice && <p role="status">{passwordNotice}</p>}
        </form>
      </section></main> : <App key={`${profile.id}-${reportClient}`} profile={profile} initialClient={reportClient} />}
  </>;
}
