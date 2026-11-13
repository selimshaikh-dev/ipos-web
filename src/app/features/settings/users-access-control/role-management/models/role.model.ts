
/**
 * =============================================================
 * iPOS Enterprise Role & Permission Management
 * =============================================================
 *
 * Architecture:
 * - Company-scoped Role Management
 * - System Role Protection
 * - Hybrid Permission Management
 * - Expandable Module Tree
 * - Dynamic Permission Matrix
 * - Optimistic Concurrency
 *
 * All API contracts follow the existing iPOS backend.
 *
 * UI-only models are separated from API contracts.
 * =============================================================
 */

// =============================================================
// 01. ROLE DIRECTORY
// =============================================================

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

export type RoleTypeFilter =
  | 'system'
  | 'custom';

export interface RoleListQuery {
  search?: string;
  isActive?: boolean;
  roleType?: RoleTypeFilter;
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

// =============================================================
// 02. CREATE ROLE
// =============================================================

export interface CreateRoleRequest {
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

// =============================================================
// 03. UPDATE ROLE
// =============================================================

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

// =============================================================
// 04. ROLE STATUS MANAGEMENT
// =============================================================

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

// =============================================================
// 05. ROLE PERMISSION API CONTRACTS
// =============================================================

/**
 * Individual permission returned by the backend.
 */
export interface RolePermissionItem {
  code: string;
  name: string;
  module: string;
  description: string;
  isAssigned: boolean;
}

/**
 * GET /api/companies/{companyId}/roles/{roleId}/permissions
 *
 * For system roles, companyId is null.
 */
export interface RolePermissions {
  roleId: number;
  companyId: number | null;
  roleCode: string;
  roleName: string;
  isSystemRole: boolean;
  isActive: boolean;
  rowVersion: string;
  permissions: RolePermissionItem[];
}

/**
 * PUT /api/companies/{companyId}/roles/{roleId}/permissions
 *
 * Full replacement:
 * - Included codes are granted.
 * - Omitted codes are revoked.
 * - Empty array revokes all permissions.
 *
 * RowVersion is a Base64 encoded concurrency token.
 */
export interface UpdateRolePermissionsRequest {
  permissionCodes: string[];
  rowVersion: string;
}

/**
 * Successful permission update response.
 */
export interface UpdatedRolePermissions {
  roleId: number;
  companyId: number;
  roleCode: string;
  roleName: string;
  permissionCodes: string[];
  rowVersion: string;
}

// =============================================================
// 06. HYBRID PERMISSION MANAGEMENT UI TYPES
// =============================================================

/**
 * Permission management UI mode.
 *
 * System roles are read-only.
 * Custom roles can be editable when active and authorized.
 */
export type PermissionEditorMode =
  | 'view'
  | 'edit';

/**
 * Permission selection state.
 *
 * Used for:
 * - Module selection
 * - Group selection
 * - Bulk permission selection
 */
export type PermissionSelectionState =
  | 'none'
  | 'partial'
  | 'all';

/**
 * Permission grouping level.
 *
 * Supports an expandable hierarchy:
 *
 * Module
 *   -> Group
 *      -> Permission
 */
export type PermissionTreeNodeType =
  | 'module'
  | 'group'
  | 'permission';

/**
 * UI-only permission item.
 *
 * This model must not be submitted directly to the API.
 */
export interface PermissionMatrixItem {
  code: string;
  name: string;
  module: string;
  description: string;

  /**
   * Current draft selection.
   */
  isAssigned: boolean;

  /**
   * Original server selection.
   * Used to calculate unsaved changes.
   */
  wasAssigned: boolean;

  /**
   * Whether the item can be changed in the UI.
   */
  isDisabled: boolean;

  /**
   * Optional UI grouping key.
   */
  groupKey?: string;

  /**
   * Optional UI grouping label.
   */
  groupName?: string;
}

/**
 * Group of permissions within a module.
 *
 * Example:
 * Module: Security
 * Group: Role Management
 */
export interface PermissionMatrixGroup {
  key: string;
  name: string;
  moduleKey: string;
  permissions: PermissionMatrixItem[];

  totalCount: number;
  assignedCount: number;
  selectionState: PermissionSelectionState;
}

/**
 * Module displayed in the expandable tree.
 */
export interface PermissionModuleNode {
  key: string;
  name: string;

  /**
   * Icon identifier for the presentation layer.
   * No specific icon library is required by this model.
   */
  icon?: string;

  /**
   * True when the module is expanded.
   */
  isExpanded: boolean;

  /**
   * True when the module is selected.
   */
  isSelected: boolean;

  /**
   * Permission groups belonging to this module.
   */
  groups: PermissionMatrixGroup[];

  totalCount: number;
  assignedCount: number;
  selectionState: PermissionSelectionState;
}

/**
 * Generic tree node.
 *
 * Allows the UI to render:
 * - Module
 * - Group
 * - Permission
 *
 * without hardcoding the permission hierarchy.
 */
export interface PermissionTreeNode {
  key: string;
  label: string;
  type: PermissionTreeNodeType;
  parentKey: string | null;
  level: number;

