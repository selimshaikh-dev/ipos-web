export interface UserDirectoryItem {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
}

export interface UserPagedResult {
  items: UserDirectoryItem[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface UserListQuery {
  search?: string;
  isActive?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

// =========================================================
// User Details
// =========================================================

export interface UserDetails {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  isGlobalAccountActive: boolean;
  isCompanyAccessActive: boolean;
  createdAtUtc: string;
  lastLoginAtUtc: string | null;
}

// =========================================================
// Create / Update User
// =========================================================

// A new user receives an invitation and sets their own password.
// Administrators must never provide passwords in this request.
export interface CreateUserRequest {
  fullName: string;
  email: string;
}

export interface UpdateUserRequest {
  fullName: string;
  email: string;
}

export interface UserMutationResponse {
  id: string;
  message: string;
}

export interface UserStatusResponse {
  id: string;
  isActive: boolean;
  message: string;
}

export interface UserApiError {
  message?: string;
  errors?: string[] | null;
}