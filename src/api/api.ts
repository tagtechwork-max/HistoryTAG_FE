import type { AddTaskFormValues } from "../pages/implementationTaskNew/form/AddTaskPhaseImplementation";
import type { TaskDetail } from "../pages/implementationTaskNew/view/ViewTaskPhaseImplementation";
import api from "./client";

// Backend DTOs for implementation tasks
export type ImplementationTaskListItem = {
  id: number;
  hospitalName: string;
  projectCode: string | null;
  startDate: string | null; // ISO date
  reportDeadline: string | null; // ISO date
  goLiveDeadline: string | null; // ISO datetime or date
  /** Set when user completes phase 4 (implementation completion date) */
  completionDate: string | null; // ISO datetime or date
  phase: number;
  phaseLabel: string;
  phaseColor: "blue" | "purple" | "yellow" | "green";
  progress: number; // 0-100
  pmName: string | null;
  engineerName: string | null;
  health: "in_progress" | "at_risk" | "blocked" | "completed";
  healthLabel: string;
  transferredToMaintenance?: boolean;
  acceptedByMaintenance?: boolean;
  /** If API returns this, list will filter out deleted so only the re-added task shows */
  deletedAt?: string | null;
  deleted?: boolean;
};

export type ImplementationTaskPage = {
  items: ImplementationTaskListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImplementationTaskDetail = {
  id: number;
  name: string;
  operationDate: string | null;
  pmName: string | null;
  pmUserId: number | null;
  engineerName: string | null;
  engineerUserId: number | null;
  health: "in_progress" | "at_risk" | "blocked" | "completed";
  healthLabel: string;
  currentPhase: number;
  currentPhaseLabel: string;
  progress: number;
  hospitalName: string | null;
  hospitalId: number | null;
  projectCode?: string | null;
  startDate?: string | null;
  reportDeadline?: string | null;
  goLiveDeadline?: string | null;
  version?: number;
  /** Milestones from create/detail API - used to navigate to phase 1 add-tasks page */
  milestones?: MilestoneDto[];
};

export type HospitalOption = { id: number; name: string; code?: string };

export type UserDeploymentOption = { id: number; name: string };

export type ImplementationTaskCreateRequest = {
  hospitalId: number;
  projectCode?: string;
  startDate?: string;
  reportDeadline?: string;
  goLiveDeadline?: string;
  pmUserId?: number;
  engineerUserId?: number;
};

export type ImplementationTaskUpdateRequest = {
  projectCode?: string;
  startDate?: string;
  reportDeadline?: string;
  goLiveDeadline?: string;
  pmUserId?: number;
  engineerUserId?: number;
  version?: number;
};

export type MilestoneDto = {
  id: number;
  number: number;
  status: "completed" | "in_progress" | "not_started";
  label: string;
  progress: number;
  openTasks?: number;
  estimatedTasks?: number;
};

export type WorkItemListDto = {
  id: number;
  title: string;
  tags: string[];
  assignee: string | null;
  assigneeInitials: string | null;
  assigneeUserId: number | null;
  dueDate: string | null;
  isOverdue: boolean | null;
  impact: "critical" | "normal" | null | "done";
  description: string | null;
  blockedReason: string | null;
  blockedReasonTag?: string | null;
  estimatedResolution: string | null;
  createdAt: string | null;
  completedAt: string | null;
  status: "todo" | "in_progress" | "completed" | "blocked";
  sortOrder: number;
  version: number;
};

export type WorkItemDetailDto = TaskDetail & {
  activityLog: {
    id: number;
    eventType: string;
    oldValue: string | null;
    newValue: string | null;
    user: string | null;
    userId: number | null;
    createdAt: string;
    highlight: boolean;
  }[];
  comments: {
    id: number;
    user: string;
    userInitials: string;
    userId: number;
    content: string;
    createdAt: string;
  }[];
};

/** Convert date-only "YYYY-MM-DD" to ISO LocalDateTime "YYYY-MM-DDTHH:mm:ss" for Java backend */
function toLocalDateTime(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  return s;
}

function toParams(params: Record<string, string | number | undefined>): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    result[k] = v;
  });
  return result;
}

