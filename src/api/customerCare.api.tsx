import api, { getAuthToken } from './client';
import { getAllUsers } from './superadmin.api';
import { getRolesFromToken } from '../utils/permission';

// ✅ Helper để check xem user có phải SUPERADMIN không
function isSuperAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.pathname.startsWith('/superadmin')) return true;
    // ✅ Parse roles từ token (source of truth) thay vì localStorage
    const roles = getRolesFromToken();
    if (Array.isArray(roles) && roles.some((r: unknown) => {
      if (typeof r === 'string') return r.toUpperCase() === 'SUPERADMIN';
      if (r && typeof r === 'object') {
        const rr = r as Record<string, unknown>;
        const rn = rr.roleName ?? rr.role_name ?? rr.role;
        return typeof rn === 'string' && rn.toUpperCase() === 'SUPERADMIN';
      }
      return false;
    })) {
      return true;
    }
    const token = getAuthToken();
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const maybeRoles = payload.roles || payload.authorities || payload.role || payload.realm_access && payload.realm_access.roles;
          if (Array.isArray(maybeRoles) && maybeRoles.some((r: unknown) => typeof r === 'string' && (r as string).toUpperCase() === 'SUPERADMIN')) {
            return true;
          }
        }
      } catch {
        // ignore decode errors
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function getBase(method: string = 'GET', canManage: boolean = false) {
  if (method === 'GET') {
    return '/api/v1/admin';
  }
  if (canManage && (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
    if (isSuperAdmin()) {
      return '/api/v1/superadmin';
    }
  }
  return '/api/v1/admin';
}

// =======================================================
// TYPES
// =======================================================

export type CustomerCareResponseDTO = {
  careId: number;
  hospitalId: number;
  hospitalName?: string;
  hospitalCode?: string;
  address?: string;
  province?: string;
  kioskCount?: number;
  careType: string;
  careTypeLabel?: string;
  status: string;
  statusLabel?: string;
  priority: string;
  priorityLabel?: string;
  reason?: string;
  notes?: string;
  assignedUser?: {
    id: number;
    fullname: string;
    email?: string;
    avatar?: string;
    phone?: string;
  } | null;
  createdBy?: {
    id: number;
    fullname: string;
    email?: string;
    avatar?: string;
    phone?: string;
  } | null;
  targetDate?: string;
  nextFollowUpDate?: string;
  lastContactDate?: string;
  resolvedDate?: string;
  isResolved?: boolean;
  createdAt?: string;
  updatedAt?: string;
  activityCount?: number;
  daysLeft?: number;
  latestContract?: {
    contractId: number;
    contractCode: string;
    startDate: string;
    endDate: string;
    daysUntilExpiry: number;
  } | null;
  customerType?: string; // Enum: VIP, HIGH_VALUE, etc.
  customerTypeLabel?: string; // Display name: "Khách hàng VIP", etc.
  tags?: string[]; // Deprecated, dùng customerType thay thế
};

export type CustomerCareCreateRequestDTO = {
  hospitalId: number;
  careType: string;
  priority: string;
  reason: string;
  notes?: string;
  assignedUserId?: number | null;
  targetDate: string;
  nextFollowUpDate?: string;
  customerType?: string; // Enum: VIP, HIGH_VALUE, etc.
  tags?: string[]; // Deprecated, dùng customerType thay thế
};

export type CustomerCareUpdateRequestDTO = {
  hospitalId?: number;
  status?: string;
  priority?: string;
  reason?: string;
  notes?: string;
  assignedUserId?: number | null;
  targetDate?: string;
  nextFollowUpDate?: string;
  isResolved?: boolean;
  customerType?: string; // Enum: VIP, HIGH_VALUE, etc.
  tags?: string[]; // Deprecated, dùng customerType thay thế
};

export type CustomerCareActivityResponseDTO = {
  activityId: number;
  careId: number;
  activityType: string;
  activityTypeLabel?: string;
  title: string;
  description?: string;
  outcome?: string;
  outcomeLabel?: string;
  nextAction?: string;
  activityDate: string;
  nextFollowUpDate?: string;
  performedBy?: {
    id: number;
    fullname: string;
    email?: string;
    avatar?: string;
    phone?: string;
  };
  attachments?: Array<{
    url: string;
    name: string;
    type: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomerCareActivityCreateRequestDTO = {
  activityType: string;
  title: string;
  description?: string;
  outcome?: string;
  nextAction?: string;
  activityDate: string;
  nextFollowUpDate?: string;
  attachments?: Array<{
    url: string;
    name: string;
    type: string;
  }>;
};

// =======================================================
// CRUD APIs
// =======================================================

export async function createCustomerCare(payload: CustomerCareCreateRequestDTO, canManage: boolean = false) {
  const base = getBase('POST', canManage);
  const res = await api.post(`${base}/customer-care`, payload);
  return res.data;
}

export async function updateCustomerCare(careId: number, payload: CustomerCareUpdateRequestDTO, canManage: boolean = false) {
  const base = getBase('PUT', canManage);
  const res = await api.put(`${base}/customer-care/${careId}`, payload);
  return res.data;
}

export async function getCustomerCareById(careId: number): Promise<CustomerCareResponseDTO> {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/${careId}`);
  return res.data;
}

export async function deleteCustomerCare(careId: number, canManage: boolean = false) {
  const base = getBase('DELETE', canManage);
  await api.delete(`${base}/customer-care/${careId}`);
}

// =======================================================
// LIST & FILTER APIs
// =======================================================

export async function getAllCustomerCares(params: {
  status?: string;
  careType?: string;
  customerType?: string; // Enum: VIP, HIGH_VALUE, etc.
  priority?: string;
  assignedUserId?: number;
  createdById?: number;
  isResolved?: boolean;
  search?: string;
  contractStatus?: string; // Filter theo contract status: "sap_het_han", "qua_han", "da_gia_han", "dang_hoat_dong"
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
} = {}) {
  const base = isSuperAdmin() ? '/api/v1/superadmin' : '/api/v1/admin';
  const endpoint = isSuperAdmin() ? '/customer-care' : '/customer-care/all';
  
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}${endpoint}?${qs}` : `${base}${endpoint}`;
  const res = await api.get(url);
  return res.data;
}

export async function getMyCustomerCares(params: {
  page?: number;
  size?: number;
} = {}) {
  const base = getBase('GET', false);
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}/customer-care/my-tasks?${qs}` : `${base}/customer-care/my-tasks`;
  const res = await api.get(url);
  return res.data;
}

export async function getCustomerCaresByUser(userId: number, params: {
  page?: number;
  size?: number;
} = {}) {
  const base = '/api/v1/superadmin';
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}/customer-care/user/${userId}?${qs}` : `${base}/customer-care/user/${userId}`;
  const res = await api.get(url);
  return res.data;
}

// =======================================================
// ACTIVITIES APIs
// =======================================================

export async function addCustomerCareActivity(
  careId: number,
  payload: CustomerCareActivityCreateRequestDTO,
  canManage: boolean = false
) {
  const base = getBase('POST', canManage);
  const res = await api.post(`${base}/customer-care/${careId}/activities`, payload);
  return res.data;
}

export async function getCustomerCareActivities(
  careId: number,
  params: {
    page?: number;
    size?: number;
  } = {}
) {
  const base = getBase('GET', false);
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}/customer-care/${careId}/activities?${qs}` : `${base}/customer-care/${careId}/activities`;
  const res = await api.get(url);
  return res.data;
}

export async function getAllCustomerCareActivities(careId: number) {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/${careId}/activities/all`);
  return res.data;
}

export async function updateCustomerCareActivity(
  careId: number,
  activityId: number,
  payload: {
    activityType?: string;
    title?: string;
    description?: string;
    outcome?: string;
    nextAction?: string;
    nextFollowUpDate?: string;
    attachments?: any[];
  },
  canManage: boolean = false
) {
  const base = getBase('PUT', canManage);
  const res = await api.put(`${base}/customer-care/${careId}/activities/${activityId}`, payload);
  return res.data;
}

export async function deleteCustomerCareActivity(
  careId: number,
  activityId: number,
  canManage: boolean = false
) {
  const base = getBase('DELETE', canManage);
  const res = await api.delete(`${base}/customer-care/${careId}/activities/${activityId}`);
  return res.data;
}

// =======================================================
// STATUS MANAGEMENT APIs
// =======================================================

export async function changeCustomerCareStatus(
  careId: number,
  status: string,
  canManage: boolean = false
) {
  const base = getBase('PATCH', canManage);
  const res = await api.patch(`${base}/customer-care/${careId}/status`, null, {
    params: { status }
  });
  return res.data;
}

export async function markCustomerCareAsResolved(
  careId: number,
  canManage: boolean = false
) {
  const base = getBase('PATCH', canManage);
  const res = await api.patch(`${base}/customer-care/${careId}/resolve`);
  return res.data;
}

export async function assignCustomerCareToUser(
  careId: number,
  userId: number,
  canManage: boolean = false
) {
  const base = getBase('PATCH', canManage);
  const res = await api.patch(`${base}/customer-care/${careId}/assign`, null, {
    params: { userId }
  });
  return res.data;
}

// =======================================================
// STATISTICS APIs
// =======================================================

export async function getCustomerCareStatusCounts() {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/stats/status-counts`);
  return res.data;
}

export async function getCustomerCareTypeCounts() {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/stats/care-type-counts`);
  return res.data;
}

