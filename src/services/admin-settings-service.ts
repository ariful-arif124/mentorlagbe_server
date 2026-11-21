
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api"
).replace(/\/+$/, "");

const API_BASE_URL = API_URL.endsWith("/api")
  ? API_URL
  : `${API_URL}/api`;

async function request(
  endpoint: string,
  token: string,
  method = "GET",
  body?: unknown
) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? {
          "Content-Type": "application/json",
        } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || "Request failed"
    );
  }

  return result.data;
}

export function getAdminSettings(token: string) {
  return request("/admin/settings", token);
}

export function getAdminProfile(token: string) {
  return request("/profile", token);
}

export function saveAdminSettings(
  token: string,
  data: {
    platform?: Record<string, unknown>;
    notifications?: Record<string, unknown>;
  }
) {
  return request(
    "/admin/settings",
    token,
    "PATCH",
    data
  );
}

export function saveAdminProfile(
  token: string,
  profile: Record<string, unknown>
) {
  return request(
    "/profile",
    token,
    "PATCH",
    profile
  );
}

export function changeAdminPassword(
  token: string,
  data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }
) {
  return request(
    "/admin/settings/password",
    token,
    "PATCH",
    data
  );
}
