// src/api/client.ts
import axios from "axios";

/** Helpers cho cookie */
function getCookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

/** Ưu tiên đọc token từ cookie rồi tới localStorage, cuối cùng là sessionStorage */
export function getAuthToken(): string | null {
  return getCookie("access_token") 
    || localStorage.getItem("access_token") 
    || sessionStorage.getItem("access_token")
    || localStorage.getItem("token");
}

// ✅ Helper để check xem token có expired không (export để dùng chung)
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = payload.exp; // JWT exp claim (Unix timestamp in seconds)
    
    if (!exp) return false; // Không có exp claim, assume valid
    
    // Convert to milliseconds và check
    const expirationTime = exp * 1000;
    const now = Date.now();
    
    // ✅ Token expired nếu thời gian hiện tại > expiration time
    return now >= expirationTime;
  } catch {
    // Nếu không parse được, assume expired để an toàn
    return true;
  }
}

// ✅ Helper để clear tất cả auth data
function clearAllAuthData() {
  // Clear localStorage
  localStorage.removeItem('access_token');
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('roles');
  localStorage.removeItem('userId');
  localStorage.removeItem('user');
  
  // Clear sessionStorage
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('username');
  sessionStorage.removeItem('roles');
  sessionStorage.removeItem('userId');
  sessionStorage.removeItem('user');
  
  // ✅ Clear cookie (quan trọng!)
  document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=qlcvtagtech.com;';
  
  // Clear axios default headers
  delete api.defaults.headers.common['Authorization'];
}
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// ✅ Flag để prevent multiple redirects khi nhiều requests cùng bị 401
let isRedirecting = false;

