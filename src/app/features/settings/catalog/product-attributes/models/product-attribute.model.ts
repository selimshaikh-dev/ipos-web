
export interface ProductAttribute {
  id: number;
  companyId: number;
  code: string;
  name: string;
  isActive: boolean;
  rowVersion: string;
}

export interface ProductAttributePagedResult {
  items: ProductAttribute[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductAttributeListQuery {
  includeInactive?: boolean;
  code?: string;
  name?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'code' | 'id';
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductAttributeRequest {
  name: string;
}

export interface UpdateProductAttributeRequest {
  name: string;
  rowVersion: string;
}

export interface ChangeProductAttributeStatusRequest {
  rowVersion: string;
}

export interface ProductAttributeValue {
  id: number;
  companyId: number;
  productAttributeId: number;
  code: string;
  name: string;
  isActive: boolean;
  rowVersion: string;
}

export interface ProductAttributeValuePagedResult {
  items: ProductAttributeValue[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductAttributeValueListQuery {
  includeInactive?: boolean;
  code?: string;
  name?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'code' | 'id';
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductAttributeValueRequest {
  name: string;
}

export interface UpdateProductAttributeValueRequest {
  name: string;
  rowVersion: string;
}

export interface ChangeProductAttributeValueStatusRequest {
  rowVersion: string;
}