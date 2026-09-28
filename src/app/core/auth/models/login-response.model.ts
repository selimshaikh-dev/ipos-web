export interface LoginResponse {
  accessToken: string;
  expiresAtUtc: string;
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
}