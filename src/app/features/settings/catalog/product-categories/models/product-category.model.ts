
export interface ProductCategory {
  id: number;
  companyId: number;
  code: string;
  name: string;
  parentCategoryId: number | null;
  isActive: boolean;
  rowVersion: string;
}

export interface ProductCategoryPagedResult {
  items: ProductCategory[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductCategoryListQuery {
  includeInactive?: boolean;
  code?: string;
  name?: string;
  parentCategoryId?: number;
  isActive?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductCategoryRequest {
  name: string;
  parentCategoryId: number | null;
}

export interface UpdateProductCategoryRequest {
  name: string;
  parentCategoryId: number | null;
  rowVersion: string;
}

export interface ChangeProductCategoryStatusRequest {
  rowVersion: string;
}