import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  readonly loading = signal(false);
  readonly backendResponse = signal('');
  readonly error = signal('');

  testBackend(): void {
    this.loading.set(true);
    this.backendResponse.set('');
    this.error.set('');

    this.http.get('http://localhost:5000/api/health').subscribe({
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
}
