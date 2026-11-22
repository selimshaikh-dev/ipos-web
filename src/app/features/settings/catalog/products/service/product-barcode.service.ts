
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  CreateProductBarcodeRequest,
  ProductBarcode,
  ProductBarcodeConcurrencyRequest,
  ProductBarcodeListQuery,
  ProductBarcodePagedResult
} from '../models/product-barcode.model';

@Injectable({
  providedIn: 'root'
})
export class ProductBarcodeService {

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
  // Get Product Barcodes
  //
  // GET /api/companies/{companyId}/products/
  //     {productId}/variants/{variantId}/barcodes
  //
  // Features:
  // - Company, product and variant scoped directory
  // - Barcode search
  // - Active / inactive filtering
  // - Server-side sorting and pagination
  //
  // Required permission:
  // - product.barcode.view
  //
  // Authorization is enforced by the backend.
  // =========================================================

  getBarcodes(
    companyId: number,
    productId: number,
    variantId: number,
    query: ProductBarcodeListQuery = {}
  ): Observable<ProductBarcodePagedResult> {

    let params = new HttpParams();

    if (
      query.barcode !== undefined &&
      query.barcode.trim() !== ''
    ) {
      params = params.set(
        'barcode',
        query.barcode.trim()
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

    return this.http.get<ProductBarcodePagedResult>(
      this.getBarcodesUrl(companyId, productId, variantId),
      { params }
    );
  }

  // =========================================================
  // Get Product Barcode By ID
  //
  // GET /api/companies/{companyId}/products/
  //     {productId}/variants/{variantId}/barcodes/{barcodeId}
  //
  // Required permission:
  // - product.barcode.view
  //
  // Retrieves the current RowVersion.
  // =========================================================

  getBarcode(
    companyId: number,
    productId: number,
    variantId: number,
    barcodeId: number
  ): Observable<ProductBarcode> {

    return this.http.get<ProductBarcode>(
      `${this.getBarcodesUrl(companyId, productId, variantId)}/${barcodeId}`
    );
  }

  // =========================================================
  // Create Product Barcode
  //
  // POST /api/companies/{companyId}/products/
  //      {productId}/variants/{variantId}/barcodes
  //
  // Required permission:
  // - product.barcode.create
  //
  // Business Rules:
  // - Barcode is unique within the company.
  // - Barcode is normalized by the backend.
  // - Barcode cannot contain whitespace.
  // - A barcode may be marked as primary.
  // =========================================================

  createBarcode(
    companyId: number,
    productId: number,
    variantId: number,
    request: CreateProductBarcodeRequest
  ): Observable<ProductBarcode> {

    return this.http.post<ProductBarcode>(
      this.getBarcodesUrl(companyId, productId, variantId),
      request
    );
  }

  // =========================================================
  // Set Primary Barcode
  //
  // PATCH /api/companies/{companyId}/products/
  //       {productId}/variants/{variantId}/
  //       barcodes/{barcodeId}/primary
  //
  // Required permission:
  // - product.barcode.primary.manage
  //
  // Uses RowVersion for optimistic concurrency.
  //
  // The backend enforces primary barcode uniqueness.
  // =========================================================

  setPrimaryBarcode(
    companyId: number,
    productId: number,
    variantId: number,
    barcodeId: number,
    request: ProductBarcodeConcurrencyRequest
  ): Observable<ProductBarcode> {

    return this.http.patch<ProductBarcode>(
      `${this.getBarcodesUrl(companyId, productId, variantId)}/${barcodeId}/primary`,
      request
    );
  }

  // =========================================================
  // Activate Barcode
  //
  // PATCH /api/companies/{companyId}/products/
  //       {productId}/variants/{variantId}/
  //       barcodes/{barcodeId}/activate
  //
  // Required permission:
  // - product.barcode.activate
  //
  // Uses RowVersion for optimistic concurrency.
  // =========================================================

  activateBarcode(
    companyId: number,
    productId: number,
    variantId: number,
    barcodeId: number,
    request: ProductBarcodeConcurrencyRequest
  ): Observable<ProductBarcode> {

    return this.http.patch<ProductBarcode>(
      `${this.getBarcodesUrl(companyId, productId, variantId)}/${barcodeId}/activate`,
      request
    );
  }

  // =========================================================
  // Deactivate Barcode
  //
  // PATCH /api/companies/{companyId}/products/
  //       {productId}/variants/{variantId}/
  //       barcodes/{barcodeId}/deactivate
  //
  // Required permission:
  // - product.barcode.deactivate
  //
  // Uses RowVersion for optimistic concurrency.
  // =========================================================

  deactivateBarcode(
    companyId: number,
    productId: number,
    variantId: number,
    barcodeId: number,
    request: ProductBarcodeConcurrencyRequest
  ): Observable<ProductBarcode> {

    return this.http.patch<ProductBarcode>(
      `${this.getBarcodesUrl(companyId, productId, variantId)}/${barcodeId}/deactivate`,
      request
    );
  }

  // =========================================================
  // Internal URL Builder
  // =========================================================

  private getBarcodesUrl(
    companyId: number,
    productId: number,
    variantId: number
  ): string {

    return `${this.apiUrl}/${companyId}/products/${productId}/variants/${variantId}/barcodes`;
  }
}