export async function getCustomerCareUserWorkload() {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/stats/user-workload`);
  return res.data;
}

export async function getUpcomingCustomerCareTasks(days: number = 7) {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/upcoming`, {
    params: { days }
  });
  return res.data;
}

export async function getOverdueCustomerCareTasks() {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/overdue`);
  return res.data;
}

/**
 * Lấy danh sách CustomerType enum values
 */
export async function getCustomerTypes(): Promise<Array<{ value: string; label: string }>> {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/customer-types`);
  return res.data || [];
}

/**
 * Lấy danh sách users đã được assign trong customer care records
 */
export async function getAssignedUsers(): Promise<Array<{ id: number; label: string; subLabel?: string; phone?: string | null }>> {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/assigned-users`);
  const data = Array.isArray(res.data) ? res.data : [];
  return data.map((item: any) => ({
    id: Number(item?.id ?? 0),
    label: String(item?.label ?? ''),
    subLabel: item?.subLabel ? String(item.subLabel) : undefined,
    phone: item?.phone ? String(item.phone).trim() : null,
  }));
}

/**
 * Lấy số lượng hospitals theo contract status (dựa trên contracts)
 * @returns Map với keys: "all", "sap_het_han", "qua_han", "da_gia_han", "dang_hoat_dong"
 */
export async function getContractStatusCounts(): Promise<Record<string, number>> {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/customer-care/stats/contract-status-counts`);
  const data = res.data || {};
  // Convert Long values to numbers
  const counts: Record<string, number> = {};
  Object.entries(data).forEach(([key, value]) => {
    counts[key] = typeof value === 'number' ? value : Number(value) || 0;
  });
  return counts;
}

