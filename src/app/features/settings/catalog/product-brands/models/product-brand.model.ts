export interface ProductBrand {
  id: number;
  companyId: number;
  code: string;
  name: string;
  isActive: boolean;
  rowVersion: string;
}

export interface ProductBrandPagedResult {
  items: ProductBrand[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductBrandListQuery {
  includeInactive?: boolean;
  code?: string;
  name?: string;
  isActive?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductBrandRequest {
  name: string;
}

export interface UpdateProductBrandRequest {
  name: string;
  rowVersion: string;
}

export interface ChangeProductBrandStatusRequest {
  rowVersion: string;
}