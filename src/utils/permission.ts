/**
 * Permission utilities - Parse roles từ JWT token (source of truth)
 * Thay vì dùng localStorage (có thể bị stale hoặc mất)
 * 
 * ⚠️ LƯU Ý: 
 * - Trong React components, NÊN dùng useAuth() hook từ AuthContext
 * - File này chỉ dùng cho non-React code (utils, API helpers)
 * 
 * @deprecated - Nên migrate sang useAuth() hook trong React components
 */

import { getAuthToken } from '../api/client';

/**
 * Parse roles từ JWT token (source of truth)
 * Fallback về localStorage nếu token không có roles
 */
export function getRolesFromToken(): string[] {
  try {
    const token = getAuthToken();
    if (!token) {
      // Fallback: Try localStorage
      try {
        const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
        if (rolesStr) {
          const roles = JSON.parse(rolesStr);
          return Array.isArray(roles) ? roles.map(normalizeRole) : [];
        }
      } catch {
        // Ignore
      }
      return [];
    }
    
    const parts = token.split('.');
    if (parts.length < 2) {
      // Invalid token format → fallback localStorage
      return getRolesFromStorage();
    }
    
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const roles = payload.roles || payload.authorities || payload.role || [];
    
    // Normalize roles
    if (Array.isArray(roles)) {
      const normalized = roles.map(normalizeRole).filter(Boolean);
      
      // ✅ Sync với localStorage để cache (nhưng token là source of truth)
      if (normalized.length > 0) {
        const storage = localStorage.getItem('access_token') ? localStorage : sessionStorage;
        storage.setItem('roles', JSON.stringify(normalized));
      }
      
      return normalized;
    }
    
    // Fallback: Try localStorage
    return getRolesFromStorage();
  } catch (e) {
    console.error('Error parsing roles from token:', e);
    // Fallback: Try localStorage
    return getRolesFromStorage();
  }
}

/**
 * Get roles from localStorage (fallback only)
 */
function getRolesFromStorage(): string[] {
  try {
    const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
    if (!rolesStr) return [];
    const roles = JSON.parse(rolesStr);
    return Array.isArray(roles) ? roles.map(normalizeRole) : [];
  } catch {
    return [];
  }
}

/**
 * Normalize role string
 */
function normalizeRole(r: any): string {
  if (typeof r === 'string') {
    return r.toUpperCase().trim();
  }
  if (r && typeof r === 'object') {
    const roleName = r.roleName || r.role_name || r.role || r.name || r.authority;
    if (typeof roleName === 'string') {
      return roleName.toUpperCase().trim();
    }
  }
  return String(r).toUpperCase().trim();
}

/**
 * Check if user has permission (từ JWT token - source of truth)
 */
export function hasPermission(requiredRoles: string[]): boolean {
  const roles = getRolesFromToken();
  const normalizedRequired = requiredRoles.map(r => r.toUpperCase().trim());
  return normalizedRequired.some(role => roles.includes(role));
}

/**
 * Check if user is SuperAdmin (từ JWT token)
 */
export function isSuperAdmin(): boolean {
  const roles = getRolesFromToken();
  return roles.some((role) => {
    const raw = String(role || '').toUpperCase().trim();
    const compact = raw
      .replace(/^ROLE[_\s-]*/i, '')
      .replace(/[_\s-]/g, '');
    return compact === 'SUPERADMIN' || compact.includes('SUPERADMIN');
  });
}

/**
 * Check if user is Admin (từ JWT token)
 * Includes SuperAdmin
 */
export function isAdmin(): boolean {
  const roles = getRolesFromToken();
  return roles.some(r => 
    r === 'ADMIN' || r === 'SUPERADMIN' || r === 'SUPER_ADMIN' || r === 'SUPER ADMIN'
  );
}

/**
 * Check if user can edit (Admin or SuperAdmin)
 */
export function canEdit(): boolean {
  return isAdmin();
}

/**
 * Check if user can delete (Admin or SuperAdmin)
 */
export function canDelete(): boolean {
  return isAdmin();
}

/**
 * Check if user can create (Admin or SuperAdmin)
 */
export function canCreate(): boolean {
  return isAdmin();
}
