"use client";

import { useCallback, useEffect, useState } from "react";

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(path, { cache: "no-store" });
      const payload = await response.json() as { ok: boolean; data?: T; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "Unable to load this section.");
      setData(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load this section."); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { ok: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "The action could not be completed.");
  return payload.data;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { ok: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "The update could not be completed.");
  return payload.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const payload = await response.json() as { ok: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "The requested data could not be loaded.");
  return payload.data;
}
