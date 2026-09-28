import { Injectable } from '@angular/core';
import { AuthUser } from '../models/auth-user.model';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private readonly accessTokenKey = 'ipos_access_token';
  private readonly expiresAtKey = 'ipos_access_token_expires_at';
  private readonly userKey = 'ipos_auth_user';

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

  setUser(user: AuthUser): void {
    sessionStorage.setItem(
      this.userKey,
      JSON.stringify(user)
    );
  }

  getUser(): AuthUser | null {
    const value =
      sessionStorage.getItem(this.userKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as AuthUser;
    } catch {
      this.clear();
      return null;
    }
  }

  isAuthenticated(): boolean {
    const accessToken =
      this.getAccessToken();

    const expiresAt =
      sessionStorage.getItem(
        this.expiresAtKey
      );

    if (!accessToken || !expiresAt) {
      return false;
    }

    const expiresAtUtc =
      new Date(expiresAt).getTime();

    if (Number.isNaN(expiresAtUtc)) {
      this.clear();
      return false;
    }

    if (Date.now() >= expiresAtUtc) {
      this.clear();
      return false;
    }

    return true;
  }

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