// =======================================================
// HELPER APIs
// =======================================================

/**
 * Lấy danh sách users để assign cho Customer Care
 * Tương tự như getMaintainContractPicOptions nhưng cho Customer Care
 */
export async function getCustomerCareUserOptions() {
  try {
    const base = getBase('GET', false);
    
    // Lấy business users từ API business pic options
    let businessOptions: Array<{ id: number; label: string; subLabel?: string; phone?: string | null }> = [];
    try {
      const businessRes = await api.get(`${base}/business/pic-options`);
      const businessList = Array.isArray(businessRes.data) ? businessRes.data : [];
      businessOptions = businessList.map((item: any) => ({
        id: Number(item?.id ?? 0),
        label: String(item?.label ?? ''),
        subLabel: item?.subLabel ? String(item.subLabel) : undefined,
        phone: item?.phone ? String(item.phone).trim() : null,
      }));
    } catch (err) {
      // console.warn('Failed to fetch business PIC options', err);
    }

    // Lấy tất cả users nếu là SUPERADMIN
    let allUserOptions: Array<{ id: number; label: string; subLabel?: string; phone?: string | null }> = [];
    if (isSuperAdmin()) {
      try {
        const res = await getAllUsers({ page: 0, size: 200 });
        const content = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
        allUserOptions = content.map((user: any) => ({
          id: Number(user?.id ?? 0),
          label: String(user?.fullname ?? user?.fullName ?? user?.username ?? user?.email ?? `User #${user?.id ?? ''}`),
          subLabel: user?.email ? String(user.email) : undefined,
          phone: user?.phone ? String(user.phone).trim() : null,
        }));
      } catch (err) {
        // console.warn('Failed to fetch all users for Customer Care options', err);
      }
    }

    // Merge và loại bỏ trùng lặp
    const mergedMap = new Map<number, { id: number; label: string; subLabel?: string; phone?: string | null }>();
    [...businessOptions, ...allUserOptions].forEach((opt) => {
      if (!opt || !opt.id) return;
      if (!opt.label || !opt.label.trim()) return;
      if (!mergedMap.has(opt.id)) {
        mergedMap.set(opt.id, { ...opt, label: opt.label.trim() });
      }
    });

    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'vi', { sensitivity: 'base' })
    );

    return merged;
  } catch (err) {
    console.error('getCustomerCareUserOptions failed', err);
    return [];
  }
}

/**
 * Lấy danh sách active care tasks của một hospital (để hiển thị warning ở frontend)
 * @param hospitalId ID của hospital
 * @returns List of active care tasks
 */
export async function getActiveCareTasksByHospitalId(hospitalId: number): Promise<CustomerCareResponseDTO[]> {
  try {
    const base = getBase('GET', false);
    const res = await api.get(`${base}/customer-care/hospital/${hospitalId}/active-tasks`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('getActiveCareTasksByHospitalId failed', err);
    return [];
  }
}

