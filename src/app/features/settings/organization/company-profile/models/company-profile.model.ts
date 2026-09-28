export interface CompanyProfile {
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
   * SQL Server rowversion returned by ASP.NET Core as Base64.
   * Required when updating the company profile.
   */
  rowVersion: string;
}


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

  /**
   * Current Base64 rowversion received from the API.
   * Used for optimistic concurrency.
   */
  rowVersion: string;
}