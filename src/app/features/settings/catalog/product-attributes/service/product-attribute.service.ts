
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import {
  ChangeProductAttributeStatusRequest,
  ChangeProductAttributeValueStatusRequest,
  CreateProductAttributeRequest,
  CreateProductAttributeValueRequest,
  ProductAttribute,
  ProductAttributeListQuery,
  ProductAttributePagedResult,
  ProductAttributeValue,
  ProductAttributeValueListQuery,
  ProductAttributeValuePagedResult,
  UpdateProductAttributeRequest,
  UpdateProductAttributeValueRequest
} from '../models/product-attribute.model';

@Injectable({ providedIn: 'root' })
export class ProductAttributeService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiBaseUrl}/companies`;

  getProductAttributes(
    companyId: number,
    query: ProductAttributeListQuery = {}
  ): Observable<ProductAttributePagedResult> {
    const params = this.buildListParams(query);

    return this.http.get<ProductAttributePagedResult>(
      `${this.apiUrl}/${companyId}/product-attributes`,
      { params }
    );
  }

  getProductAttributeById(
    companyId: number,
    attributeId: number
  ): Observable<ProductAttribute> {
    return this.http.get<ProductAttribute>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}`
    );
  }

  createProductAttribute(
    companyId: number,
    request: CreateProductAttributeRequest
  ): Observable<ProductAttribute> {
    return this.http.post<ProductAttribute>(
      `${this.apiUrl}/${companyId}/product-attributes`,
      request
    );
  }

  updateProductAttribute(
    companyId: number,
    attributeId: number,
    request: UpdateProductAttributeRequest
  ): Observable<ProductAttribute> {
    return this.http.put<ProductAttribute>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}`,
      request
    );
  }

  activateProductAttribute(
    companyId: number,
    attributeId: number,
    request: ChangeProductAttributeStatusRequest
  ): Observable<ProductAttribute> {
    return this.http.put<ProductAttribute>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/activate`,
      request
    );
  }

  deactivateProductAttribute(
    companyId: number,
    attributeId: number,
    request: ChangeProductAttributeStatusRequest
  ): Observable<ProductAttribute> {
    return this.http.put<ProductAttribute>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/deactivate`,
      request
    );
  }

  getProductAttributeValues(
    companyId: number,
    attributeId: number,
    query: ProductAttributeValueListQuery = {}
  ): Observable<ProductAttributeValuePagedResult> {
    const params = this.buildListParams(query);

    return this.http.get<ProductAttributeValuePagedResult>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values`,
      { params }
    );
  }

  getProductAttributeValueById(
    companyId: number,
    attributeId: number,
    valueId: number
  ): Observable<ProductAttributeValue> {
    return this.http.get<ProductAttributeValue>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values/${valueId}`
    );
  }

  createProductAttributeValue(
    companyId: number,
    attributeId: number,
    request: CreateProductAttributeValueRequest
  ): Observable<ProductAttributeValue> {
    return this.http.post<ProductAttributeValue>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values`,
      request
    );
  }

  updateProductAttributeValue(
    companyId: number,
    attributeId: number,
    valueId: number,
    request: UpdateProductAttributeValueRequest
  ): Observable<ProductAttributeValue> {
    return this.http.put<ProductAttributeValue>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values/${valueId}`,
      request
    );
  }

  activateProductAttributeValue(
    companyId: number,
    attributeId: number,
    valueId: number,
    request: ChangeProductAttributeValueStatusRequest
  ): Observable<ProductAttributeValue> {
    return this.http.patch<ProductAttributeValue>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values/${valueId}/activate`,
      request
    );
  }

  deactivateProductAttributeValue(
    companyId: number,
    attributeId: number,
    valueId: number,
    request: ChangeProductAttributeValueStatusRequest
  ): Observable<ProductAttributeValue> {
    return this.http.patch<ProductAttributeValue>(
      `${this.apiUrl}/${companyId}/product-attributes/${attributeId}/values/${valueId}/deactivate`,
      request
    );
  }

  private buildListParams(
    query: ProductAttributeListQuery | ProductAttributeValueListQuery
  ): HttpParams {
    let params = new HttpParams();

    if (query.code !== undefined && query.code.trim() !== '') {
      params = params.set('code', query.code.trim());
    }

    if (query.name !== undefined && query.name.trim() !== '') {
      params = params.set('name', query.name.trim());
    }

    if (query.isActive !== undefined) {
      params = params.set('isActive', String(query.isActive));
    }

    if (query.includeInactive !== undefined) {
      params = params.set(
        'includeInactive',
        String(query.includeInactive)
      );
    }

    if (query.sortBy !== undefined) {
      params = params.set('sortBy', query.sortBy);
    }

    if (query.sortDirection !== undefined) {
      params = params.set('sortDirection', query.sortDirection);
    }

    if (query.pageNumber !== undefined) {
      params = params.set('pageNumber', String(query.pageNumber));
    }

    if (query.pageSize !== undefined) {
      params = params.set('pageSize', String(query.pageSize));
    }

    return params;
  }
}