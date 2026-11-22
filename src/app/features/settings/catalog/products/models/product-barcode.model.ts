
// Company-scoped Product Barcode contracts.
// A barcode belongs to a specific Product Variant / SKU.

export interface ProductBarcode {
  id: number;
  companyId: number;
  productVariantId: number;
  barcode: string;
  isPrimary: boolean;
  isActive: boolean;

  // ASP.NET byte[] RowVersion is serialized
  // as a base64 JSON string.
  rowVersion: string;
}

export interface ProductBarcodePagedResult {
  items: ProductBarcode[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductBarcodeListQuery {
  includeInactive?: boolean;
  barcode?: string;
  isActive?: boolean;
  sortBy?: 'primary' | 'barcode' | 'id';
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductBarcodeRequest {
  barcode: string;
  isPrimary: boolean;
}

export interface ProductBarcodeConcurrencyRequest {
  rowVersion: string;
}