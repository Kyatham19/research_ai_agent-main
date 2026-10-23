/**
 * utils/api.js — Centralized API Client & Authentication Helpers
 * Automatically attaches session Bearer tokens to API calls for user isolation.
 */

export const API = "";

export function getAuthToken() {
  try {
    return localStorage.getItem("rai-token") || null;
  } catch {
    return null;
  }
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem("rai-user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(user, token) {
  try {
    if (user) localStorage.setItem("rai-user", JSON.stringify(user));
    if (token) localStorage.setItem("rai-token", token);
  } catch {
    // Storage access blocked or unavailable
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem("rai-user");
    localStorage.removeItem("rai-token");
  } catch {
    // Storage access blocked or unavailable
  }
}

/**
 * Fetch wrapper that attaches Authorization: Bearer <token> if available.
 */
export async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
