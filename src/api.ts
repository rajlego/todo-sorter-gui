// src/api.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function fetchHealth(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/healthz`);
  if (!res.ok) throw new Error('API health check failed');
  return res.text();
}

// Add more API functions as backend endpoints are defined 