// ✅ Helper để check xem user có phải SUPERADMIN không
function isSuperAdminUser(): boolean {
  const isSuperAdminRole = (value: unknown): boolean => {
    if (value == null) return false;
    const raw = String(value).toUpperCase().trim();
    const compact = raw
      .replace(/^ROLE[_\s-]*/i, '')
      .replace(/[_\s-]/g, '');
    return compact === 'SUPERADMIN' || compact.includes('SUPERADMIN');
  };

  if (typeof window === 'undefined') return false;
  try {
    // Check pathname
    if (window.location.pathname.startsWith('/superadmin')) return true;
    // Check roles from localStorage/sessionStorage
    const roles = JSON.parse(localStorage.getItem('roles') || sessionStorage.getItem('roles') || '[]');
    if (Array.isArray(roles) && roles.some((r: unknown) => {
      if (typeof r === 'string') return isSuperAdminRole(r);
      if (r && typeof r === 'object') {
        const rr = r as Record<string, unknown>;
        const rn = rr.roleName ?? rr.role_name ?? rr.role ?? rr.name ?? rr.authority;
        return isSuperAdminRole(rn);
      }
      return false;
    })) {
      return true;
    }
    // Check JWT token
    const token = getAuthToken();
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const maybeRoles = payload.roles || payload.authorities || payload.role || payload.realm_access && payload.realm_access.roles;
          if (Array.isArray(maybeRoles) && maybeRoles.some((r: unknown) => {
            if (typeof r === 'string') return isSuperAdminRole(r);
            if (r && typeof r === 'object') {
              const rr = r as Record<string, unknown>;
              const rn = rr.roleName ?? rr.role_name ?? rr.role ?? rr.name ?? rr.authority;
              return isSuperAdminRole(rn);
            }
            return false;
          })) {
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

api.interceptors.request.use((config) => {
  // ✅ Auto-refresh roles từ token nếu localStorage mất (fix button ẩn issue)
  try {
    const token = getAuthToken();
    if (token && !isTokenExpired(token)) {
      const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
      if (!rolesStr) {
        // localStorage roles mất → parse từ token và sync lại
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const roles = payload.roles || payload.authorities || payload.role || [];
          if (Array.isArray(roles) && roles.length > 0) {
            const storage = localStorage.getItem('access_token') ? localStorage : sessionStorage;
            storage.setItem('roles', JSON.stringify(roles));
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors - không block request
  }
  
  // ✅ Chặn superadmin API calls từ ADMIN users (chặn từ gốc)
  // Ngoại lệ: /api/v1/superadmin/ot/** cho phép ADMIN gọi (server sẽ kiểm tra canApproveOt)
  const isSuperAdminAPI = config.url?.includes('/api/v1/superadmin/');
  const isOTApprovalAPI = config.url?.includes('/api/v1/superadmin/ot');
  if (isSuperAdminAPI && !isSuperAdminUser()) {
    if (isOTApprovalAPI) {
      // Allow ADMIN to call OT approval APIs; backend will check canApproveOt
    } else {
      return Promise.reject({
        message: 'FORBIDDEN_CLIENT: ADMIN users cannot access SUPERADMIN endpoints',
        config,
        silent: true,
      }) as any;
    }
  }

  // ✅ Không gửi token cho các API public (đăng nhập, đăng ký, quên mật khẩu, etc.)
  // Điều này tránh lỗi 401 khi token hết hạn hoặc invalid trên Server
  // Pattern matching: bắt tất cả các path bắt đầu bằng /api/v1/public/
  const isPublicPath = config.url?.startsWith('/api/v1/public/') || false;
  
  if (isPublicPath) {
    // ✅ Tắt withCredentials cho API public để browser KHÔNG gửi cookie
    // Điều này ngăn chặn việc gửi cookie access_token cũ (hết hạn) đến server
    config.withCredentials = false;
  } else {
    // ✅ Chỉ thêm token nếu KHÔNG phải là API public
    const token = getAuthToken();
    if (token) {
      // ✅ Check token expired TRƯỚC KHI gửi request
      if (isTokenExpired(token)) {
        // Token đã hết hạn → clear và redirect ngay (chỉ 1 lần)
        if (!isRedirecting) {
          isRedirecting = true;
          clearAllAuthData();
          const currentPath = window.location.pathname;
          const isAuthPage = currentPath === '/signin' || 
                            currentPath === '/signup' || 
                            currentPath === '/forgot-password' || 
                            currentPath === '/reset-password';
          
          if (!isAuthPage) {
            window.location.href = '/signin';
          }
        }
        
        // Reject request với expired token
        return Promise.reject({
          message: 'TOKEN_EXPIRED',
          config,
          silent: true,
        }) as any;
      }
      
      // Token hợp lệ → thêm vào header
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  
  return config;
});

// ✅ Response interceptor để handle 401 và 403 gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 errors (Unauthorized)
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isAuthPage = currentPath === '/signin' || 
                        currentPath === '/signup' || 
                        currentPath === '/forgot-password' || 
                        currentPath === '/reset-password';
      
      // ✅ Prevent redirect loop: không redirect nếu đang ở trang auth
      if (!isAuthPage && !isRedirecting) {
        isRedirecting = true;
        // ✅ Clear tất cả auth data (localStorage, sessionStorage, cookie, axios headers)
        clearAllAuthData();
        
        // Redirect to login (chỉ khi không ở trang auth và chưa redirect)
        window.location.href = '/signin';
      }
      
      // ✅ Suppress 401 errors cho notification API khi chưa login
      // Điều này tránh spam console với 401 errors
      const isNotificationAPI = error.config?.url?.includes('/auth/notifications');
      if (isNotificationAPI && isAuthPage) {
        // Return a silent rejection để không log error
        return Promise.reject({
          ...error,
          silent: true, // Flag để caller biết đây là error có thể ignore
        });
      }
    }
    
    // Handle 403 errors (Forbidden - Permission denied)
    if (error.response?.status === 403) {
      // Log để debug (có thể remove sau khi fix xong)
      console.warn('403 Forbidden:', error.response?.data?.message || error.message);
      // Error sẽ được propagate để component có thể hiển thị toast/notification
      // Không redirect vì đây là lỗi permission, không phải authentication
    }
    
    return Promise.reject(error);
  }
);

export default api;
