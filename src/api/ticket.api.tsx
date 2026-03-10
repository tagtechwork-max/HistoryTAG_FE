import api, { getAuthToken } from './client';
import { isSuperAdmin as isSuperAdminPermission } from '../utils/permission';

// ✅ Helper để check xem user có phải SUPERADMIN không (từ JWT token - source of truth)
function isSuperAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
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
  // ✅ Write operations (POST, PUT, DELETE): chỉ dùng superadmin API nếu canManage = true
  if (canManage && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    // Double check: chỉ dùng superadmin API nếu thực sự là superadmin
    if (isSuperAdmin()) {
      return '/api/v1/superadmin';
    }
  }
  // Fallback: dùng admin API
  return '/api/v1/admin';
}

// =======================================================
// TYPES
// =======================================================

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
  hospitalName?: string | null; // Tên bệnh viện (cho getAllTickets)
  createdBy: string | null; // Tên người tạo ticket
  createdById: number | null; // ID của User tạo ticket
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

// =======================================================
// CRUD APIs
// =======================================================

/**
 * Lấy toàn bộ danh sách tickets từ tất cả bệnh viện (với filter)
 * Fallback implementation: Load hospitals summary rồi merge tickets
 */
export async function getAllTickets(params?: TicketFilterParams): Promise<TicketResponseDTO[]> {
  try {
    // Try the direct endpoint first
    const base = getBase('GET', false);
    const queryParams = new URLSearchParams();
    
    if (params?.hospitalId) queryParams.append('hospitalId', params.hospitalId.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.priority) queryParams.append('priority', params.priority);
    if (params?.ticketType) queryParams.append('ticketType', params.ticketType);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page !== undefined) queryParams.append('page', params.page.toString());
    if (params?.size !== undefined) queryParams.append('size', params.size.toString());
    
    const queryString = queryParams.toString();
    const url = `${base}/tickets${queryString ? '?' + queryString : ''}`;
    
    const res = await api.get(url);
    return Array.isArray(res.data) ? res.data : [];
  } catch (error: any) {
    // If endpoint doesn't exist (404), use fallback approach
    if (error.response?.status === 404) {
      console.log('Tickets endpoint not found, using fallback approach...');
      return await getAllTicketsFallback();
    }
    throw error;
  }
}

/**
 * Fallback: Load tickets từ tất cả hospitals bằng cách:
 * 1. Lấy danh sách hospitals từ summary API
 * 2. Load tickets cho từng hospital
 * 3. Merge tất cả lại
 */
async function getAllTicketsFallback(): Promise<TicketResponseDTO[]> {
  try {
    // Get hospitals summary
    const summaryRes = await api.get('/api/v1/admin/maintenance/hospitals/summary');
    const hospitals = Array.isArray(summaryRes.data) ? summaryRes.data : [];
    
    if (hospitals.length === 0) {
      return [];
    }
    
    // Load tickets for all hospitals in parallel
    const ticketPromises = hospitals.map(async (hospital: any) => {
      try {
        const hospitalId = hospital.hospitalId || hospital.id;
        if (!hospitalId) return [];
        
        const tickets = await getHospitalTickets(hospitalId);
        
        // Add hospitalName to each ticket
        return tickets.map(ticket => ({
          ...ticket,
          hospitalName: hospital.hospitalName || hospital.name || `Hospital ${hospitalId}`
        }));
      } catch (err) {
        console.error(`Error loading tickets for hospital ${hospital.hospitalId}:`, err);
        return [];
      }
    });
    
    const ticketArrays = await Promise.all(ticketPromises);
    const allTickets = ticketArrays.flat();
    
    return allTickets;
  } catch (error) {
    console.error('Error in getAllTicketsFallback:', error);
    return [];
  }
}

/**
 * Lấy danh sách tickets của một hospital
 */
export async function getHospitalTickets(hospitalId: number): Promise<TicketResponseDTO[]> {
  const base = getBase('GET', false);
  const res = await api.get(`${base}/hospitals/${hospitalId}/tickets`);
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * Tạo ticket mới cho hospital
 */
export async function createHospitalTicket(
  hospitalId: number,
  payload: TicketRequestDTO,
  canManage: boolean = false
): Promise<TicketResponseDTO> {
  const base = getBase('POST', canManage);
  const res = await api.post(`${base}/hospitals/${hospitalId}/tickets`, payload);
  return res.data;
}

/**
 * Cập nhật ticket
 */
export async function updateHospitalTicket(
  hospitalId: number,
  ticketId: number,
  payload: TicketRequestDTO,
  canManage: boolean = false
): Promise<TicketResponseDTO> {
  const base = getBase('PUT', canManage);
  const res = await api.put(`${base}/hospitals/${hospitalId}/tickets/${ticketId}`, payload);
  return res.data;
}

/**
 * Xóa ticket
 */
export async function deleteHospitalTicket(
  hospitalId: number,
  ticketId: number,
  canManage: boolean = false
): Promise<void> {
  const base = getBase('DELETE', canManage);
  await api.delete(`${base}/hospitals/${hospitalId}/tickets/${ticketId}`);
}