export async function fetchImplementationTasks(params: {
  search?: string;
  projectOwner?: string;
  phase?: string;
  status?: string;
  deadline?: string;
  page: number;
  size: number;
}): Promise<ImplementationTaskPage> {
  const axiosParams = toParams({
    search: params.search,
    projectOwner: params.projectOwner && params.projectOwner !== "all" ? params.projectOwner : undefined,
    phase: params.phase && params.phase !== "all" ? params.phase : undefined,
    health: params.status && params.status !== "all" ? params.status : undefined,
    deadline: params.deadline,
    page: params.page,
    size: params.size,
  });
  const { data } = await api.get<ImplementationTaskPage>("/api/v1/implementation-tasks", {
    params: axiosParams,
  });
  return data;
}

export async function fetchImplementationTaskDetail(id: string | number): Promise<ImplementationTaskDetail> {
  const { data } = await api.get<ImplementationTaskDetail>(`/api/v1/implementation-tasks/${id}`);
  return data;
}

export async function fetchHospitalOptions(): Promise<HospitalOption[]> {
  try {
    const { data } = await api.get<HospitalOption[]>("/api/v1/hospitals/options");
    return data;
  } catch {
    return [];
  }
}

export async function fetchUserDeploymentOptions(): Promise<UserDeploymentOption[]> {
  try {
    const { data } = await api.get<UserDeploymentOption[]>("/api/v1/users/deployment-options");
    return data;
  } catch {
    return [];
  }
}

/** Search hospitals by name - type-to-find style (like implementation-tasks RemoteSelect) */
export async function searchHospitalsForSelect(term: string): Promise<HospitalOption[]> {
  if (!term || term.trim().length < 2) return [];
  const q = term.trim().toLowerCase();
  try {
    const { data } = await api.get<unknown[] | HospitalOption[]>("/api/v1/admin/hospitals/search", {
      params: { name: term.trim() },
    });
    const list = Array.isArray(data) ? data : [];
    return list
      .map((h: unknown) => {
        const x = h as {
          id?: number;
          label?: string;
          name?: string;
          hospitalName?: string;
          code?: string;
          hospitalCode?: string;
          hospital_code?: string;
        };
        const code = x.code ?? x.hospitalCode ?? x.hospital_code;
        return {
          id: Number(x.id),
          name: String(x.label ?? x.name ?? x.hospitalName ?? x.code ?? x?.id ?? ""),
          ...(code != null && String(code).trim() ? { code: String(code).trim() } : {}),
        };
      })
      .filter((item) => Number.isFinite(item.id) && item.name);
  } catch {
    try {
      const all = await fetchHospitalOptions();
      return all.filter((h) => h.name.toLowerCase().includes(q));
    } catch {
      return [];
    }
  }
}

/** Search hospitals from options API - guaranteed to have code for implementation form */
export async function searchHospitalsWithCode(term: string): Promise<HospitalOption[]> {
  if (!term || term.trim().length < 2) return [];
  const q = term.trim().toLowerCase();
  try {
    const all = await fetchHospitalOptions();
    return all.filter((h) => h.name.toLowerCase().includes(q));
  } catch {
    return [];
  }
}

/** Search users (DEPLOYMENT team) by name - type-to-find style */
export async function searchUsersForDeployment(term: string): Promise<UserDeploymentOption[]> {
  if (!term || term.trim().length < 2) return [];
  const q = term.trim().toLowerCase();
  try {
    const { data } = await api.get<unknown[] | UserDeploymentOption[]>("/api/v1/admin/users/search", {
      params: { name: term.trim(), team: "DEPLOYMENT" },
    });
    const list = Array.isArray(data) ? data : [];
    return list
      .map((u: unknown) => {
        const x = u as { id?: number; label?: string; name?: string; fullName?: string; fullname?: string; username?: string };
        return {
          id: Number(x.id),
          name: String(x.label ?? x.name ?? x.fullName ?? x.fullname ?? x.username ?? x?.id ?? ""),
        };
      })
      .filter((item) => Number.isFinite(item.id) && item.name);
  } catch {
    try {
      const all = await fetchUserDeploymentOptions();
      return all.filter((u) => u.name.toLowerCase().includes(q));
    } catch {
      return [];
    }
  }
}

