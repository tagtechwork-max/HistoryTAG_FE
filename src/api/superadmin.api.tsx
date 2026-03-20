import api from "./client";

// =======================================================
// USER MANAGEMENT
// =======================================================

export type UserResponseDTO = {
  id: number;
  username: string;
  email?: string | null;
  fullname?: string | null;
  status?: boolean;
  phone?: string | null;
  avatar?: string | null;
  address?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  workStatus?: string | null;
  workStatusDate?: string | null;
  department?: string | null;
  team?: string | null;
  roles?: { roleId: number; roleName: string }[];
  businessProjectId?: number | null;
  businessProjectName?: string | null;
  // New multi-team support
  globalRole?: string | null;
  availableTeams?: string[] | null;
  primaryTeam?: string | null;
  teamRoles?: Record<string, string> | null;
  /** When true, this user (ADMIN) is allowed to approve OT. */
  canApproveOt?: boolean | null;
};

export type SuperAdminUserCreateDTO = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  address: string;
  phoneNumber?: string;
  department: string;
  team?: string; // Deprecated: Use selectedTeams instead
  roles: string[]; // Deprecated: Use globalRole instead
  businessProjectId?: number | null;
  // New multi-team support
  globalRole?: string; // USER, ADMIN, SUPERADMIN
  selectedTeams?: string[]; // List of team IDs
  teamRoles?: string; // JSON string: teamId -> role (LEADER/MEMBER)
  primaryTeam?: string; // Primary team ID
};

export type UserUpdateRequestDTO = {
  fullname?: string;
  phone?: string;
  address?: string;
  email?: string;
  avatar?: File | null;
  assignedHospitalIds?: number[];
  workStatus?: string;
  workStatusDate?: string | null;
  department?: "IT" | "ACCOUNTING" | "BUSINESS" | null;
  team?: "DEV" | "DEPLOYMENT" | "MAINTENANCE" | "SALES" | "CUSTOMER_SERVICE" | null; // Deprecated: Use selectedTeams instead
  roles?: string[]; // Deprecated: Use globalRole instead
  businessProjectId?: number | null;
  // New multi-team support
  globalRole?: string; // USER, ADMIN, SUPERADMIN
  selectedTeams?: string[]; // List of team IDs
  teamRoles?: string; // JSON string: teamId -> role (LEADER/MEMBER)
  primaryTeam?: string; // Primary team ID
  /** When true, allow this user (ADMIN) to approve OT. */
  canApproveOt?: boolean;
};

// User Management APIs
export async function getAllUsers(params: {
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
  search?: string;
}) {
  const { data } = await api.get("/api/v1/superadmin/users", { params });
  return data;
}

export async function getUserById(id: number) {
  const { data } = await api.get<UserResponseDTO>(`/api/v1/superadmin/users/${id}`);
  return data;
}

export async function createUser(payload: SuperAdminUserCreateDTO) {
  const url = `/api/v1/superadmin/users`;
  
  // Backend expects JSON for create (no file upload support in create endpoint)
  const { data } = await api.post<UserResponseDTO>(url, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

export async function updateUser(id: number, payload: UserUpdateRequestDTO) {
  const url = `/api/v1/superadmin/users/${id}`;
  // Backend update endpoint requires multipart/form-data always
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    // Handle File
    if (value instanceof File) {
      formData.append(key, value as File);
      return;
    }

    // Handle arrays (including selectedTeams)
    if (Array.isArray(value)) {
      value.forEach((v) => formData.append(key, String(v)));
      return;
    }

    // Handle objects (for backward compatibility, but teamRoles is already stringified)
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // Convert to JSON string for backend to parse
      formData.append(key, JSON.stringify(value));
      return;
    }

    formData.append(key, String(value));
  });

  const { data } = await api.put<UserResponseDTO>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteUser(id: number) {
  const { data } = await api.delete(`/api/v1/superadmin/users/${id}`);
  return data;
}

export async function filterUsers(params: {
  fullName?: string;
  status?: boolean;
  fromDate?: string;
  toDate?: string;
  team?: string;
  department?: string;
}) {
  const { data } = await api.get<UserResponseDTO[]>("/api/v1/superadmin/users/filter", { params });
  return data;
}

export async function lockUser(id: number) {
  const { data } = await api.put(`/api/v1/superadmin/users/${id}/lock`);
  return data;
}

