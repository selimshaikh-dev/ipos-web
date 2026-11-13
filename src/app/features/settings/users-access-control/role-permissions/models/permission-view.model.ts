
/**
 * iPOS — Role Permission Management
 *
 * File: permission-view.model.ts
 *
 * Purpose:
 * Presentation contracts for the Role Permissions feature.
 *
 * Architecture:
 * - API contracts remain in role-management/models/role.model.ts.
 * - This file contains view-specific types only.
 * - No API calls or business-side authorization decisions.
 *
 * Design principles:
 * - Strict typing
 * - Immutable view contracts
 * - No duplicated API models
 * - Extensible component interfaces
 */

// ============================================================
// Permission Module
// ============================================================

/**
 * Represents a permission module returned by the backend.
 *
 * Counts reflect the current permission draft, not
 * necessarily the last saved server state.
 */
export interface PermissionModuleView {
  readonly name: string;
  readonly count: number;
  readonly assigned: number;
}

// ============================================================
// Permission Selection State
// ============================================================

/**
 * The current permission selection state in the editor.
 */
export type PermissionSelectionState =
  | 'allowed'
  | 'not-allowed';

// ============================================================
// Permission Change Type
// ============================================================

/**
 * Represents a difference between the saved server state
 * and the current local draft.
 */
export type PermissionChangeType =
  | 'added'
  | 'removed'
  | 'unchanged';

// ============================================================
// Permission Row View
// ============================================================

/**
 * UI representation of one permission.
 *
 * Permission code is retained for internal operations,
 * but must not be displayed as a technical table column.
 */
export interface PermissionRowView {
  readonly code: string;
  readonly name: string;
  readonly module: string;
  readonly description: string | null;

  /**
   * Permission state currently saved on the server.
   */
  readonly originallyAssigned: boolean;

  /**
   * Permission state in the current editor draft.
   */
  readonly isAllowed: boolean;

  /**
   * Difference between original and draft state.
   */
  readonly changeType: PermissionChangeType;
}

// ============================================================
// Permission Summary
// ============================================================

/**
 * Exactly three summary metrics are displayed in the UI.
 */
export interface PermissionSummaryView {
  readonly totalModules: number;
  readonly totalPermissions: number;
  readonly grantedPermissions: number;
}

// ============================================================
// Permission Draft Changes
// ============================================================

/**
 * Tracks unsaved permission modifications.
 *
 * This is displayed in the editor footer, not as an
 * additional summary card.
 */
export interface PermissionDraftChangesView {
  readonly added: number;
  readonly removed: number;
  readonly total: number;
  readonly hasChanges: boolean;
}

// ============================================================
// Permission Scope
// ============================================================

/**
 * null represents all modules.
 * A string represents one backend-provided module.
 */
export type PermissionModuleScope = string | null;

// ============================================================
// Permission Filter
// ============================================================

/**
 * Filter values are kept aligned with the existing
 * permission matrix behavior.
 */
export type PermissionViewFilter =
  | 'all'
  | 'assigned'
  | 'unassigned'
  | 'changed';

// ============================================================
// Permission Toggle Event
// ============================================================

/**
 * Emitted by the permission matrix when a user changes
 * the state of a permission.
 */
export interface PermissionToggleEvent {
  readonly code: string;
  readonly allowed: boolean;
}

// ============================================================
// Permission Bulk Action
// ============================================================

/**
 * Emitted when a user grants or revokes permissions
 * within the currently selected module scope.
 *
 * module === null means all permissions.
 */
export interface PermissionBulkActionEvent {
  readonly module: PermissionModuleScope;
  readonly allowed: boolean;
}