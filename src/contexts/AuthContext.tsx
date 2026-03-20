/**
 * AuthContext - Centralized authentication state management
 * 
 * ✅ Benefits:
 * - Single source of truth cho roles/permissions
 * - Performance: Parse JWT chỉ khi token thay đổi (useMemo)
 * - Reactive: Tự động update khi token thay đổi
 * - Safe: Dùng jwt-decode để handle UTF-8 characters
 */

import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { getAuthToken } from '../api/client';
import { switchTeam as switchTeamAPI, setCookie } from '../api/auth.api';

interface AuthContextType {
  // Existing fields
  roles: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  isLoading: boolean;

  // New team management fields
  activeTeam: string | null;
  availableTeams: string[];
  switchTeam: (teamId: string) => Promise<void>;
  isTeamSwitching: boolean;

  // New permission version fields
  permissionVersion: number;
  forceRefresh: () => void;
}

const AuthContext = createContext<AuthContextType>({
  roles: [],
  isAdmin: false,
  isSuperAdmin: false,
  canEdit: false,
  canDelete: false,
  canCreate: false,
  isLoading: true,

  // New team management fields
  activeTeam: null,
  availableTeams: [],
  switchTeam: async () => {},
  isTeamSwitching: false,

  // New permission version fields
  permissionVersion: 1,
  forceRefresh: () => {},
});

/**
 * Enhanced JWT parsing with team support and v1/v2 compatibility
 * ✅ Support both v1 and v2 JWT tokens
 * ✅ Handle UTF-8 characters properly
 * ✅ Fallback nếu không có jwt-decode library
 */
