
/**
 * Company-scoped Product Master contracts.
 *
 * Product codes are generated automatically by the backend.
 * Users are not required to enter or remember product codes.
 */

export interface Product {
  id: number;
  companyId: number;
  code: string;
  name: string;
  description: string | null;
  categoryId: number;
  unitOfMeasureId: number;
  brandId: number | null;
  isActive: boolean;

  /**
   * ASP.NET byte[] RowVersion is serialized
   * as a base64 JSON string.
   *
   * Used for optimistic concurrency.
   */
  rowVersion: string;
}

export interface ProductPagedResult {
  items: Product[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * Product Directory search and filtering.
 *
 * The unified "search" parameter supports:
 * - Product name
 * - System-generated product code
 * - Active product variant SKU
 * - Active product barcode
 *
 * Legacy "code" and "name" filters remain available
 * for backward compatibility.
 */
export interface ProductListQuery {
  search?: string;

  includeInactive?: boolean;

  code?: string;
  name?: string;

  isActive?: boolean;

  sortBy?: 'name' | 'code' | 'id';
  sortDirection?: 'asc' | 'desc';

  pageNumber?: number;
  pageSize?: number;

  categoryId?: number;
  unitOfMeasureId?: number;
  brandId?: number;
}

/**
 * Product creation.
 *
 * Product code is intentionally excluded.
 * The backend generates it automatically.
 */
export interface CreateProductRequest {
  name: string;
  description: string | null;
  categoryId: number;
  unitOfMeasureId: number;
  brandId: number | null;
}

export interface UpdateProductRequest
  extends CreateProductRequest {
  rowVersion: string;
}

export interface ChangeProductStatusRequest {
  isActive: boolean;
  rowVersion: string;
}