export async function unlockUser(id: number) {
  const { data } = await api.put(`/api/v1/superadmin/users/${id}/unlock`);
  return data;
}

export type SuperAdminSummaryDTO = {
  totalUsers: number;
  totalHospitals: number;
  totalHisSystems: number;
  totalHardware: number;
  totalAgencies: number;
};

export async function getSummaryReport() {
  const { data } = await api.get<SuperAdminSummaryDTO>(`/api/v1/superadmin/reports/summary`);
  return data;
}

// Export all as default
export default {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  filterUsers,
  lockUser,
  unlockUser,
};

// =======================================================
// HARDWARE MANAGEMENT (SUPER ADMIN)
// =======================================================

export type HardwareResponseDTO = {
  id: number;
  name: string;
  type?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  supplier?: string | null;
  warrantyPeriod?: string | null;
  // Price (serialized from backend BigDecimal)
  price?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HardwareRequestDTO = {
  name: string;
  type?: string | null;
  imageFile?: File | null;
  notes?: string | null;
  supplier?: string | null;
  warrantyPeriod?: string | null;
  price?: number | null;
};

export type HardwareUpdateRequestDTO = Partial<HardwareRequestDTO>;

export async function getAllHardware(params: {
  search?: string;
  type?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const { data } = await api.get("/api/v1/superadmin/hardware", { params });
  return data as { content: HardwareResponseDTO[]; totalElements: number } | HardwareResponseDTO[];
}

export async function getHardwareById(id: number) {
  const { data } = await api.get<HardwareResponseDTO>(`/api/v1/superadmin/hardware/${id}`);
  return data;
}

export async function createHardware(payload: HardwareRequestDTO) {
  const form = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (v instanceof File) {
      form.append(k, v);
    } else {
      form.append(k, String(v));
    }
  });
  const { data } = await api.post<HardwareResponseDTO>("/api/v1/superadmin/hardware", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function updateHardware(id: number, payload: HardwareUpdateRequestDTO) {
  const form = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (v instanceof File) {
      form.append(k, v);
    } else {
      form.append(k, String(v));
    }
  });
  const { data } = await api.put<HardwareResponseDTO>(`/api/v1/superadmin/hardware/${id}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteHardware(id: number) {
  const { data } = await api.delete(`/api/v1/superadmin/hardware/${id}`);
  return data;
}

export const HardwareAPI = {
  getAllHardware,
  getHardwareById,
  createHardware,
  updateHardware,
  deleteHardware,
};

// =======================================================
// IMPLEMENTATION TASKS (Super Admin)
// =======================================================
export type ImplementationTaskResponseDTO = {
  id: number;
  name: string;
  hospitalId: number | null;
  hospitalName?: string | null;
  businessProjectId?: number | null;
  businessProjectName?: string | null;
  fromBusinessContract?: boolean | null;
  picDeploymentId: number | null;
  picDeploymentName?: string | null;
  picDeploymentIds?: number[] | null;
  picDeploymentNames?: string[] | null;
  quantity?: number | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  endDate?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  status?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
  team?: "DEPLOYMENT" | string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ImplementationTaskRequestDTO = {
  name: string;
  hospitalId: number;
  picDeploymentId: number;
  picDeploymentIds?: number[] | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  status?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
};

export type ImplementationTaskUpdateDTO = Partial<ImplementationTaskRequestDTO>;

export async function getAllImplementationTasks(params: {
  search?: string;
  status?: string;
  hospitalName?: string;
  picDeploymentId?: number;
  team?: string;
  startDateFrom?: string;
  startDateTo?: string;
  quarter?: string;
  year?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}) {
  const { data } = await api.get("/api/v1/superadmin/implementation/tasks", { params });
  return data;
}

export async function getImplementationTaskById(id: number) {
  const { data } = await api.get<ImplementationTaskResponseDTO>(`/api/v1/superadmin/implementation/tasks/${id}`);
  return data;
}

export async function createImplementationTask(payload: ImplementationTaskRequestDTO) {
  const { data } = await api.post<ImplementationTaskResponseDTO>("/api/v1/superadmin/implementation/tasks", payload);
  return data;
}

export async function updateImplementationTask(id: number, payload: ImplementationTaskUpdateDTO) {
  const { data } = await api.put<ImplementationTaskResponseDTO>(`/api/v1/superadmin/implementation/tasks/${id}`, payload);
  return data;
}

export async function deleteImplementationTask(id: number) {
  const { data } = await api.delete(`/api/v1/superadmin/implementation/tasks/${id}`);
  return data;
}

export async function searchImplementationTasks(params: { search?: string; status?: string }) {
  const { data } = await api.get<ImplementationTaskResponseDTO[]>("/api/v1/superadmin/implementation/tasks/search", { params });
  return data;
}

// =======================================================
// DEV TASKS (Super Admin)
// =======================================================
export type DevTaskResponseDTO = {
  id: number;
  name: string;
  hospitalId: number | null;
  hospitalName?: string | null;
  picDeploymentId: number | null;
  picDeploymentName?: string | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  acceptanceDate?: string | null;
  team?: "DEV" | string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DevTaskRequestDTO = {
  name: string;
  hospitalId: number;
  picDeploymentId: number;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
};

export type DevTaskUpdateDTO = Partial<DevTaskRequestDTO>;

export async function getAllDevTasks(params: {
  search?: string;
  status?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}) {
  const { data } = await api.get("/api/v1/superadmin/dev/tasks", { params });
  return data;
}

export async function getDevTaskById(id: number) {
  const { data } = await api.get<DevTaskResponseDTO>(`/api/v1/superadmin/dev/tasks/${id}`);
  return data;
}

export async function createDevTask(payload: DevTaskRequestDTO) {
  const { data } = await api.post<DevTaskResponseDTO>("/api/v1/superadmin/dev/tasks", payload);
  return data;
}

export async function updateDevTask(id: number, payload: DevTaskUpdateDTO) {
  const { data } = await api.put<DevTaskResponseDTO>(`/api/v1/superadmin/dev/tasks/${id}`, payload);
  return data;
}

export async function deleteDevTask(id: number) {
  const { data } = await api.delete(`/api/v1/superadmin/dev/tasks/${id}`);
  return data;
}

export async function searchDevTasks(params: { search?: string; status?: string }) {
  const { data } = await api.get<DevTaskResponseDTO[]>("/api/v1/superadmin/dev/tasks/search", { params });
  return data;
}

// =======================================================
// MAINTENANCE TASKS (Super Admin)
// =======================================================
export type MaintenanceTaskResponseDTO = {
  id: number;
  name: string;
  hospitalId: number | null;
  hospitalName?: string | null;
  picDeploymentId: number | null;
  picDeploymentName?: string | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  acceptanceDate?: string | null;
  maintenanceNotes?: string | null;
  lastMaintenanceDate?: string | null;
  team?: "MAINTENANCE" | string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type MaintenanceTaskRequestDTO = {
  name: string;
  hospitalId: number;
  picDeploymentId: number;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  maintenanceNotes?: string | null;
  lastMaintenanceDate?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  acceptanceDate?: string | null;
};

export type MaintenanceTaskUpdateDTO = Partial<MaintenanceTaskRequestDTO>;

export async function getAllMaintenanceTasks(params: {
  search?: string;
  status?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}) {
  const { data } = await api.get("/api/v1/superadmin/maintenance/tasks", { params });
  return data;
}

export async function getMaintenanceTaskById(id: number) {
  const { data } = await api.get<MaintenanceTaskResponseDTO>(`/api/v1/superadmin/maintenance/tasks/${id}`);
  return data;
}

export async function createMaintenanceTask(payload: MaintenanceTaskRequestDTO) {
  const { data } = await api.post<MaintenanceTaskResponseDTO>("/api/v1/superadmin/maintenance/tasks", payload);
  return data;
}

export async function updateMaintenanceTask(id: number, payload: MaintenanceTaskUpdateDTO) {
  const { data } = await api.put<MaintenanceTaskResponseDTO>(`/api/v1/superadmin/maintenance/tasks/${id}`, payload);
  return data;
}

export async function deleteMaintenanceTask(id: number) {
  const { data } = await api.delete(`/api/v1/superadmin/maintenance/tasks/${id}`);
  return data;
}

export async function searchMaintenanceTasks(params: { search?: string; status?: string }) {
  const { data } = await api.get<MaintenanceTaskResponseDTO[]>("/api/v1/superadmin/maintenance/tasks/search", { params });
  return data;
}