export async function createImplementationTask(
  body: ImplementationTaskCreateRequest
): Promise<ImplementationTaskDetail> {
  const payload = {
    hospitalId: body.hospitalId,
    projectCode: body.projectCode || null,
    startDate: toLocalDateTime(body.startDate) ?? null,
    reportDeadline: toLocalDateTime(body.reportDeadline) ?? null,
    goLiveDeadline: toLocalDateTime(body.goLiveDeadline) ?? null,
    pmUserId: body.pmUserId || null,
    engineerUserId: body.engineerUserId || null,
  };
  try {
    const { data } = await api.post<ImplementationTaskDetail>("/api/v1/implementation-tasks", payload);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (status === 409) {
      throw new Error("Version conflict. Please refresh and try again.");
    }
    throw new Error(message || `Failed to create (${status || "unknown"})`);
  }
}

export async function updateImplementationTask(
  id: string | number,
  body: ImplementationTaskUpdateRequest
): Promise<ImplementationTaskDetail> {
  const payload = {
    projectCode: body.projectCode,
    startDate: toLocalDateTime(body.startDate) ?? null,
    reportDeadline: toLocalDateTime(body.reportDeadline) ?? null,
    goLiveDeadline: toLocalDateTime(body.goLiveDeadline) ?? null,
    pmUserId: body.pmUserId,
    engineerUserId: body.engineerUserId,
    version: body.version,
  };
  try {
    const { data } = await api.patch<ImplementationTaskDetail>(`/api/v1/implementation-tasks/${id}`, payload);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      throw new Error("Version conflict. Dữ liệu đã được sửa. Vui lòng tải lại và thử lại.");
    }
    throw new Error(`Failed to update (${status || "unknown"})`);
  }
}

export async function deleteImplementationTask(id: string | number): Promise<void> {
  await api.delete(`/api/v1/implementation-tasks/${id}`);
}

export async function transferImplementationTask(id: string | number): Promise<void> {
  await api.post(`/api/v1/implementation-tasks/${id}/transfer`);
}

export async function acceptFromSales(businessProjectId: number): Promise<ImplementationTaskDetail> {
  try {
    const { data } = await api.post<ImplementationTaskDetail>(
      "/api/v1/implementation-tasks/accept-from-sales",
      { businessProjectId }
    );
    return data;
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    const status = (err as { response?: { status?: number } })?.response?.status;
    throw new Error(message || `Failed to accept (${status || "unknown"})`);
  }
}

export async function fetchMilestones(implementationTaskId: string | number): Promise<MilestoneDto[]> {
  const { data } = await api.get<MilestoneDto[]>(
    `/api/v1/implementation-tasks/${implementationTaskId}/milestones`
  );
  return data;
}

/** Mark a milestone as completed and advance to next phase (backend may auto-advance current phase) */
export async function completeMilestone(
  implementationTaskId: string | number,
  milestoneId: string | number
): Promise<void> {
  await api.post(
    `/api/v1/implementation-tasks/${implementationTaskId}/milestones/${milestoneId}/complete`
  );
}

export async function fetchWorkItems(params: {
  implementationTaskId: string | number;
  milestoneId?: string | number;
}): Promise<WorkItemListDto[]> {
  const axiosParams = toParams({
    implementationTaskId: params.implementationTaskId,
    milestoneId: params.milestoneId,
  });
  const { data } = await api.get<WorkItemListDto[]>("/api/v1/work-items", {
    params: axiosParams,
  });
  return data;
}

export async function fetchWorkItemDetail(id: number | string): Promise<WorkItemDetailDto> {
  const { data } = await api.get<WorkItemDetailDto>(`/api/v1/work-items/${id}`);
  return data;
}