function parseJwtPayload(token: string): any {
  let payload: any;

  try {
    // ✅ Try dùng jwt-decode nếu có (khuyên dùng thư viện này)
    // Dynamic import để tránh error nếu chưa install
    try {
      // @ts-ignore - Dynamic import
      const jwtDecode = require('jwt-decode');
      payload = jwtDecode(token);
    } catch {
      // jwt-decode chưa install → fallback về manual decode
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error('Invalid token format');
    }
    
    // ✅ Decode base64 với UTF-8 support (fix atob issue)
    const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const base64 = base64Url.padEnd(base64Url.length + (4 - base64Url.length % 4) % 4, '=');
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const jsonPayload = new TextDecoder('utf-8').decode(bytes);
      payload = JSON.parse(jsonPayload);
    }

    // ✅ Support both v1 and v2 tokens
    if (payload.ver === 2) {
      // v2 token with team support
      const globalRole = payload.globalRole;
      // If globalRole is null/undefined, try to get from roles/authorities (backward compatibility)
      let roles = [globalRole].filter(Boolean); // Filter out null/undefined
      if (roles.length === 0) {
        // Fallback: try to get from roles/authorities in payload
        roles = payload.roles || payload.authorities || [];
      }
      
      const availableTeams = payload.teams || [];
      // Debug log
      console.log('[AuthContext] Parsing JWT v2:', {
        userId: payload.userId,
        username: payload.sub,
        globalRole: globalRole,
        activeTeam: payload.activeTeam,
        availableTeams: availableTeams,
        availableTeamsLength: availableTeams.length,
        teamsFromPayload: payload.teams
      });
      
      return {
        userId: payload.userId,
        username: payload.sub,
        globalRole: globalRole,
        activeTeam: payload.activeTeam,
        availableTeams: availableTeams,
        permissionVersion: payload.permVer || 1,
        roles: roles, // Use filtered roles or fallback
        version: 2,
      };
    } else {
      // v1 token fallback
      return {
        username: payload.sub,
        roles: payload.roles || payload.authorities || [],
        activeTeam: null,
        availableTeams: [],
        permissionVersion: 1,
        version: 1,
      };
    }
  } catch (e) {
    console.error('Error parsing JWT token:', e);
    throw e;
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

function isSuperAdminRoleValue(rawRole: string): boolean {
  const compact = String(rawRole || '')
    .toUpperCase()
    .trim()
    .replace(/^ROLE[_\s-]*/i, '')
    .replace(/[_\s-]/g, '');
  return compact === 'SUPERADMIN' || compact.includes('SUPERADMIN');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTeamSwitching, setIsTeamSwitching] = useState(false);

  // ✅ Listen for token changes (khi login/logout)
  useEffect(() => {
    const updateToken = () => {
      const currentToken = getAuthToken();
      setToken(currentToken);
      setIsLoading(false);
    };

    // Initial load
    updateToken();

    // ✅ Listen for storage events (khi token thay đổi ở tab khác)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'access_token' || e.key === 'token') {
        updateToken();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // ✅ Polling để detect token changes (fallback nếu storage event không fire)
    const interval = setInterval(updateToken, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // ✅ Parse JWT và tính toán auth state (chỉ khi token thay đổi)
  const authState = useMemo(() => {
    try {
      if (!token) {
        return {
          roles: [],
          isAdmin: false,
          isSuperAdmin: false,
          canEdit: false,
          canDelete: false,
          canCreate: false,
          isLoading: false,

          // Team management fields
          activeTeam: null,
          availableTeams: [],
          switchTeam: async () => {},
          isTeamSwitching: false,

          // Permission version fields
          permissionVersion: 1,
          forceRefresh: () => {},
        };
      }

      // ✅ Parse JWT token with v1/v2 support
      const decoded: any = parseJwtPayload(token);
      
      // ✅ Extract roles từ parsed payload
      const roles = decoded.roles || [];
      const normalizedRoles = Array.isArray(roles)
        ? roles.map(normalizeRole).filter(Boolean)
        : [];

      // ✅ Check permissions
      const isSuperAdmin = normalizedRoles.some((r: string) =>
        isSuperAdminRoleValue(r)
      );
      const isAdmin = normalizedRoles.some((r: string) =>
        r === 'ADMIN' || isSuperAdmin
      );

      // ✅ Team management data from JWT
      const activeTeam = decoded.activeTeam || null;
      const availableTeams = decoded.availableTeams || [];
      const permissionVersion = decoded.permissionVersion || 1;

      // ✅ Sync với localStorage để cache (nhưng token là source of truth)
      if (normalizedRoles.length > 0) {
        const storage = localStorage.getItem('access_token') ? localStorage : sessionStorage;
        try {
          storage.setItem('roles', JSON.stringify(normalizedRoles));
          if (activeTeam) storage.setItem('activeTeam', activeTeam);
          if (availableTeams.length > 0) storage.setItem('availableTeams', JSON.stringify(availableTeams));
        } catch {
          // Ignore storage errors
        }
      }

      return {
        roles: normalizedRoles,
        isSuperAdmin,
        isAdmin,
        canEdit: isAdmin,
        canDelete: isAdmin,
        canCreate: isAdmin,
        isLoading: false,

        // Team management fields
        activeTeam,
        availableTeams,
        switchTeam: async (teamId: string) => {
          try {
            setIsTeamSwitching(true);

            // Validate team access
            if (!availableTeams.includes(teamId)) {
              throw new Error('User không thuộc team này');
            }

            // Call backend API to switch team
            const response = await switchTeamAPI({ teamId });

            // If backend returns new token, update it
            if (response.newToken) {
              localStorage.setItem('access_token', response.newToken);
              
              // Also update cookie (for consistency with login flow)
              setCookie('access_token', response.newToken, 7);
              
              // Force token refresh to update auth state
              setToken(response.newToken);
            } else {
              // Force refresh to get updated token from backend
              setToken(getAuthToken());
            }

            // Clear team-specific data from localStorage (if needed)
            // This can be extended based on requirements

          } catch (error) {
            console.error('Team switch failed:', error);
            throw error;
          } finally {
            setIsTeamSwitching(false);
          }
        },
        isTeamSwitching,

        // Permission version fields
        permissionVersion,
        forceRefresh: () => {
          // Force refresh token
          setToken(getAuthToken());
        },
      };
    } catch (e) {
      console.error('Error parsing auth state:', e);
      // ✅ Fallback: Try localStorage
      try {
        const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
        const activeTeamStr = localStorage.getItem('activeTeam') || sessionStorage.getItem('activeTeam');
        const availableTeamsStr = localStorage.getItem('availableTeams') || sessionStorage.getItem('availableTeams');

        if (rolesStr) {
          const roles = JSON.parse(rolesStr).map(normalizeRole);
          const isSuperAdmin = roles.some((r: string) => 
            isSuperAdminRoleValue(r)
          );
          const isAdmin = roles.some((r: string) => 
            r === 'ADMIN' || isSuperAdmin
          );

          const activeTeam = activeTeamStr || null;
          const availableTeams = availableTeamsStr ? JSON.parse(availableTeamsStr) : [];
          
          return {
            roles,
            isSuperAdmin,
            isAdmin,
            canEdit: isAdmin,
            canDelete: isAdmin,
            canCreate: isAdmin,
            isLoading: false,

            // Team management fields
            activeTeam,
            availableTeams,
            switchTeam: async () => {},
            isTeamSwitching: false,

            // Permission version fields
            permissionVersion: 1,
            forceRefresh: () => {},
          };
        }
      } catch {
        // Ignore
      }
      
      return {
        roles: [],
        isAdmin: false,
        isSuperAdmin: false,
        canEdit: false,
        canDelete: false,
        canCreate: false,
        isLoading: false,

        // Team management fields
        activeTeam: null,
        availableTeams: [],
        switchTeam: async () => {},
        isTeamSwitching: false,

        // Permission version fields
        permissionVersion: 1,
        forceRefresh: () => {},
      };
    }
  }, [token, isTeamSwitching]); // ✅ Tính toán lại khi token hoặc team switching state thay đổi

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom Hook để dùng auth state trong component
 * 
 * @example
 * ```tsx
 * const { canEdit, isSuperAdmin } = useAuth();
 * {canEdit && <button>Edit</button>}
 * ```
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

/**
 * Helper function để check permission (dùng khi không có access đến React context)
 * ⚠️ Lưu ý: Chỉ dùng cho non-React code (utils, API helpers)
 * ✅ Trong React components, nên dùng useAuth() hook
 */
export function getRolesFromToken(): string[] {
  try {
    const token = getAuthToken();
    if (!token) {
      // Fallback localStorage
      try {
        const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
        if (rolesStr) {
          return JSON.parse(rolesStr).map(normalizeRole);
        }
      } catch {
        // Ignore
      }
      return [];
    }

    const decoded: any = parseJwtPayload(token);
    const roles = decoded.roles || [];
    const normalizedRoles = Array.isArray(roles)
      ? roles.map(normalizeRole).filter(Boolean)
      : [];

    // Sync với localStorage
    if (normalizedRoles.length > 0) {
      const storage = localStorage.getItem('access_token') ? localStorage : sessionStorage;
      try {
        storage.setItem('roles', JSON.stringify(normalizedRoles));
      } catch {
        // Ignore
      }
    }

    return normalizedRoles;
  } catch (e) {
    console.error('Error getting roles from token:', e);
    // Fallback localStorage
    try {
      const rolesStr = localStorage.getItem('roles') || sessionStorage.getItem('roles');
      if (rolesStr) {
        return JSON.parse(rolesStr).map(normalizeRole);
      }
    } catch {
      // Ignore
    }
    return [];
  }
}

/**
 * Helper functions để check permissions (dùng khi không có access đến React context)
 * ⚠️ Lưu ý: Trong React components, nên dùng useAuth() hook
 */
export function isSuperAdmin(): boolean {
  const roles = getRolesFromToken();
  return roles.some((r: string) => isSuperAdminRoleValue(r));
}

export function isAdmin(): boolean {
  const roles = getRolesFromToken();
  return roles.some((r: string) => 
    r === 'ADMIN' || r === 'SUPERADMIN' || r === 'SUPER_ADMIN' || r === 'SUPER ADMIN'
  );
}

export function canEdit(): boolean {
  return isAdmin();
}

export function canDelete(): boolean {
  return isAdmin();
}

export function canCreate(): boolean {
  return isAdmin();
}

/**
 * Helper function để get active team từ token
 * ✅ Dùng khi không có access đến React context
 */
export function getActiveTeamFromToken(): string | null {
  try {
    const token = getAuthToken();
    if (!token) {
      return localStorage.getItem('activeTeam') || sessionStorage.getItem('activeTeam') || null;
    }

    const decoded: any = parseJwtPayload(token);
    return decoded.activeTeam || null;
  } catch (e) {
    console.error('Error getting active team from token:', e);
    return localStorage.getItem('activeTeam') || sessionStorage.getItem('activeTeam') || null;
  }
}

/**
 * Helper function để get available teams từ token
 * ✅ Dùng khi không có access đến React context
 */
export function getAvailableTeamsFromToken(): string[] {
  try {
    const token = getAuthToken();
    if (!token) {
      const teamsStr = localStorage.getItem('availableTeams') || sessionStorage.getItem('availableTeams');
      return teamsStr ? JSON.parse(teamsStr) : [];
    }

    const decoded: any = parseJwtPayload(token);
    return decoded.availableTeams || [];
  } catch (e) {
    console.error('Error getting available teams from token:', e);
    const teamsStr = localStorage.getItem('availableTeams') || sessionStorage.getItem('availableTeams');
    return teamsStr ? JSON.parse(teamsStr) : [];
  }
}

/**
 * Helper function để get permission version từ token
 * ✅ Dùng khi không có access đến React context
 */
export function getPermissionVersionFromToken(): number {
  try {
    const token = getAuthToken();
    if (!token) {
      return 1;
    }

    const decoded: any = parseJwtPayload(token);
    return decoded.permissionVersion || 1;
  } catch (e) {
    console.error('Error getting permission version from token:', e);
    return 1;
  }
}
