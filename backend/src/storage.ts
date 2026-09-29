import { randomUUID } from "node:crypto";
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
export async function saveRows(db: SupabaseClient, kind: "primas" | "gastos", rows: PremiumRow[] | ExpenseRow[], replaceAll = false) {
  if (!rows.length) throw new HttpError(400, "El archivo no contiene filas válidas.");
  // Máximo 500 filas y 512 KiB JSON por solicitud; margen para el formato jsonb.
  const chunks: (PremiumRow | ExpenseRow)[][] = [];
  let chunk: (PremiumRow | ExpenseRow)[] = [], bytes = 2, totalBytes = 1;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    // Contar por fila evita crear otra cadena con toda la sábana para medirla.
    totalBytes += size;
    if (totalBytes > 25 * 1024 * 1024) {
      throw new HttpError(413, "La sábana procesada supera 25 MB. Divide el archivo por cliente.");
    }
    if (size > 512 * 1024 - 2) throw new HttpError(413, "Una fila supera el tamaño permitido.");
    if (chunk.length && (chunk.length >= 500 || bytes + size > 512 * 1024)) {
      chunks.push(chunk); chunk = []; bytes = 2;
    }
    chunk.push(row); bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  const uploadId = randomUUID();
  const rpc = async (name: string, args: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt++) {
      let result;
      try { result = await db.rpc(name, args); }
      catch {
        result = { error: { code: "NETWORK" } };
      }
      const error = result.error;
      if (!error) return;
      if (error.code === "PGRST202") throw new HttpError(503,
        "Falta ejecutar la migración 202609290001_chunked_dataset_upload.sql en Supabase.");
      const transient = !error.code || ["NETWORK", "57014", "40001", "40P01", "08006", "PGRST000", "PGRST001", "PGRST002"].includes(error.code);
      if (!transient || attempt >= 2) {
        if (error.code === "42501") databaseError(error);
        throw new HttpError(503, "No se pudo confirmar la carga. Los datos publicados se conservan hasta completar todos los chunks. Puedes reintentar el archivo.");
      }
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  };
  await rpc("begin_dataset_upload", { upload_id: uploadId, dataset_kind: kind, replace_all: replaceAll,
    expected_chunks: chunks.length, expected_rows: rows.length });
  for (const [index, rows] of chunks.entries()) {
    await rpc("append_dataset_upload_chunk", { upload_id: uploadId, chunk_index: index, chunk_rows: rows });
  }
  await rpc("finish_dataset_upload", { upload_id: uploadId });
}
export async function getFilters(db: SupabaseClient) {
  const clients = await allRows(db, "clients", "id,name", "id");
  const datasets: { client_id: string; kind: string; periods: string[]; coverages: string[] }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("client_datasets").select("client_id,kind,periods,coverages")
      .order("client_id").order("kind").range(offset, offset + 499);
    databaseError(error);
    datasets.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const coveragesByClient: Record<string, string[]> = Object.create(null);
  const periodsByClient: Record<string, string[]> = Object.create(null);
  const activeClients = clients.filter(client => datasets.some(row => row.client_id === client.id));
  for (const client of activeClients) {
    const own = datasets.filter(row => row.client_id === client.id);
    const coverages = new Set<string>(own.filter(row => row.kind === "primas").flatMap(row => row.coverages));
    if (["Salud", "Dental", "Catastrófico"].some(coverage => coverages.has(coverage))) coverages.add("Consolidado S+D+C");
    coveragesByClient[client.name] = [...coverages].sort();
    periodsByClient[client.name] = [...new Set<string>(own.flatMap(row => row.periods))].sort();
  }
  return { clients: activeClients.map(row => row.name as string).sort(), coveragesByClient, periodsByClient };
}