  isExpanded: boolean;
  isSelected: boolean;
  isDisabled: boolean;

  totalCount: number;
  assignedCount: number;
  selectionState: PermissionSelectionState;

  children: PermissionTreeNode[];
}

/**
 * Available matrix view modes.
 */
export type PermissionMatrixViewMode =
  | 'all'
  | 'assigned'
  | 'unassigned'
  | 'changed';

/**
 * Matrix filter state.
 */
export interface PermissionMatrixFilter {
  search: string;
  viewMode: PermissionMatrixViewMode;
  selectedModuleKey: string | null;
  selectedGroupKey: string | null;
}

/**
 * Current permission editor state.
 */
export interface PermissionEditorState {
  roleId: number;
  companyId: number;

  roleCode: string;
  roleName: string;

  isSystemRole: boolean;
  isActive: boolean;

  mode: PermissionEditorMode;

  /**
   * Version loaded from the server.
   */
  rowVersion: string;

  /**
   * Original permission codes from the server.
   */
  originalPermissionCodes: string[];

  /**
   * Draft permission codes.
   */
  selectedPermissionCodes: string[];

  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;

  errorMessage: string | null;
}

/**
 * Permission changes made in the editor.
 */
export interface PermissionChangeSet {
  addedCodes: string[];
  removedCodes: string[];
  unchangedCodes: string[];

  addedCount: number;
  removedCount: number;
  totalSelectedCount: number;
  hasChanges: boolean;
}

/**
 * Dashboard summary for the permission editor.
 */
export interface PermissionMatrixSummary {
  totalModules: number;
  totalGroups: number;
  totalPermissions: number;

  assignedPermissions: number;
  unassignedPermissions: number;

  changedPermissions: number;
  addedPermissions: number;
  removedPermissions: number;
}

/**
 * UI state for module expansion.
 */
export interface PermissionTreeExpansionState {
  expandedModuleKeys: string[];
  expandedGroupKeys: string[];
}

/**
 * UI state for bulk permission operations.
 */
export interface PermissionBulkSelection {
  scope: 'all' | 'module' | 'group';
  moduleKey?: string;
  groupKey?: string;

  action: 'grant' | 'revoke';
}

/**
 * UI representation of a permission update conflict.
 *
 * A 409 response means the current editor version
 * is no longer valid.
 *
 * The UI should reload the permission matrix
 * before allowing another save.
 */
export interface PermissionConcurrencyConflict {
  roleId: number;
  companyId: number;
  message: string;
  requiresReload: boolean;
}

// =============================================================
// 07. PERMISSION MATRIX UTILITIES
// =============================================================

/**
 * Calculates tri-state selection.
 *
 * No permissions selected  -> none
 * Some permissions selected -> partial
 * All permissions selected  -> all
 */
export function getPermissionSelectionState(
  assignedCount: number,
  totalCount: number
): PermissionSelectionState {

  if (totalCount <= 0 || assignedCount <= 0) {
    return 'none';
  }

  if (assignedCount >= totalCount) {
    return 'all';
  }

  return 'partial';
}

/**
 * Calculates permission changes.
 *
 * The result can be used to:
 * - Display unsaved changes
 * - Show grant/revoke counts
 * - Enable or disable Save
 * - Display confirmation details
 */
export function calculatePermissionChanges(
  originalCodes: readonly string[],
  selectedCodes: readonly string[]
): PermissionChangeSet {

  const original = new Set(originalCodes);
  const selected = new Set(selectedCodes);

  const addedCodes = [...selected].filter(
    code => !original.has(code)
  );

  const removedCodes = [...original].filter(
    code => !selected.has(code)
  );

  const unchangedCodes = [...selected].filter(
    code => original.has(code)
  );

  return {
    addedCodes,
    removedCodes,
    unchangedCodes,

    addedCount: addedCodes.length,
    removedCount: removedCodes.length,

    totalSelectedCount: selected.size,

    hasChanges:
      addedCodes.length > 0 ||
      removedCodes.length > 0
  };
}

/**
 * Builds the full-replacement API request.
 *
 * The backend receives the complete desired permission
 * set, not only the changed permissions.
 */
export function buildPermissionUpdateRequest(
  selectedCodes: readonly string[],
  rowVersion: string
): UpdateRolePermissionsRequest {

  return {
    permissionCodes: [...new Set(selectedCodes)].sort(),
    rowVersion
  };
}

/**
 * Converts a permission code into a readable label.
 *
 * Example:
 * role.permissions.manage -> Role Permissions Manage
 *
 * Prefer the Name supplied by the backend whenever
 * it is available.
 */
export function formatPermissionCode(
  code: string
): string {

  return code
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word =>
      word.charAt(0).toUpperCase() +
      word.slice(1)
    )
    .join(' ');
}