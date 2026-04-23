'use client';

const BASE = '/api';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export const api = {
  get:    <T>(path: string)                  => apiFetch<T>(path),
  post:   <T>(path: string, body: unknown)   => apiFetch<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)   => apiFetch<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => apiFetch<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
};

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginRequest(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data as { token: string; user: { id: string; email: string; name: string; role: string; tenantId: string } };
}

export async function logoutRequest() {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
}
