import { useEffect, useState, type FormEvent } from "react";
import { createAccount, fetchAccounts, updateAccount } from "../api";
import type { AdminAccounts as Accounts, AccountProfile } from "../types";

export default function AdminAccounts() {
  const [data, setData] = useState<Accounts | null>(null);
  const [selected, setSelected] = useState<AccountProfile | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"executive" | "manager">("executive");
  const [sourceName, setSourceName] = useState("");
  const [active, setActive] = useState(true);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const message = (err: unknown) => err instanceof Error ? err.message : "No se pudo completar la operación.";
  useEffect(() => {
    let cancelled = false;
    fetchAccounts().then(value => { if (!cancelled) setData(value); })
      .catch(err => { if (!cancelled) setError(message(err)); });
    return () => { cancelled = true; };
  }, []);
  function choose(user: AccountProfile, accounts = data) {
    setRole(user.role === "manager" ? "manager" : "executive"); setSourceName(user.portfolio_name ?? "");
    setSelected(user); setName(user.full_name); setActive(user.active); setSearch("");
    setClientIds(accounts?.assignments.filter(a => a.user_id === user.id).map(a => a.client_id) ?? []);
    setError(""); setNotice("");
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setCreating(true); setError(""); setNotice("");
    try {
      const result = await createAccount({ email, password, full_name: newName });
      setPassword(""); setEmail(""); setNewName("");
      const accounts = await fetchAccounts(); setData(accounts);
      const user = accounts.users.find(u => u.id === result.id);
      if (user) choose(user, accounts);
      setNotice("Cuenta creada. Selecciona sus clientes y guarda la asignación.");
    } catch (err) { setError(message(err)); }
    finally { setCreating(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await updateAccount(selected.id, { full_name: name, active, client_ids: clientIds, role, portfolio_name: sourceName });
      const accounts = await fetchAccounts(); setData(accounts);
      const user = accounts.users.find(u => u.id === selected.id);
      if (user) choose(user, accounts);
      setNotice("Cuenta y asignaciones guardadas.");
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  return (
    <main className="account-ui accounts-page no-print">
      <p className="account-eyebrow">Administración</p>
      <h1 className="font-display text-3xl mt-2">Usuarios y clientes</h1>
      <p className="account-muted mt-3">Crea cuentas de KAM y jefes. Vincúlalas al nombre correspondiente en la sábana para dar acceso a su cartera.</p>
      {error && <p role="alert" className="account-error mt-4">{error}</p>}
      {notice && <p role="status" className="account-success mt-4">{notice}</p>}
      <div className="accounts-grid mt-6">
        <section className="glass-panel account-card">
          <h2 className="font-display text-xl">Crear cuenta</h2>
          <form className="account-form mt-4" onSubmit={create}>
            <label>Nombre<input required maxLength={120} value={newName} onChange={e => setNewName(e.target.value)} autoComplete="off" /></label>
            <label>Correo<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
            <label>Contraseña inicial<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <p className="account-muted text-sm">Mínimo 12 caracteres. El ejecutivo podrá cambiarla al ingresar. La aplicación no envía correos de bienvenida.</p>
            <button className="account-primary" disabled={creating || busy}>{creating ? "Creando…" : "Crear cuenta"}</button>
          </form>
        </section>
        <section className="glass-panel account-card">
          <h2 className="font-display text-xl">Configurar cuenta y cartera</h2>
          {!data ? <p className="mt-4">{error ? "No se pudieron cargar las cuentas." : "Cargando cuentas…"}</p> : <>
            <label className="account-form mt-4">Cuenta
              <select value={selected?.id ?? ""} disabled={busy || creating} onChange={e => {
                const user = data.users.find(u => u.id === e.target.value); if (user) choose(user); else setSelected(null);
              }}>
                <option value="">Selecciona una cuenta</option>
                {data.users.filter(u => u.role !== "admin").map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}{u.active ? "" : " (desactivado)"}</option>)}
              </select>
            </label>
            {!data.users.some(u => u.role !== "admin") && <p className="account-muted mt-4">Todavía no hay ejecutivos. Crea la primera cuenta.</p>}
            {selected && <form className="account-form mt-4" onSubmit={save}>
              <p className="account-muted text-sm">{selected.email}</p>
              <label>Nombre<input value={name} required maxLength={120} onChange={e => setName(e.target.value)} /></label>
              <label>Rol<select value={role} onChange={e => { setRole(e.target.value as "executive" | "manager"); setSourceName(""); }}><option value="executive">KAM</option><option value="manager">Jefe</option></select></label>
              <label>Nombre en la columna {role === "manager" ? "Jefe" : "KAM"} del Excel
                <input list="portfolio-names" maxLength={120} value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="Nombre exacto de la sábana" />
                <datalist id="portfolio-names">{[...new Set(data.clients.map(c => role === "manager" ? c.manager_name : c.kam_name).filter(Boolean))].map(value => <option key={value} value={value!} />)}</datalist>
              </label>
              <p className="account-muted text-sm">{role === "manager" ? "El jefe verá todos los clientes que tengan este jefe en la última sábana, con filtro por KAM." : "El KAM verá los clientes que lleven este nombre en la última sábana, además de las asignaciones manuales."}</p>
              <label className="account-checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Cuenta activa</label>
              <p className="account-muted text-sm">Desactivarla bloquea el acceso a todos sus reportes.</p>
              <label>Buscar cliente<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
              {role === "executive" && <fieldset className="client-checklist"><legend>Clientes asignados ({clientIds.length})</legend>
                {data.clients.filter(c => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => (
                  <label className="account-checkbox" key={c.id}><input type="checkbox" checked={clientIds.includes(c.id)} onChange={e => setClientIds(previous => e.target.checked ? [...previous, c.id] : previous.filter(id => id !== c.id))} />{c.name}</label>
                ))}
                {!data.clients.length && <p className="account-muted text-sm">Carga las sábanas desde Reportes para registrar los clientes.</p>}
              </fieldset>}
              <button className="account-primary" disabled={busy || creating}>{busy ? "Guardando…" : "Guardar cuenta y clientes"}</button>
            </form>}
          </>}
        </section>
      </div>
    </main>
  );
}
