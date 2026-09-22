import { fetchWithAuth } from "./client";

const API_ROOT = import.meta.env.VITE_API_URL || "";
const ADMIN_BASE = `${API_ROOT}/api/v1/admin/demo-registrations`;
const PUBLIC_BASE = `${API_ROOT}/api/v1/public/demo-registrations`;

export type DemoRegistrationStatus =
  | "NEW"
  | "CONTACTED"
  | "SCHEDULED"
  | "CONSULTING"
  | "CONVERTED"
  | "NO_NEED";

export type DemoRegistration = {
  id: number;
  contactName: string;
  phoneNumber: string;
  organizationName: string;
  position?: string | null;
  solutionCode: string;
  solutionName: string;
  note?: string | null;
  status: DemoRegistrationStatus;
  assignedToUserId?: number | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemoRegistrationPage = {
  content: DemoRegistration[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type DemoRegistrationSummary = {
  totalCount: number;
  newCount: number;
  scheduledCount: number;
  convertedCount: number;
};

export type PublicDemoRegistrationRequest = {
  contactName: string;
  phoneNumber: string;
  organizationName: string;
  position?: string;
  solutionCode: string;
  note?: string;
  website?: string;
};

export type PublicDemoRegistrationResponse = {
  message: string;
  receivedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof body?.message === "string"
      ? body.message
      : "Không thể xử lý yêu cầu. Vui lòng thử lại.";
    throw new Error(message);
  }
  return body as T;
}

export async function getDemoRegistrations(params: {
  search?: string;
  status?: DemoRegistrationStatus;
  solutionCode?: string;
  page: number;
  size: number;
}, signal?: AbortSignal): Promise<DemoRegistrationPage> {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  if (params.solutionCode) query.set("solutionCode", params.solutionCode);

  return readJson<DemoRegistrationPage>(
    await fetchWithAuth(`${ADMIN_BASE}?${query.toString()}`, { signal }),
  );
}

export async function getDemoRegistrationSummary(signal?: AbortSignal): Promise<DemoRegistrationSummary> {
  return readJson<DemoRegistrationSummary>(
    await fetchWithAuth(`${ADMIN_BASE}/summary`, { signal }),
  );
}

export async function updateDemoRegistrationStatus(
  id: number,
  status: DemoRegistrationStatus,
): Promise<DemoRegistration> {
  return readJson<DemoRegistration>(
    await fetchWithAuth(`${ADMIN_BASE}/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  );
}

export async function createPublicDemoRegistration(
  payload: PublicDemoRegistrationRequest,
): Promise<PublicDemoRegistrationResponse> {
  return readJson<PublicDemoRegistrationResponse>(
    await fetch(PUBLIC_BASE, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}
