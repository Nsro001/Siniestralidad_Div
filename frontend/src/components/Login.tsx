import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError("No pudimos iniciar sesión. Revisa tu correo y contraseña o contacta al administrador.");
    } catch { setError("No se pudo conectar. Intenta nuevamente."); }
    finally { setBusy(false); }
  }
  return (
    <main className="account-ui login-page">
      <section className="glass-panel login-card">
        <p className="account-eyebrow">Siniestralidad · Acceso privado</p>
        <h1 className="font-display text-3xl mt-3">Bienvenido</h1>
        <p className="account-muted mt-3">Ingresa para consultar los reportes de tus clientes.</p>
        <form onSubmit={submit} className="account-form mt-6">
          <label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} /></label>
          {error && <p role="alert" className="account-error">{error}</p>}
          <button className="account-primary" disabled={busy || !supabase}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
        </form>
        <p className="account-muted text-sm mt-6">Tu administrador gestiona tu cuenta y los clientes que puedes consultar.</p>
        {!supabase && <p role="alert" className="account-error mt-3">El acceso aún no está configurado. Contacta al administrador.</p>}
      </section>
    </main>
  );
}
