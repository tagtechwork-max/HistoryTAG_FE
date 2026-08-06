import api, { getAuthToken } from './client';

export async function searchHardware(q = '') {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  try {
    const res = await api.get(`${base}/hardware/search?search=${encodeURIComponent(q)}`);
    const data = res.data;
    // Normalize possible shapes: either an array of EntitySelectDTO or a Page object with content
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as { content?: unknown[] }).content)) {
      const content = (data as { content?: unknown[] }).content as Record<string, unknown>[];
      return content.map((h) => {
        const hh = h as Record<string, unknown>;
        const id = hh['id'] as number | string | undefined;
        const name = hh['name'] ?? hh['label'] ?? id;
        const type = hh['type'] ?? hh['subLabel'] ?? '';
        return { id: Number(String(id ?? '0')), label: String(name ?? ''), subLabel: String(type ?? '') };
      });
    }
    return [];
  } catch (err) {
    // admin API failed — do not call superadmin endpoints from admin UI
    console.error('searchHardware admin API failed', err);
    return [];
  }
}

export async function searchHospitals(q = '') {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  try {
    const res = await api.get(`${base}/hospitals/search?name=${encodeURIComponent(q)}`);
    return res.data; // expects array of { id, label }
  } catch (err) {
    console.error('searchHospitals admin API failed', err);
    return [];
  }
}

import { isSuperAdmin as isSuperAdminPermission } from '../utils/permission';

// ✅ Helper để check xem user có phải SUPERADMIN không (từ JWT token - source of truth)
function isSuperAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Check pathname
    if (window.location.pathname.startsWith('/superadmin')) return true;
    return isSuperAdminPermission();
  } catch {
    return false;
  }
}

function getBase(method: string = 'GET', canManage: boolean = false) {
  // ✅ GET requests: luôn dùng admin API (admin thường có thể xem)
  if (method === 'GET') {
    return '/api/v1/admin';
  }
  // ✅ Write operations (POST, PUT, DELETE): 
  // Nếu canManage = true, có nghĩa là user có quyền (superadmin hoặc team SALES)
  // Superadmin nên dùng superadmin API để bypass team check
  // Team SALES có thể dùng admin API vì backend đã check team permission
  if (canManage && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    // Nếu là superadmin, dùng superadmin API để đảm bảo bypass team check
    if (isSuperAdmin()) {
      return '/api/v1/superadmin';
    }
    // Nếu không phải superadmin nhưng canManage = true, có nghĩa là team SALES
    // Team SALES có thể dùng admin API vì backend đã check team permission
  }
  // Fallback: dùng admin API
  return '/api/v1/admin';
}

export async function createBusiness(payload: Record<string, unknown>, canManage: boolean = false) {
  const base = getBase('POST', canManage);
  const res = await api.post(`${base}/business`, payload);
  return res.data;
}

export async function updateBusiness(id: number, payload: Record<string, unknown>, canManage: boolean = false) {
  const base = getBase('PUT', canManage);
  const res = await api.put(`${base}/business/${id}`, payload);
  return res.data;
}

export async function getBusinesses(params = {}, signal?: AbortSignal) {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const query = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}/business?${qs}` : `${base}/business`;
  console.debug('[Business API] GET', url);
  const res = await api.get(url, { signal });
  return res.data;
}

export async function getBusinessById(id: number) {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const res = await api.get(`${base}/business/${id}`);
  return res.data;
}

export async function getHardwareById(id: number) {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  try {
    const res = await api.get(`${base}/hardware/${id}`);
    return res.data;
  } catch (err) {
    console.error('getHardwareById admin API failed', err);
    // do not fallback to superadmin from admin UI
    throw err;
  }
}

export async function deleteBusiness(id: number, canManage: boolean = false) {
  const base = getBase('DELETE', canManage);
  const res = await api.delete(`${base}/business/${id}`);
  return res.data;
}

export async function getBusinessPicOptions() {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const res = await api.get(`${base}/business/pic-options`);
  return res.data;
}

export async function getMonthlySalesStats(year?: number) {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const query = year ? `?year=${year}` : '';
  const res = await api.get(`${base}/business/monthly-stats${query}`);
  return res.data;
}
