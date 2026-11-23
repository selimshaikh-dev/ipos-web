
// Company-scoped Product Variant / SKU contracts.
// A variant belongs to a product and may contain
// attribute selections and barcode mappings.

export interface ProductVariant {
  id: number;
  companyId: number;
  productId: number;
  sku: string;
  sellingPrice: number;
  costPrice: number | null;
  isActive: boolean;

  // ASP.NET byte[] RowVersion is serialized
  // as a base64 JSON string.
  rowVersion: string;
}

export interface ProductVariantAttribute {
  productAttributeId: number;
  productAttributeValueId: number;
}

export interface ProductVariantBarcode {
  id: number;
  barcode: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ProductVariantDetails
  extends ProductVariant {
  attributes: ProductVariantAttribute[];
  barcodes: ProductVariantBarcode[];
}

export interface ProductVariantPagedResult {
  items: ProductVariant[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProductVariantListQuery {
  includeInactive?: boolean;
  sku?: string;
  isActive?: boolean;
  sortBy?: 'sku' | 'id';
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

export interface CreateProductVariantBarcodeRequest {
  barcode: string;
  isPrimary: boolean;
}

export interface CreateProductVariantRequest {
  // Omit or send null for backend-generated SKU.
  // A non-empty SKU requires product.variant.sku.override.
  sku?: string | null;
  sellingPrice: number;
  costPrice: number | null;
  attributes: ProductVariantAttribute[];
  barcodes: CreateProductVariantBarcodeRequest[];
}

export interface UpdateProductVariantRequest {
  sku: string;
  sellingPrice: number;
  costPrice: number | null;
  rowVersion: string;
}

export interface ChangeProductVariantStatusRequest {
  isActive: boolean;
  rowVersion: string;
}