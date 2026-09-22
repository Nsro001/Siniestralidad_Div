import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows, databaseError } from "./supabase.js";
import type { PremiumRow } from "./types.js";

export function summarizeClient(client: { id: string; name: string; kam_name?: string; manager_name?: string }, rows: PremiumRow[], today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" })) {
  const latestPeriod = rows.reduce((latest, row) => row.period > latest ? row.period : latest, "");
  const latest = rows.filter(row => row.period === latestPeriod);
  const monthlyPremiumUf = latest.length ? latest.reduce((sum, row) => sum + row.premiumUf, 0) : null;
  // Titulares y cargas corresponden únicamente a Salud del último mes del cliente.
  const health = latest.filter(row => row.coverage.trim().toLocaleLowerCase() === "salud");
  const insured = health.map(row => ({ policy: row.policy || "Sin póliza", coverage: row.coverage,
    holders: row.holders ?? null, dependents: row.dependents ?? null }));
  const holders = health.length && health.every(row => row.holders != null) ? health.reduce((sum, row) => sum + row.holders!, 0) : null;
  const dependents = health.length && health.every(row => row.dependents != null) ? health.reduce((sum, row) => sum + row.dependents!, 0) : null;
  const firstPeriod = rows.reduce((first, row) => !first || row.period < first ? row.period : first, "");
  // Regla provisional: aniversario del mes inicial, respecto al mes actual.
  // Se incluye el mes en curso porque no se dispone del día contractual.
  const renewalMonth = firstPeriod ? firstPeriod.slice(5, 7) : null;
  const year = Number(today.slice(0, 4)) + (renewalMonth && renewalMonth < today.slice(5, 7) ? 1 : 0);
  const renewals = renewalMonth ? [`${year}-${renewalMonth}-01`] : [];
  return { id: client.id, name: client.name, kam: client.kam_name || "Sin KAM", manager: client.manager_name || "Sin jefe",
    latestPeriod: latestPeriod || null, monthlyPremiumUf, annualPremiumUf: monthlyPremiumUf === null ? null : monthlyPremiumUf * 12,
    insured, holders, dependents, firstPeriod: firstPeriod || null, renewals };
}

export async function getPortfolio(db: SupabaseClient) {
  const clients = await allRows(db, "clients", "id,name,kam_name,manager_name", "id");
  const datasets = new Map<string, PremiumRow[]>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.from("client_datasets").select("client_id,rows").eq("kind", "primas")
      .order("client_id").range(offset, offset + 99);
    databaseError(error);
    for (const dataset of data ?? []) datasets.set(dataset.client_id, dataset.rows as PremiumRow[]);
    if (!data || data.length < 100) break;
  }
  return { clients: clients.map(client => summarizeClient({ id: client.id, name: client.name,
    kam_name: client.kam_name, manager_name: client.manager_name }, datasets.get(client.id) ?? []))
    .sort((a, b) => a.name.localeCompare(b.name, "es")) };
}
