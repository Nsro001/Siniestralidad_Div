import { supabase } from "./lib/supabase";
import type { AccountProfile, AdminAccounts, FiltersResponse, Portfolio } from "./types";

const API_BASE = import.meta.env.DEV ? "/api" : import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request(path: string, init: RequestInit = {}) {
  if (!supabase) throw new Error("El acceso aún no está configurado.");
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new ApiError(401, "Inicia sesión para continuar.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Comprueba que el backend esté activo y vuelve a intentar. Si estabas cargando una sábana, verifica si se guardó antes de repetir la carga.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(response.status, body?.error ?? "No se pudo completar la solicitud.");
  }
  return body;
}
export const uploadFile = async (endpoint: string, file: File, mode: "replace" | "merge" = "merge") => {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  return request(endpoint, { method: "POST", body: form });
};
export const fetchFilters = (): Promise<FiltersResponse> => request("/filters");
const withQuery = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params)}`;
export const fetchPrimasReport = (params: Record<string, string>) => request(withQuery("/report/primas", params));
export const fetchGastosReport = (params: Record<string, string>) => request(withQuery("/report/gastos", params));
export const fetchClaimantsReport = (params: Record<string, string>) => request(withQuery("/report/claimants", params));
export const fetchMe = (): Promise<AccountProfile> => request("/me");
export const fetchAccounts = (): Promise<AdminAccounts> => request("/admin/users");
export const createAccount = (values: { email: string; password: string; full_name: string }) =>
  request("/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
export const updateAccount = (id: string, values: { full_name: string; active: boolean; client_ids: string[]; role: "executive" | "manager"; portfolio_name: string }) =>
  request(`/admin/users/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });

export const fetchPortfolio = (): Promise<Portfolio> => request("/portfolio");

export const fetchMonthlyDetail = (params: { client: string; coverage: string; period: string }): Promise<import("../../shared/monthly").MonthlyDetail> => request(withQuery("/report/monthly", params));
