const API_BASE = "http://localhost:4000";

export const uploadFile = async (endpoint: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: form,
  });
  return response.json();
};

export const fetchFilters = async () => {
  const response = await fetch(`${API_BASE}/filters`);
  return response.json();
};

export const fetchPrimasReport = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/report/primas?${query}`);
  return response.json();
};

export const fetchGastosReport = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/report/gastos?${query}`);
  return response.json();
};
