
/**
 * iPOS Workspace Context
 *
 * Represents the active business workspace
 * displayed within the authenticated application.
 *
 * This model describes frontend application state.
 * It does not grant company or branch permissions.
 */

export interface WorkspaceContext {
  readonly companyId: number | null;
  readonly companyName: string;
  readonly companyCode: string | null;

  readonly branchId: number | null;
  readonly branchName: string | null;
}

/**
 * Initial workspace state before authorized
 * business context has been established.
 */
export const INITIAL_WORKSPACE_CONTEXT: WorkspaceContext = {
  companyId: null,
  companyName: '',
  companyCode: null,

  branchId: null,
  branchName: null
};