export async function createWorkItem(params: {
  implementationTaskId: string | number;
  milestoneId: string | number;
  values: AddTaskFormValues;
}): Promise<WorkItemDetailDto> {
  const body = {
    implementationTaskId: Number(params.implementationTaskId),
    milestoneId: Number(params.milestoneId),
    title: params.values.title,
    description: params.values.description,
    status: params.values.status,
    assigneeUserId: (params.values as { assigneeUserId?: number }).assigneeUserId,
    dueDate: params.values.dueDate || null,
    tags: params.values.tags,
    impact: params.values.impact,
    blockedReason: params.values.blockedReason,
    estimatedResolution: params.values.estimatedResolution || null,
  };
  try {
    const { data } = await api.post<WorkItemDetailDto>("/api/v1/work-items", body);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    // Fallback when backend uses nested work-items under implementation-tasks (404 = flat /work-items not implemented)
    if (status === 404) {
      const nestedBody = {
        milestoneId: Number(params.milestoneId),
        title: params.values.title,
        description: params.values.description,
        status: params.values.status,
        assigneeUserId: (params.values as { assigneeUserId?: number }).assigneeUserId,
        dueDate: params.values.dueDate || null,
        tags: params.values.tags,
        impact: params.values.impact,
        blockedReason: params.values.blockedReason,
        estimatedResolution: params.values.estimatedResolution || null,
      };
      try {
        const { data } = await api.post<WorkItemDetailDto>(
          `/api/v1/implementation-tasks/${params.implementationTaskId}/work-items`,
          nestedBody
        );
        return data;
      } catch (nestedErr: unknown) {
        const nestedStatus = (nestedErr as { response?: { status?: number } })?.response?.status;
        if (nestedStatus === 404) {
          const { data } = await api.post<WorkItemDetailDto>(
            `/api/v1/implementation-tasks/${params.implementationTaskId}/milestones/${params.milestoneId}/work-items`,
            {
              title: params.values.title,
              description: params.values.description,
              status: params.values.status,
              assigneeUserId: (params.values as { assigneeUserId?: number }).assigneeUserId,
              dueDate: params.values.dueDate || null,
              tags: params.values.tags,
              impact: params.values.impact,
              blockedReason: params.values.blockedReason,
              estimatedResolution: params.values.estimatedResolution || null,
            }
          );
          return data;
        }
        throw nestedErr;
      }
    }
    throw err;
  }
}

export async function updateWorkItem(id: string | number, values: AddTaskFormValues & { version?: number }) {
  const body = {
    title: values.title,
    description: values.description,
    status: values.status,
    assigneeUserId: (values as { assigneeUserId?: number }).assigneeUserId,
    dueDate: values.dueDate || null,
    tags: values.tags,
    impact: values.impact,
    blockedReason: values.blockedReason,
    estimatedResolution: values.estimatedResolution || null,
    version: values.version,
  };
  try {
    const { data } = await api.patch(`/api/v1/work-items/${id}`, body);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      throw new Error("Version conflict. Vui lòng tải lại và thử lại.");
    }
    throw err;
  }
}

export async function moveWorkItem(id: string | number, status: string, order: number) {
  const { data } = await api.patch(`/api/v1/work-items/${id}/move`, { status, order });
  return data;
}

export async function deleteWorkItem(id: string | number) {
  await api.delete(`/api/v1/work-items/${id}`);
}

/** POST a comment; returns the created comment object. Use as onSendComment return value for realtime display in ViewTaskPhaseImplementation. */
export async function addWorkItemComment(id: string | number, content: string) {
  const { data } = await api.post(`/api/v1/work-items/${id}/comments`, { content });
  return data;
}

/** Care-status summary from business (phòng kinh doanh): hospitals and total kiosks in "chăm sóc" status */
export type CareStatusSummary = {
  hospitalCount: number;
  kioskCount: number;
};

/** Fetch summary for "Có X viện Y kiosk đang ở trạng thái chăm sóc" (data from business/sales) */
export async function fetchCareStatusSummary(): Promise<CareStatusSummary> {
  try {
    const res = await api.get<CareStatusSummary | { data?: CareStatusSummary }>(
      "/api/v1/admin/business/care-status-summary"
    );
    // Axios puts response body in res.data; backend may wrap in { data: { ... } }
    const body = (res as { data?: unknown }).data;
    const payload =
      body &&
      typeof body === "object" &&
      "data" in body &&
      (body as { data?: unknown }).data &&
      typeof (body as { data?: unknown }).data === "object"
        ? (body as { data: CareStatusSummary }).data
        : (body as CareStatusSummary);
    const hospitalCount = Math.max(0, Number(payload?.hospitalCount) ?? 0);
    const kioskCount = Math.max(0, Number(payload?.kioskCount) ?? 0);
    console.log("[fetchCareStatusSummary] body:", body, "->", { hospitalCount, kioskCount });
    return { hospitalCount, kioskCount };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const url = (err as { config?: { url?: string } })?.config?.url;
    console.warn("[fetchCareStatusSummary] failed:", status ?? "network/other", url ?? "", err);
    return { hospitalCount: 0, kioskCount: 0 };
  }
}

