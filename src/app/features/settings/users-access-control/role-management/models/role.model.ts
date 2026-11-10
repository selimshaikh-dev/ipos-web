
/**
 * iPOS Enterprise Role Management
 *
 * Contracts for the company-scoped Roles Directory.
 * Property names follow the backend API response.
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