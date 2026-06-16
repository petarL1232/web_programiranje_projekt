import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

type AuthUser = {
  id: string;
  email: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
};

type AuthResponse = {
  status: string;
  message?: string;
  token?: string;
  user?: AuthUser;
};

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5000';

  readonly loading = signal(false);
  readonly backendResponse = signal('');
  readonly modelResponse = signal('');
  readonly authResponse = signal('');
  readonly error = signal('');

  readonly currentUser = signal<AuthUser | null>(this.loadStoredUser());
  readonly token = signal<string | null>(localStorage.getItem('documentChainToken'));

  testBackend(): void {
    this.loading.set(true);
    this.backendResponse.set('');
    this.error.set('');

    this.http.get(`${this.apiUrl}/api/health`).subscribe({
      next: (response) => {
        this.backendResponse.set(JSON.stringify(response, null, 2));
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Backend request failed. Check if server is running on port 5000.');
        this.loading.set(false);
      },
    });
  }

  testModels(): void {
    this.loading.set(true);
    this.modelResponse.set('');
    this.error.set('');

    this.http.get(`${this.apiUrl}/api/models/status`).subscribe({
      next: (response) => {
        this.modelResponse.set(JSON.stringify(response, null, 2));
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Model status request failed. Check if server and MongoDB are running.');
        this.loading.set(false);
      },
    });
  }

  register(email: string, password: string): void {
    this.loading.set(true);
    this.authResponse.set('');
    this.error.set('');

    this.http
      .post<AuthResponse>(`${this.apiUrl}/api/auth/register`, { email, password })
      .subscribe({
        next: (response) => {
          this.handleAuthSuccess(response);
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set(err.error?.message || 'Registration failed.');
          this.loading.set(false);
        },
      });
  }

  login(email: string, password: string): void {
    this.loading.set(true);
    this.authResponse.set('');
    this.error.set('');

    this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, { email, password }).subscribe({
      next: (response) => {
        this.handleAuthSuccess(response);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set(err.error?.message || 'Login failed.');
        this.loading.set(false);
      },
    });
  }

  getProfile(): void {
    const token = this.token();

    if (!token) {
      this.error.set('You need to login first.');
      return;
    }

    this.loading.set(true);
    this.authResponse.set('');
    this.error.set('');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.http.get<AuthResponse>(`${this.apiUrl}/api/auth/me`, { headers }).subscribe({
      next: (response) => {
        if (response.user) {
          this.currentUser.set(response.user);
          localStorage.setItem('documentChainUser', JSON.stringify(response.user));
        }

        this.authResponse.set(JSON.stringify(response, null, 2));
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set(err.error?.message || 'Profile request failed.');
        this.loading.set(false);
      },
    });
  }

  logout(): void {
    localStorage.removeItem('documentChainToken');
    localStorage.removeItem('documentChainUser');
    this.token.set(null);
    this.currentUser.set(null);
    this.authResponse.set('Logged out.');
    this.error.set('');
  }

  private handleAuthSuccess(response: AuthResponse): void {
    if (response.token) {
      localStorage.setItem('documentChainToken', response.token);
      this.token.set(response.token);
    }

    if (response.user) {
      localStorage.setItem('documentChainUser', JSON.stringify(response.user));
      this.currentUser.set(response.user);
    }

    this.authResponse.set(JSON.stringify(response, null, 2));
  }

  private loadStoredUser(): AuthUser | null {
    const storedUser = localStorage.getItem('documentChainUser');

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch (_error) {
      localStorage.removeItem('documentChainUser');
      return null;
    }
  }
}
