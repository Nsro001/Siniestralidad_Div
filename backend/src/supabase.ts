import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "executive" | "manager";
  portfolio_name?: string | null;
  active: boolean;
};
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function userClient(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, "El servicio de acceso aún no está configurado.");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
// Solo para crear cuentas en Auth. Todas las consultas de datos respetan RLS.
export function adminAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new HttpError(503, "La creación de cuentas aún no está configurada en el servidor.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function authenticate(token: string) {
  const db = userClient(token);
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) throw new HttpError(401, "La sesión expiró. Inicia sesión nuevamente.");
  const { data: profile, error } = await db.from("profiles")
    .select("id,email,full_name,role,active").eq("id", auth.user.id).maybeSingle();
  if (error) throw new HttpError(503, "No se pudo verificar la cuenta. Revisa la configuración del servicio.");
  if (!profile?.active) throw new HttpError(403, "Tu cuenta no está habilitada. Contacta al administrador.");
  return { db, profile: profile as Profile };
}
export function requireAdmin(profile: Profile) {
  if (profile.role !== "admin" || !profile.active) throw new HttpError(403, "Acceso exclusivo del administrador.");
}
export function databaseError(error: { code?: string } | null) {
  if (error && ["42703", "PGRST204", "PGRST202"].includes(error.code ?? "")) {
    throw new HttpError(503, "Falta actualizar la base de datos. Ejecuta la migración de cartera 202609170001_portfolio.sql en Supabase.");
  }
  if (error) throw new HttpError(error.code === "42501" ? 403 : 503,
    error.code === "42501" ? "No tienes permiso para realizar esta operación." : "No se pudo completar la operación en la base de datos.");
}
// No truncar listas por el límite de respuestas de PostgREST.
export async function allRows(db: SupabaseClient, table: string, columns: string, order: string) {
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select(columns);
    for (const column of order.split(",")) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    databaseError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
