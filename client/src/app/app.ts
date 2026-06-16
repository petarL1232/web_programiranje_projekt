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

type DocumentBlockSummary = {
  id: string;
  index: number;
  previousHash: string;
  hash: string;
  createdAt: string;
};

type DocumentSummary = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileHash: string;
  isPublic: boolean;
  storageType: string;
  createdAt: string;
  updatedAt: string;
  block: DocumentBlockSummary | null;
};

type DocumentListResponse = {
  status: string;
  message?: string;
  documents: DocumentSummary[];
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
  readonly uploadResponse = signal('');
  readonly documentResponse = signal('');
  readonly blockchainResponse = signal('');
  readonly error = signal('');

  readonly currentUser = signal<AuthUser | null>(this.loadStoredUser());
  readonly token = signal<string | null>(localStorage.getItem('documentChainToken'));
  readonly myDocuments = signal<DocumentSummary[]>([]);
  readonly publicDocuments = signal<DocumentSummary[]>([]);

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
          this.loadMyDocuments();
          this.loadPublicDocuments();
          this.loadBlockchain();
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
        this.loadMyDocuments();
        this.loadPublicDocuments();
        this.loadBlockchain();
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

    this.http
      .get<AuthResponse>(`${this.apiUrl}/api/auth/me`, { headers: this.authHeaders() })
      .subscribe({
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

  uploadDocument(files: FileList | null, isPublic: boolean): void {
    const token = this.token();

    if (!token) {
      this.error.set('You need to login before uploading a document.');
      return;
    }

    if (!files || files.length === 0) {
      this.error.set('Choose a document first.');
      return;
    }

    const formData = new FormData();
    formData.append('document', files[0]);
    formData.append('isPublic', String(isPublic));

    this.loading.set(true);
    this.uploadResponse.set('');
    this.error.set('');

    this.http
      .post(`${this.apiUrl}/api/documents/upload`, formData, { headers: this.authHeaders() })
      .subscribe({
        next: (response) => {
          this.uploadResponse.set(JSON.stringify(response, null, 2));
          this.loadMyDocuments();
          this.loadPublicDocuments();
          this.loadBlockchain();
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set(err.error?.message || 'Document upload failed.');
          this.loading.set(false);
        },
      });
  }

  loadMyDocuments(): void {
    const token = this.token();

    if (!token) {
      this.myDocuments.set([]);
      return;
    }

    this.http
      .get<DocumentListResponse>(`${this.apiUrl}/api/documents/mine`, {
        headers: this.authHeaders(),
      })
      .subscribe({
        next: (response) => {
          this.myDocuments.set(response.documents);
          this.documentResponse.set(JSON.stringify(response, null, 2));
        },
        error: (err) => {
          console.error(err);
          this.error.set(err.error?.message || 'Failed to load your documents.');
        },
      });
  }

  loadPublicDocuments(): void {
    this.http.get<DocumentListResponse>(`${this.apiUrl}/api/documents/public`).subscribe({
      next: (response) => {
        this.publicDocuments.set(response.documents);
      },
      error: (err) => {
        console.error(err);
        this.error.set(err.error?.message || 'Failed to load public documents.');
      },
    });
  }

  loadBlockchain(): void {
    this.http.get(`${this.apiUrl}/api/blockchain`).subscribe({
      next: (response) => {
        this.blockchainResponse.set(JSON.stringify(response, null, 2));
      },
      error: (err) => {
        console.error(err);
        this.error.set(err.error?.message || 'Failed to load blockchain explorer.');
      },
    });
  }

  setDocumentVisibility(documentId: string, isPublic: boolean): void {
    if (!this.token()) {
      this.error.set('You need to login first.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.http
      .patch(
        `${this.apiUrl}/api/documents/${documentId}/visibility`,
        { isPublic },
        { headers: this.authHeaders() },
      )
      .subscribe({
        next: (response) => {
          this.documentResponse.set(JSON.stringify(response, null, 2));
          this.loadMyDocuments();
          this.loadPublicDocuments();
          this.loadBlockchain();
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set(err.error?.message || 'Failed to update document visibility.');
          this.loading.set(false);
        },
      });
  }

  downloadDocument(document: DocumentSummary): void {
    const token = this.token();
    const headers = token
      ? new HttpHeaders({
          Authorization: `Bearer ${token}`,
        })
      : undefined;

    this.loading.set(true);
    this.error.set('');

    this.http
      .get(`${this.apiUrl}/api/documents/${document.id}/download`, {
        headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.saveBlob(blob, document.originalName);
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set(
            'Download failed. Private documents can be downloaded only by their owner.',
          );
          this.loading.set(false);
        },
      });
  }

  logout(): void {
    localStorage.removeItem('documentChainToken');
    localStorage.removeItem('documentChainUser');
    this.token.set(null);
    this.currentUser.set(null);
    this.myDocuments.set([]);
    this.authResponse.set('Logged out.');
    this.uploadResponse.set('');
    this.documentResponse.set('');
    this.error.set('');
  }

  formatBytes(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  shortHash(hash: string): string {
    return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
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

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token()}`,
    });
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(objectUrl);
  }
}
