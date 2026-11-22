
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  ChangeProductStatusRequest,
  CreateProductRequest,
  Product,
  ProductListQuery,
  ProductPagedResult,
  UpdateProductRequest
} from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

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
  // Get Products
  //
  // GET /api/companies/{companyId}/products
  //
  // Features:
  // - Company-scoped product directory
  // - Unified search by:
  //   * Product name
  //   * Product code
  //   * Active variant SKU
  //   * Active product barcode
  // - Legacy code and name filters
  // - Category, UOM and brand filtering
  // - Active / inactive filtering
  // - Server-side sorting and pagination
  //
  // Required permission:
  // - product.view
  //
  // Authorization is enforced by the backend.
  // =========================================================

  getProducts(
    companyId: number,
    query: ProductListQuery = {}
  ): Observable<ProductPagedResult> {

    let params = new HttpParams();

    // ---------------------------------------------------------
    // Unified Product Search
    //
    // This is the preferred search parameter for the
    // Product Directory.
    //
    // Product code entry is never mandatory.
    // ---------------------------------------------------------

    const search = query.search?.trim();

    if (search) {
      params = params.set('search', search);
    }

    // ---------------------------------------------------------
    // Legacy Advanced Filters
    //
    // Preserved for backward compatibility.
    // ---------------------------------------------------------

    const code = query.code?.trim();

    if (code) {
      params = params.set('code', code);
    }

    const name = query.name?.trim();

    if (name) {
      params = params.set('name', name);
    }

    // ---------------------------------------------------------
    // Category / UOM / Brand Filters
    // ---------------------------------------------------------

    if (query.categoryId !== undefined) {
      params = params.set(
        'categoryId',
        String(query.categoryId)
      );
    }

    if (query.unitOfMeasureId !== undefined) {
      params = params.set(
        'unitOfMeasureId',
        String(query.unitOfMeasureId)
      );
    }

    if (query.brandId !== undefined) {
      params = params.set(
        'brandId',
        String(query.brandId)
      );
    }

    // ---------------------------------------------------------
    // Status Filters
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // Sorting
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // Pagination
    // ---------------------------------------------------------

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

    return this.http.get<ProductPagedResult>(
      `${this.apiUrl}/${companyId}/products`,
      { params }
    );
  }

  // =========================================================
  // Get Product By ID
  //
  // GET /api/companies/{companyId}/products/{productId}
  //
  // Required permission:
  // - product.view
  //
  // Retrieves current RowVersion for concurrency.
  // =========================================================

  getProduct(
    companyId: number,
    productId: number
  ): Observable<Product> {

    return this.http.get<Product>(
      `${this.apiUrl}/${companyId}/products/${productId}`
    );
  }

  // =========================================================
  // Create Product
  //
  // POST /api/companies/{companyId}/products
  //
  // Required permission:
  // - product.create
  //
  // Product code is generated by the backend.
  // Category and UOM are required.
  // Brand is optional.
  // =========================================================

  createProduct(
    companyId: number,
    request: CreateProductRequest
  ): Observable<Product> {

    return this.http.post<Product>(
      `${this.apiUrl}/${companyId}/products`,
      request
    );
  }

  // =========================================================
  // Update Product
  //
  // PUT /api/companies/{companyId}/products/{productId}
  //
  // Required permission:
  // - product.update
  //
  // Uses RowVersion for optimistic concurrency.
  // Product code and company ID are immutable.
  // =========================================================

  updateProduct(
    companyId: number,
    productId: number,
    request: UpdateProductRequest
  ): Observable<Product> {

    return this.http.put<Product>(
      `${this.apiUrl}/${companyId}/products/${productId}`,
      request
    );
  }

  // =========================================================
  // Change Product Status
  //
  // PATCH /api/companies/{companyId}/products/{productId}/status
  //
  // Required permission:
  // - product.activate, or
  // - product.deactivate
  //
  // Uses RowVersion for optimistic concurrency.
  // Does not cascade status changes to variants.
  // =========================================================

  changeProductStatus(
    companyId: number,
    productId: number,
    request: ChangeProductStatusRequest
  ): Observable<Product> {

    return this.http.patch<Product>(
      `${this.apiUrl}/${companyId}/products/${productId}/status`,
      request
    );
  }
}