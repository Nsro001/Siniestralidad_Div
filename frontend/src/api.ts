const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

const readJson = async (response: Response, label: string) => {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${label} failed (${response.status}): ${text}`);
  }
  return response.json();
};

export const uploadFile = async (endpoint: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}${endpoint}`, { method: "POST", body: form });
  return readJson(response, "Upload");
};

export const fetchFilters = async () =>
  readJson(await fetch(`${API_BASE}/filters`), "fetchFilters");

const withQuery = (path: string, params: Record<string, string>) =>
  `${API_BASE}${path}?${new URLSearchParams(params).toString()}`;

export const fetchPrimasReport = async (params: Record<string, string>) =>
  readJson(await fetch(withQuery("/report/primas", params)), "fetchPrimasReport");

export const fetchGastosReport = async (params: Record<string, string>) =>
  readJson(await fetch(withQuery("/report/gastos", params)), "fetchGastosReport");

export const fetchClaimantsReport = async (params: Record<string, string>) =>
  readJson(await fetch(withQuery("/report/claimants", params)), "fetchClaimantsReport");
