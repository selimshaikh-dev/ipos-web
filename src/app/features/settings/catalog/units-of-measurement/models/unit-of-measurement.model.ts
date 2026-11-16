
/**
 * Unit of Measurement Management Models
 *
 * Backend:
 * iPOS.Api
 *
 * API Route:
 * /api/companies/{companyId}/units-of-measurement
 *
 * Units of measurement are company-scoped.
 *
 * UOM codes are supplied during creation and
 * cannot be modified through the update API.
 */

// =========================================================
// Unit of Measurement Entity / API Response
// =========================================================

export interface UnitOfMeasure {
  id: number;
  companyId: number;

  code: string;
  name: string;
  symbol: string;

  isActive: boolean;

  /**
   * Base64-encoded SQL Server RowVersion.
   *
   * Required for optimistic concurrency during
   * update, activate and deactivate operations.
   */
  rowVersion: string;
}

// =========================================================
// Create Unit of Measurement Request
// =========================================================

export interface CreateUnitOfMeasureRequest {
  code: string;
  name: string;
  symbol: string;
}

// =========================================================
// Unit of Measurement List Query
// =========================================================

export interface UnitOfMeasureListQuery {
  code?: string;
  name?: string;
  symbol?: string;

  isActive?: boolean;
  includeInactive?: boolean;

  sortBy?: string;
  sortDirection?: 'asc' | 'desc';

  pageNumber?: number;
  pageSize?: number;
}

// =========================================================
// Unit of Measurement Paged Result
// =========================================================

export interface UnitOfMeasurePagedResult {
  items: UnitOfMeasure[];

  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;

  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// =========================================================
// Update Unit of Measurement Request
// =========================================================

export interface UpdateUnitOfMeasureRequest {
  name: string;
  symbol: string;

  rowVersion: string;
}

// =========================================================
// Unit of Measurement Status Change Request
// =========================================================

export interface ChangeUnitOfMeasureStatusRequest {
  rowVersion: string;
}