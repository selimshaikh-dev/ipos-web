
import { Injectable } from '@angular/core';

import { AuthUser } from '../models/auth-user.model';

@Injectable({
  providedIn: 'root'
})
export class TokenService {

  // =========================================================
  // Storage Keys
  // =========================================================

  private readonly accessTokenKey =
    'ipos_access_token';

  private readonly expiresAtKey =
    'ipos_access_token_expires_at';

  private readonly userKey =
    'ipos_auth_user';

  // =========================================================
  // Access Token Storage
  // =========================================================

  setAccessToken(
    accessToken: string,
    expiresAtUtc: string
  ): void {

    sessionStorage.setItem(
      this.accessTokenKey,
      accessToken
    );

    sessionStorage.setItem(
      this.expiresAtKey,
      expiresAtUtc
    );
  }

  getAccessToken(): string | null {

    return sessionStorage.getItem(
      this.accessTokenKey
    );
  }

  // =========================================================
  // Token Expiration
  // =========================================================

  /**
   * Returns the expiration timestamp in milliseconds.
   *
   * Invalid or missing expiration values return null.
   */
  getAccessTokenExpiresAt(): number | null {

    const value = sessionStorage.getItem(
      this.expiresAtKey
    );

    if (!value) {
      return null;
    }

    const expiresAt = Date.parse(value);

    if (!Number.isFinite(expiresAt)) {
      return null;
    }

    return expiresAt;
  }

  /**
   * Checks whether the stored access token has expired.
   *
   * Does not clear authentication data.
   * Refresh handling belongs to the authentication flow.
   */
  isAccessTokenExpired(): boolean {

    const accessToken = this.getAccessToken();

    const expiresAt =
      this.getAccessTokenExpiresAt();

    if (!accessToken || expiresAt === null) {
      return true;
    }

    return Date.now() >= expiresAt;
  }

  /**
   * Returns true only when an access token exists
   * and its expiration time is still in the future.
   *
   * This method does not mutate session storage.
   */
  hasValidAccessToken(): boolean {

    return !this.isAccessTokenExpired();
  }

  // =========================================================
  // Authenticated User Storage
  // =========================================================

  setUser(user: AuthUser): void {

    sessionStorage.setItem(
      this.userKey,
      JSON.stringify(user)
    );
  }

  getUser(): AuthUser | null {

    const value = sessionStorage.getItem(
      this.userKey
    );

    if (!value) {
      return null;
    }

    try {

      const parsed: unknown = JSON.parse(value);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('userId' in parsed) ||
        typeof parsed.userId !== 'string' ||
        parsed.userId.trim().length === 0 ||
        !('fullName' in parsed) ||
        typeof parsed.fullName !== 'string' ||
        !('email' in parsed) ||
        typeof parsed.email !== 'string' ||
        !('roles' in parsed) ||
        !Array.isArray(parsed.roles) ||
        !parsed.roles.every(
          role => typeof role === 'string'
        )
      ) {
        return null;
      }

      return parsed as AuthUser;

    } catch {

      return null;
    }
  }

  // =========================================================
  // Authentication State
  // =========================================================

  /**
   * Indicates whether the current access token is valid
   * and the locally stored user identity is available.
   *
   * This is a client-side authentication check only.
   * It does not verify backend session validity.
   *
   * An expired access token does not automatically
   * invalidate a server-side refresh token.
   */
  isAuthenticated(): boolean {

    return (
      this.hasValidAccessToken() &&
      this.getUser() !== null
    );
  }

  /**
   * Indicates whether local user identity exists.
   *
   * This does not mean the access token is valid.
   * It can be used by a future session restoration
   * flow that attempts refresh before route activation.
   */
  hasStoredUser(): boolean {

    return this.getUser() !== null;
  }

  // =========================================================
  // Session Cleanup
  // =========================================================

  /**
   * Removes local authentication credentials.
   *
   * Workspace persistence cleanup must be coordinated
   * by AuthService before calling this method.
   */
  clear(): void {

    sessionStorage.removeItem(
      this.accessTokenKey
    );

    sessionStorage.removeItem(
      this.expiresAtKey
    );

    sessionStorage.removeItem(
      this.userKey
    );
  }
}