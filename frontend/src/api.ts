const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:4000";

export const uploadFile = async (endpoint: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const fetchFilters = async () => {
  const response = await fetch(`${API_BASE}/filters`);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`fetchFilters failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const fetchPrimasReport = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/report/primas?${query}`);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`fetchPrimasReport failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const fetchGastosReport = async (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/report/gastos?${query}`);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`fetchGastosReport failed (${response.status}): ${text}`);
  }

  return response.json();
};
