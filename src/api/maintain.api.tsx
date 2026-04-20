import api, { getAuthToken } from './client';
import { getAllUsers } from './superadmin.api';

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

export type MaintainContractResponseDTO = {
  id: number;
  contractCode: string;
  type: "Bảo trì (Maintenance)" | "Bảo hành (Warranty)";
  picUser?: { id: number; label: string; subLabel?: string; phone?: string | null } | null;
  hospital?: { id: number; label: string } | null;
  careId?: number; // ID của CustomerCareHospital
  durationYears: string; // Dạng chuỗi, ví dụ: "1 năm 6 tháng"
  yearlyPrice: number;
  totalPrice: number;
  startDate: string;
  endDate: string;
  kioskQuantity?: number | null; // Số lượng kiosk
  status: "DANG_HOAT_DONG" | "SAP_HET_HAN" | "HET_HAN" | "DA_GIA_HAN";
  linkedContract?: string | null; // Mã hợp đồng liên kết (ví dụ: "HD-2024-002")
  linkedContractId?: number | null; // ID hợp đồng liên kết
  daysLeft?: number | null; // Số ngày còn lại (có thể âm nếu quá hạn)
  createdAt?: string | null;
  updatedAt?: string | null;
  paymentStatus: "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET";
  paidAmount?: number | null; // Số tiền đã thanh toán
  paymentDate?: string | null; // Ngày thanh toán
};

export type MaintainContractRequestDTO = {
  contractCode: string;
  type: "Bảo trì (Maintenance)" | "Bảo hành (Warranty)";
  picUserId: number;
  hospitalId: number;
  careId?: number; // ID của CustomerCareHospital - bắt buộc khi tạo từ customer care page
  durationYears: string; // Dạng chuỗi để nhập "1 năm 6 tháng"
  yearlyPrice: number;
  totalPrice: number;
  kioskQuantity?: number | null; // Số lượng kiosk
  startDate?: string | null;
  endDate?: string | null;
  linkedContractId?: number | null; // ID hợp đồng liên kết (nếu có)
  paymentStatus: "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET";
  paidAmount?: number | null; // Số tiền đã thanh toán
  paymentDate?: string | null; // Ngày thanh toán
};

export async function createMaintainContract(payload: MaintainContractRequestDTO, canManage: boolean = false) {
  const base = getBase('POST', canManage);
  const res = await api.post(`${base}/maintain-contracts`, payload);
  return res.data;
}

export async function updateMaintainContract(id: number, payload: MaintainContractRequestDTO, canManage: boolean = false) {
  const base = getBase('PUT', canManage);
  const res = await api.put(`${base}/maintain-contracts/${id}`, payload);
  return res.data;
}

export async function deleteMaintainContract(id: number, canManage: boolean = false) {
  const base = getBase('DELETE', canManage);
  const res = await api.delete(`${base}/maintain-contracts/${id}`);
  return res.data;
}

export async function getMaintainContractById(id: number): Promise<MaintainContractResponseDTO> {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const res = await api.get(`${base}/maintain-contracts/${id}`);
  return res.data;
}

export async function getMaintainContracts(params: {
  search?: string;
  hospitalId?: number;
  careId?: number; // Filter by CustomerCareHospital ID
  picUserId?: number;
  status?: string; // Filter: DANG_HOAT_DONG, SAP_HET_HAN, HET_HAN, DA_GIA_HAN
  paymentStatus?: string; // Filter: CHUA_THANH_TOAN, DA_THANH_TOAN
  expiresWithinDays?: number; // Filter: contracts expiring within X days
  startDateFrom?: string; // Filter: start date from (ISO format)
  startDateTo?: string; // Filter: start date to (ISO format)
  sortBy?: string;
  sortDir?: string;
  page?: number;
  size?: number;
} = {}) {
  // ✅ GET request: luôn dùng admin API
  const base = getBase('GET', false);
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    query.append(key, String(value));
  });
  const qs = query.toString();
  const url = qs ? `${base}/maintain-contracts?${qs}` : `${base}/maintain-contracts`;
  const res = await api.get(url);
  return res.data;
}

// Helper để lấy danh sách người phụ trách (SUPERADMIN và phòng kinh doanh)
export async function getMaintainContractPicOptions() {
  try {
    // ✅ GET request: luôn dùng admin API
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

    // ✅ Lấy tất cả users và filter SUPERADMIN - CHỈ GỌI KHI USER LÀ SUPERADMIN
    let superAdminOptions: Array<{ id: number; label: string; subLabel?: string; phone?: string | null }> = [];
    // ✅ Guard: chỉ gọi getAllUsers() nếu user là SUPERADMIN
    if (isSuperAdmin()) {
      try {
        const res = await getAllUsers({ page: 0, size: 200 });
        const content = Array.isArray(res?.content)
          ? res.content
          : Array.isArray(res)
          ? res
          : [];
        superAdminOptions = content
          .filter((user: any) => {
            const roles = user?.roles;
            if (!roles) return false;
            const roleArr = Array.isArray(roles) ? roles : [];
            return roleArr.some((r: any) => {
              if (!r) return false;
              if (typeof r === 'string') return r.toUpperCase() === 'SUPERADMIN';
              const roleName = r.roleName ?? r.role_name ?? r.role;
              return typeof roleName === 'string' && roleName.toUpperCase() === 'SUPERADMIN';
            });
          })
          .map((user: any) => ({
            id: Number(user?.id ?? 0),
            label: String(user?.fullname ?? user?.fullName ?? user?.username ?? user?.email ?? `User #${user?.id ?? ''}`),
            subLabel: user?.email ? String(user.email) : undefined,
            phone: user?.phone ? String(user.phone).trim() : null,
          }));
      } catch (err) {
        // console.warn('Failed to fetch superadmin users for PIC options', err);
      }
    }

    // Merge và loại bỏ trùng lặp
    const mergedMap = new Map<number, { id: number; label: string; subLabel?: string; phone?: string | null }>();
    [...businessOptions, ...superAdminOptions].forEach((opt) => {
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
    console.error('getMaintainContractPicOptions failed', err);
    return [];
  }
}


