
/**
 * iPOS Enterprise Role Management
 *
 * Company-scoped role management API contracts.
 * Follows the existing iPOS Angular module structure.
 */

export interface RoleDirectoryItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  permissionCount: number;
  assignedUserCount: number;
  rowVersion: string;
}

export interface RoleListQuery {
  search?: string;
  isActive?: boolean;
  roleType?: 'system' | 'custom';
  pageNumber?: number;
  pageSize?: number;
}

export interface RolePagedResult {
  items: RoleDirectoryItem[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface CreateRoleRequest {
  code: string;
  name: string;
  description: string | null;
}

export interface CreatedRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  rowVersion?: string;
}

export interface UpdateRoleRequest {
  name: string;
  description: string | null;
  rowVersion: string;
}

export interface UpdatedRole {
  id: number;
  name: string;
  description: string | null;
  rowVersion?: string;
}

export interface ChangeRoleStatusRequest {
  rowVersion: string;
}

export interface RoleStatus {
  id: number;
  companyId: number;
  code: string;
  name: string;
  isSystemRole: boolean;
  isActive: boolean;
  rowVersion: string;
}