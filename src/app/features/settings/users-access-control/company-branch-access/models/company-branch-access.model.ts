
export interface UserBranchAccess {
  branchId: number;
  code: string;
  name: string;
  isHeadOffice: boolean;
  isBranchActive: boolean;
  hasDirectAssignment: boolean;
  isDirectAssignmentActive: boolean;
}

export interface UserOrganizationAccess {
  userId: string;
  fullName: string;
  email: string;
  isGlobalAccountActive: boolean;
  companyId: number;
  isCompanyAccessActive: boolean;
  branches: UserBranchAccess[];
}

export interface OrganizationAccessMutationResponse {
  message: string;
}

export interface OrganizationAccessApiError {
  message?: string;
  title?: string;
  errors?: string[] | Record<string, string[]> | null;
}