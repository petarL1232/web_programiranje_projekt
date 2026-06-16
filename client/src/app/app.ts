import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';

type ApiResponse = Record<string, unknown>;

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5000/api';

  readonly loadingHealth = signal(false);
  readonly loadingModels = signal(false);
  readonly backendResponse = signal('');
  readonly modelStatusResponse = signal('');
  readonly error = signal('');

  testBackend(): void {
    this.loadingHealth.set(true);
    this.backendResponse.set('');
    this.error.set('');

    this.http.get<ApiResponse>(`${this.apiUrl}/health`).subscribe({
      next: (response) => {
        this.backendResponse.set(JSON.stringify(response, null, 2));
        this.loadingHealth.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Backend request failed. Check if server is running on port 5000.');
        this.loadingHealth.set(false);
      },
    });
  }

  testModels(): void {
    this.loadingModels.set(true);
    this.modelStatusResponse.set('');
    this.error.set('');

    this.http.get<ApiResponse>(`${this.apiUrl}/models/status`).subscribe({
      next: (response) => {
        this.modelStatusResponse.set(JSON.stringify(response, null, 2));
        this.loadingModels.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Model status request failed. Check if server and MongoDB are running.');
        this.loadingModels.set(false);
      },
    });
  }
}
