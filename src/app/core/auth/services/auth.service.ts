import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

import { AuthUser } from '../models/auth-user.model';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);

  private readonly authApiUrl =
    `${environment.apiBaseUrl}/auth`;


  login(
    request: LoginRequest
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${this.authApiUrl}/login`,
        request,
        {
          withCredentials: true
        }
      )
      .pipe(
        tap(response => {
          this.storeAuthentication(response);
        })
      );
  }


  refresh(): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${this.authApiUrl}/refresh`,
        {},
        {
          withCredentials: true
        }
      )
      .pipe(
        tap(response => {
          this.storeAuthentication(response);
        })
      );
  }


  logout(): Observable<void> {
    return this.http
      .post<void>(
        `${this.authApiUrl}/logout`,
        {},
        {
          withCredentials: true
        }
      )
      .pipe(
        tap(() => {
          this.tokenService.clear();
        })
      );
  }


  clearLocalSession(): void {
    this.tokenService.clear();
  }


  isAuthenticated(): boolean {
    return this.tokenService.isAuthenticated();
  }


  getCurrentUser(): AuthUser | null {
    return this.tokenService.getUser();
  }


  getAccessToken(): string | null {
    return this.tokenService.getAccessToken();
  }


  private storeAuthentication(
    response: LoginResponse
  ): void {
    this.tokenService.setAccessToken(
      response.accessToken,
      response.expiresAtUtc
    );

    const user: AuthUser = {
      userId: response.userId,
      fullName: response.fullName,
      email: response.email,
      roles: response.roles
    };

    this.tokenService.setUser(user);
  }
}