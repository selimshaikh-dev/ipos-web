
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  ChangeProductVariantStatusRequest,
  CreateProductVariantRequest,
  ProductVariant,
  ProductVariantDetails,
  ProductVariantListQuery,
  ProductVariantPagedResult,
  UpdateProductVariantRequest
} from '../models/product-variant.model';

@Injectable({
  providedIn: 'root'
})
export class ProductVariantService {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly http = inject(HttpClient);

  // =========================================================
  // API Configuration
  // =========================================================

  private readonly apiUrl =
    `${environment.apiBaseUrl}/companies`;

  // =========================================================
  // Get Product Variants
  //
  // GET /api/companies/{companyId}/products/
  //     {productId}/variants
  //
  // Features:
  // - Company and product scoped directory
  // - SKU search
  // - Active / inactive filtering
  // - Server-side sorting
  // - Server-side pagination
  //
  // Required permission:
  // - product.variant.view
  //
  // Authorization is enforced by the backend.
  // =========================================================

  getVariants(
    companyId: number,
    productId: number,
    query: ProductVariantListQuery = {}
  ): Observable<ProductVariantPagedResult> {

    let params = new HttpParams();

    if (
      query.sku !== undefined &&
      query.sku.trim() !== ''
    ) {
      params = params.set(
        'sku',
        query.sku.trim()
      );
    }

    if (query.isActive !== undefined) {
      params = params.set(
        'isActive',
        String(query.isActive)
      );
    }

    if (query.includeInactive !== undefined) {
      params = params.set(
        'includeInactive',
        String(query.includeInactive)
      );
    }

    if (query.sortBy !== undefined) {
      params = params.set(
        'sortBy',
        query.sortBy
      );
    }

    if (query.sortDirection !== undefined) {
      params = params.set(
        'sortDirection',
        query.sortDirection
      );
    }

    if (query.pageNumber !== undefined) {
      params = params.set(
        'pageNumber',
        String(query.pageNumber)
      );
    }

    if (query.pageSize !== undefined) {
      params = params.set(
        'pageSize',
        String(query.pageSize)
      );
    }

    return this.http.get<ProductVariantPagedResult>(
      this.getVariantsUrl(companyId, productId),
      { params }
    );
  }

  // =========================================================
  // Get Product Variant Details
  //
  // GET /api/companies/{companyId}/products/
  //     {productId}/variants/{variantId}
  //
  // Returns:
  // - Variant information
  // - Assigned attribute values
  // - Variant barcodes
  //
  // Required permission:
  // - product.variant.view
  // =========================================================

  getVariant(
    companyId: number,
    productId: number,
    variantId: number
  ): Observable<ProductVariantDetails> {

    return this.http.get<ProductVariantDetails>(
      `${this.getVariantsUrl(companyId, productId)}/${variantId}`
    );
  }

  // =========================================================
  // Create Product Variant
  //
  // POST /api/companies/{companyId}/products/
  //      {productId}/variants
  //
  // Required permission:
  // - product.variant.create
  //
  // Business Rules:
  // - SKU is company-wide unique.
  // - SKU is normalized by the backend.
  // - Selling price is required.
  // - Cost price is optional.
  // - Attribute combinations must be unique per product.
  // - Initial barcodes can be supplied.
  // =========================================================

  createVariant(
    companyId: number,
    productId: number,
    request: CreateProductVariantRequest
  ): Observable<ProductVariant> {

    return this.http.post<ProductVariant>(
      this.getVariantsUrl(companyId, productId),
      request
    );
  }

  // =========================================================
  // Update Product Variant
  //
  // PUT /api/companies/{companyId}/products/
  //     {productId}/variants/{variantId}
  //
  // Required permission:
  // - product.variant.update
  //
  // Editable properties:
  // - SKU
  // - SellingPrice
  // - CostPrice
  //
  // Uses RowVersion for optimistic concurrency.
  // =========================================================

  updateVariant(
    companyId: number,
    productId: number,
    variantId: number,
    request: UpdateProductVariantRequest
  ): Observable<ProductVariant> {

    return this.http.put<ProductVariant>(
      `${this.getVariantsUrl(companyId, productId)}/${variantId}`,
      request
    );
  }

  // =========================================================
  // Change Product Variant Status
  //
  // PATCH /api/companies/{companyId}/products/
  //       {productId}/variants/{variantId}/status
  //
  // Required permission:
  // - product.variant.activate, or
  // - product.variant.deactivate
  //
  // Uses RowVersion for optimistic concurrency.
  //
  // Product and variant statuses are independent.
  // =========================================================

  changeVariantStatus(
    companyId: number,
    productId: number,
    variantId: number,
    request: ChangeProductVariantStatusRequest
  ): Observable<ProductVariant> {

    return this.http.patch<ProductVariant>(
      `${this.getVariantsUrl(companyId, productId)}/${variantId}/status`,
      request
    );
  }

  // =========================================================
  // Internal URL Builder
  // =========================================================

  private getVariantsUrl(
    companyId: number,
    productId: number
  ): string {

    return `${this.apiUrl}/${companyId}/products/${productId}/variants`;
  }
}