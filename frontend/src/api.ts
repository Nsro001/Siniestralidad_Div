import { supabase } from "./lib/supabase";
import type { AccountProfile, AdminAccounts, FiltersResponse, Portfolio } from "./types";

const API_BASE = import.meta.env.DEV ? "/api" : import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request(path: string, init: RequestInit = {}, binary = false) {
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
  if (response.ok && binary) return response.blob();
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
export const downloadGastos = (params: Record<string, string>): Promise<Blob> => request(withQuery("/report/gastos/download", params), {}, true);
export const fetchClaimantsReport = (params: Record<string, string>) => request(withQuery("/report/claimants", params));
export const fetchMe = (): Promise<AccountProfile> => request("/me");
export const fetchAccounts = (): Promise<AdminAccounts> => request("/admin/users");
export const createAccount = (values: { email: string; password: string; full_name: string }) =>
  request("/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
export const updateAccount = (id: string, values: { full_name: string; active: boolean; client_ids: string[]; role: "executive" | "manager"; portfolio_name: string }) =>
  request(`/admin/users/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });

export const fetchPortfolio = (): Promise<Portfolio> => request("/portfolio");

export const fetchMonthlyDetail = (params: { client: string; coverage: string; period: string }): Promise<import("../../shared/monthly").MonthlyDetail> => request(withQuery("/report/monthly", params));

export const fetchConclusion = (params: Record<string, string>): Promise<import("../../shared/executive").ExecutiveConclusion> => request(withQuery("/report/conclusion", params));
export const fetchBranding = (client: string): Promise<import("../../shared/executive").ReportBranding> => request(withQuery("/report/branding", { client }));
export const saveBranding = (client: string, values: Omit<import("../../shared/executive").ReportBranding, "kam_name">) => request(withQuery("/admin/report-branding", { client }), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });

const manage = "/portfolio/manage";
export const fetchManagedClients = (): Promise<{clients: import("../../shared/portfolio").ManagedClient[]}> => request(`${manage}/clients`);
export const fetchClientDetail = (id: string): Promise<import("../../shared/portfolio").PortfolioDetail> => request(`${manage}/clients/${encodeURIComponent(id)}`);
const post = (path:string,body:unknown) => request(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
export const saveManagedClient = (body:unknown): Promise<{id:string}> => post(`${manage}/clients`,body);
export const saveManagedPolicy = (clientId:string,body:unknown) => post(`${manage}/clients/${encodeURIComponent(clientId)}/policies`,body);
export const fetchUnassignedDocuments = ():Promise<{documents:import("../../shared/portfolio").PolicyDocument[]}> => request(`${manage}/documents`);
export const uploadPolicyDocument = (file:File,clientId:string):Promise<{id:string;duplicate:boolean}> => {
  const form=new FormData();form.append("file",file);if(clientId)form.append("clientId",clientId);
  return request(`${manage}/documents`,{method:"POST",body:form});
};
export const fetchPolicyDocument = (id:string):Promise<import("../../shared/portfolio").PolicyDocument> => request(`${manage}/documents/${encodeURIComponent(id)}`);
export const extractPolicyDocument = (id:string,forceOcr=false,password="") => post(`${manage}/documents/${encodeURIComponent(id)}/extract`,{forceOcr,password});
export const assignPolicyDocument = (id:string,clientId:string) => post(`${manage}/documents/${encodeURIComponent(id)}/assign`,{clientId});
export const openPolicyOriginal = (id:string):Promise<{url:string}> => request(`${manage}/documents/${encodeURIComponent(id)}/original`);
export const fetchSnapshot = (id:string,offset:number):Promise<{id:string; rows:Record<string,unknown>[]; total:number; offset:number;links:import("../../shared/portfolio").RowLink[]}> => request(`${manage}/snapshots/${encodeURIComponent(id)}?offset=${offset}`);
export const saveRowLink = (body:unknown) => post(`${manage}/links`,body);
export const removeRowLink = (body:unknown) => post(`${manage}/links/remove`,body);
export const savePremiumMovement = (body:unknown) => post(`${manage}/movements`,body);
export const fetchPolicyIndicators = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery):Promise<import('./lib/technicalTypes').PolicyIndicators> => request(withQuery(`/report/policies/${encodeURIComponent(policyId)}/monthly`,query));
export const calculatePolicyRenewal = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery,scenarios:unknown[]):Promise<import('./lib/technicalTypes').RenewalResults> => post(withQuery(`/report/policies/${encodeURIComponent(policyId)}/renewal-scenarios`,query),{scenarios});
export const fetchTechnicalReviews = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery):Promise<{reviews:import('../../shared/technicalReview').TechnicalReview[];reviewStorageAvailable:boolean}> => request(withQuery(`/report/policies/${encodeURIComponent(policyId)}/reviews`,query));
export const saveTechnicalReview = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery,body:unknown) => post(withQuery(`/report/policies/${encodeURIComponent(policyId)}/reviews`,query),body);
export const requestPolicyAnalysis = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery,kind:'monthly'|'conclusions'):Promise<import('../../shared/analysis').PolicyAnalysis> => post(withQuery(`/report/policies/${encodeURIComponent(policyId)}/analysis/${kind}`,query),{});
export const readPolicyAnalysis = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery,kind:'monthly'|'conclusions'):Promise<import('../../shared/analysis').PolicyAnalysis> => request(withQuery(`/report/policies/${encodeURIComponent(policyId)}/analysis/${kind}`,query));

export const readPolicyAnalysisExport = (policyId:string,query:import('./lib/technicalTypes').ScopeQuery,month?:string):Promise<{analysis:import('../../shared/analysis').PolicyAnalysis;monthly:import('../../shared/analysis').PolicyAnalysis|null;indicators:import('./lib/technicalTypes').PolicyIndicators}> => request(withQuery(`/report/policies/${encodeURIComponent(policyId)}/analysis/export`,{...query,...(month?{month}:{})}));

export const previewPolicyPage = (id:string,page:number,password=""):Promise<Blob> => request(`${manage}/documents/${encodeURIComponent(id)}/pages/${page}/preview`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})},true);
