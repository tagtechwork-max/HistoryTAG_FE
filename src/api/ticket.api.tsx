import api from './client';
import { isSuperAdmin as isSuperAdminPermission } from '../utils/permission';

function isSuperAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.location.pathname.startsWith('/superadmin') || isSuperAdminPermission();
  } catch {
    return false;
  }
}

function getBase(method: string = 'GET', canManage: boolean = false) {
  if (method === 'GET') return '/api/v1/admin';
  if (canManage && ['POST', 'PUT', 'DELETE'].includes(method) && isSuperAdmin()) {
    return '/api/v1/superadmin';
  }
  return '/api/v1/admin';
}

export type TicketResponseDTO = {
  id: number;
  ticketCode: string;
  issue: string;
  priority: "Cao" | "Trung bình" | "Thấp";
  status: "CHUA_XU_LY" | "DANG_XU_LY" | "HOAN_THANH";
  ticketType?: "MAINTENANCE" | "DEPLOYMENT";
  pic: string | null;
  picUserId: number | null;
  hospitalId: number;
  hospitalName?: string | null;
  createdBy: string | null;
  createdById: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TicketRequestDTO = {
  issue: string;
  priority: "Cao" | "Trung bình" | "Thấp";
  status: "CHUA_XU_LY" | "DANG_XU_LY" | "HOAN_THANH";
  ticketType?: "MAINTENANCE" | "DEPLOYMENT";
  picUserId?: number | null;
  picName?: string | null;
};

export type TicketFilterParams = {
  hospitalId?: number;
  status?: string;
  priority?: string;
  ticketType?: string;
  search?: string;
  page?: number;
  size?: number;
};

const CACHE_TTL_MS = 60_000;
const pendingReads = new Map<string, Promise<TicketResponseDTO[]>>();
const readCache = new Map<string, { data: TicketResponseDTO[]; expiresAt: number }>();

export function isValidHospitalId(value: unknown): value is number {
  const id = Number(value);
  return Number.isInteger(id) && id > 0;
}

function readOnce(key: string, request: () => Promise<TicketResponseDTO[]>): Promise<TicketResponseDTO[]> {
  const cached = readCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const pending = pendingReads.get(key);
  if (pending) return pending;

  const promise = request()
    .then((data) => {
      readCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    })
    .finally(() => pendingReads.delete(key));
  pendingReads.set(key, promise);
  return promise;
}

function invalidateReads(hospitalId?: number) {
  readCache.delete('all');
  if (hospitalId) readCache.delete(`hospital:${hospitalId}`);
}

/** One aggregate request; the backend owns filtering/pagination when supplied. */
export function getAllTickets(params?: TicketFilterParams): Promise<TicketResponseDTO[]> {
  return readOnce('all', async () => {
    const queryParams = new URLSearchParams();
    if (isValidHospitalId(params?.hospitalId)) queryParams.set('hospitalId', String(params?.hospitalId));
    if (params?.status) queryParams.set('status', params.status);
    if (params?.priority) queryParams.set('priority', params.priority);
    if (params?.ticketType) queryParams.set('ticketType', params.ticketType);
    if (params?.search) queryParams.set('search', params.search);
    if (params?.page !== undefined) queryParams.set('page', String(params.page));
    if (params?.size !== undefined) queryParams.set('size', String(params.size));
    const query = queryParams.toString();
    const res = await api.get(`/api/v1/admin/tickets${query ? `?${query}` : ''}`);
    return Array.isArray(res.data) ? res.data : [];
  });
}

export function getHospitalTickets(hospitalId: number): Promise<TicketResponseDTO[]> {
  if (!isValidHospitalId(hospitalId)) {
    return Promise.reject(new TypeError(`Invalid hospitalId: ${String(hospitalId)}`));
  }
  return readOnce(`hospital:${hospitalId}`, async () => {
    const res = await api.get(`${getBase('GET')}/hospitals/${hospitalId}/tickets`);
    return Array.isArray(res.data) ? res.data : [];
  });
}

export async function createHospitalTicket(
  hospitalId: number,
  payload: TicketRequestDTO,
  canManage: boolean = false
): Promise<TicketResponseDTO> {
  if (!isValidHospitalId(hospitalId)) throw new TypeError(`Invalid hospitalId: ${String(hospitalId)}`);
  const res = await api.post(`${getBase('POST', canManage)}/hospitals/${hospitalId}/tickets`, payload);
  invalidateReads(hospitalId);
  return res.data;
}

export async function updateHospitalTicket(
  hospitalId: number,
  ticketId: number,
  payload: TicketRequestDTO,
  canManage: boolean = false
): Promise<TicketResponseDTO> {
  if (!isValidHospitalId(hospitalId)) throw new TypeError(`Invalid hospitalId: ${String(hospitalId)}`);
  const res = await api.put(`${getBase('PUT', canManage)}/hospitals/${hospitalId}/tickets/${ticketId}`, payload);
  invalidateReads(hospitalId);
  return res.data;
}

export async function deleteHospitalTicket(
  hospitalId: number,
  ticketId: number,
  canManage: boolean = false
): Promise<void> {
  if (!isValidHospitalId(hospitalId)) throw new TypeError(`Invalid hospitalId: ${String(hospitalId)}`);
  await api.delete(`${getBase('DELETE', canManage)}/hospitals/${hospitalId}/tickets/${ticketId}`);
  invalidateReads(hospitalId);
}
