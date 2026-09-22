import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseRow, PremiumRow } from "./types.js";
import { allRows, databaseError, HttpError } from "./supabase.js";

export async function getClient(db: SupabaseClient, name: string) {
  if (!name) throw new HttpError(400, "Selecciona un cliente.");
  const { data, error } = await db.from("clients").select("id,name").eq("name", name).maybeSingle();
  databaseError(error);
  if (!data) throw new HttpError(403, "No tienes acceso a este cliente.");
  return data;
}
export async function getRows<T extends PremiumRow | ExpenseRow>(db: SupabaseClient, clientId: string, kind: "primas" | "gastos"): Promise<T[]> {
  const { data, error } = await db.from("client_datasets").select("rows")
    .eq("client_id", clientId).eq("kind", kind).maybeSingle();
  databaseError(error);
  return (data?.rows ?? []) as T[];
}
export async function saveRows(db: SupabaseClient, kind: "primas" | "gastos", rows: PremiumRow[] | ExpenseRow[]) {
  if (!rows.length) throw new HttpError(400, "El archivo no contiene filas válidas.");
  if (Buffer.byteLength(JSON.stringify(rows)) > 25 * 1024 * 1024) {
    throw new HttpError(413, "La sábana procesada supera 25 MB. Divide el archivo por cliente.");
  }
  const { error } = await db.rpc("import_client_dataset", { dataset_kind: kind, dataset_rows: rows });
  databaseError(error);
}
export async function getFilters(db: SupabaseClient) {
  const clients = await allRows(db, "clients", "id,name", "id");
  const datasets = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("client_datasets").select("client_id,kind,periods,coverages")
      .order("client_id").order("kind").range(offset, offset + 499);
    databaseError(error);
    datasets.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const coveragesByClient: Record<string, string[]> = Object.create(null);
  const periodsByClient: Record<string, string[]> = Object.create(null);
  for (const client of clients) {
    const own = datasets.filter(row => row.client_id === client.id);
    const coverages = new Set<string>(own.filter(row => row.kind === "primas").flatMap(row => row.coverages));
    if (["Salud", "Dental", "Catastrófico"].some(coverage => coverages.has(coverage))) coverages.add("Consolidado S+D+C");
    coveragesByClient[client.name] = [...coverages].sort();
    periodsByClient[client.name] = [...new Set<string>(own.flatMap(row => row.periods))].sort();
  }
  return { clients: clients.map(row => row.name as string).sort(), coveragesByClient, periodsByClient };
}
