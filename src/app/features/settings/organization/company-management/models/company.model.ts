
/**
 * Company entity returned by the iPOS backend.
 *
 * Matches CompanyDto.
 */
export interface Company {
  id: number;
  code: string;
  name: string;

  legalName: string | null;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;

  phone: string | null;
  email: string | null;
  website: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateOrProvince: string | null;
  postalCode: string | null;

  countryCode: string;
  currencyCode: string;
  timeZoneId: string;

  logoUrl: string | null;

  isActive: boolean;

  /**
   * SQL Server rowversion serialized as Base64.
   * Used for optimistic concurrency protection.
   */
  rowVersion: string;
}

/**
 * Matches CreateCompanyCommand.
 *
 * POST /api/companies
 */
export interface CreateCompanyRequest {
  code: string;
  name: string;
  currencyCode: string;
  countryCode: string;
  timeZoneId: string;
}

/**
 * Request body for updating an existing company profile.
 *
 * PUT /api/companies/{companyId}/profile
 */
export interface UpdateCompanyProfileRequest {
  name: string;

  legalName: string | null;
  registrationNumber: string | null;
  taxRegistrationNumber: string | null;

  phone: string | null;
  email: string | null;
  website: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateOrProvince: string | null;
  postalCode: string | null;

  countryCode: string;
  currencyCode: string;
  timeZoneId: string;

  logoUrl: string | null;

  rowVersion: string;
}

/**
 * Request body for changing company status.
 *
 * PATCH /api/companies/{companyId}/status
 *
 * The company ID is supplied in the URL.
 */
export interface ChangeCompanyStatusRequest {
  isActive: boolean;
  rowVersion: string;
}

/**
 * Company list item returned by GET /api/companies.
 *
 * Matches CompanyListItemDto.
 */
export interface CompanyListItem {
  id: number;
  code: string;
  name: string;
  countryCode: string;
  currencyCode: string;
  timeZoneId: string;
  isActive: boolean;
}

/**
 * Paginated company list returned by the backend.
 *
 * Matches CompanyPagedResultDto.
 */
export interface CompanyPagedResult {
  items: CompanyListItem[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/**
 * Filters, sorting and pagination parameters
 * for GET /api/companies.
 *
 * Matches GetCompaniesQuery.
 */
export interface CompanyListQuery {
  includeInactive?: boolean;
  code?: string;
  name?: string;
  countryCode?: string;
  currencyCode?: string;
  isActive?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  pageNumber?: number;
  pageSize?: number;
}

/**
 * POST /api/companies returns a limited company object,
 * not the complete CompanyDto.
 *
 * Its fields match CompanyListItem.
 */
export type CreateCompanyResponse = CompanyListItem;