import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
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

type UploadResponse = {
  status?: string;
  message?: string;
  document?: {
    id?: string;
    originalName?: string;
    size?: number;
    mimeType?: string;
    documentHash?: string;
  };
  receipt?: {
    blockIndex?: number;
    documentHash?: string;
    blockHash?: string;
    previousHash?: string;
    timestamp?: string;
  };
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
  documentHash?: string;
  fileHash: string;
  isPublic: boolean;
  isOwnedByCurrentUser?: boolean;
  canDownload?: boolean;
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

type StoredVerificationResponse = {
  status: string;
  message: string;
  verification?: {
    valid?: boolean;
    result: string;
    isAuthentic: boolean;
    documentIntegrity?: {
      isValid: boolean;
      currentDocumentHash?: string;
      currentFileHash?: string;
      blockchainDocumentHash?: string;
      blockchainFileHash?: string;
      storedDocumentHash: string;
    };
    blockchainIntegrity?: {
      isValid: boolean;
      blockHashIsValid: boolean;
      previousHashIsValid: boolean;
      calculatedBlockHash: string;
      storedBlockHash: string;
      expectedPreviousHash: string;
      actualPreviousHash: string;
    };
    chainIntegrity?: {
      isChainValid: boolean;
      firstBrokenIndex: number | null;
      brokenAtIndex: number | null;
      affectedFromIndex: number | null;
      directBrokenBlockIndexes: number[];
      affectedBlockIndexes: number[];
      isBlockAffectedByChainBreak: boolean;
    };
  };
};

type UploadedVerificationResponse = {
  status: string;
  message: string;
  verification?: {
    result: string;
    isKnown: boolean;
    hasTrustedMatch?: boolean;
    chainIntegrity?: {
      isChainValid: boolean;
      firstBrokenIndex: number | null;
      affectedFromIndex: number | null;
      matchingBlockIndexes: number[];
      matchingBlocksAffectedByBreak: number[];
    };
  };
};

type BlockchainValidationResponse = {
  status: string;
  message: string;
  validation?: {
    isChainValid: boolean;
    totalBlocks: number;
    firstBrokenIndex?: number | null;
    brokenAtIndex: number | null;
    affectedFromIndex?: number | null;
    directBrokenBlockIndexes?: number[];
    affectedBlockIndexes?: number[];
  };
};

type AppView = 'dashboard' | 'auth' | 'upload' | 'documents' | 'verify' | 'blockchain' | 'dev';

type DocumentScope = 'mine' | 'public';
type DocumentFilter = 'all' | 'private' | 'public' | 'recent';
type DocumentSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

type BlockchainExplorerDocument = {
  id: string;
  originalName: string;
  isPublic: boolean;
  isOwnedByCurrentUser?: boolean;
};

type BlockchainBlockValidation = {
  isHashValid: boolean;
  isPreviousHashValid: boolean;
  isIndexSequential: boolean;
  isDirectlyValid: boolean;
  isBlockValid: boolean;
  isTrusted: boolean;
  breaksChainHere: boolean;
  isAffectedByEarlierBreak: boolean;
  problems: string[];
};

type BlockchainExplorerBlock = {
  id: string;
  index: number;
  document: BlockchainExplorerDocument | null;
  documentId: string;
  owner?: string | null;
  documentHash: string;
  fileHash?: string;
  previousHash: string;
  expectedPreviousHash?: string;
  hash: string;
  calculatedHash?: string;
  nonce: number;
  createdAt: string;
  validation: BlockchainBlockValidation;
};

type BlockchainSummary = {
  totalBlocks: number;
  isChainValid: boolean;
  firstBrokenIndex: number | null;
  brokenAtIndex: number | null;
  affectedFromIndex: number | null;
  directBrokenBlockIndexes: number[];
  affectedBlockIndexes: number[];
  lastBlockHash: string | null;
  message: string;
};

type BlockchainExplorerResponse = {
  status: string;
  message: string;
  summary: BlockchainSummary;
  blocks: BlockchainExplorerBlock[];
};

type BlockchainRealtimeEvent = {
  event: string;
  message: string;
  block?: BlockchainExplorerBlock | null;
  blocks?: BlockchainExplorerBlock[];
  summary?: BlockchainSummary;
  timestamp: string;
};

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:5000';
  private socket: Socket | null = null;
  private sessionExpiryTimeoutId: number | null = null;
  private readonly onSessionExpired = () => this.expireSession();

  readonly loading = signal(false);
  readonly backendResponse = signal('');
  readonly modelResponse = signal('');
  readonly authResponse = signal('');
  readonly uploadResponse = signal('');
  readonly lastUploadReceiptJson = signal('');
  readonly lastUploadReceiptFileName = signal('documentchain-upload-receipt.json');
  readonly documentResponse = signal('');
  readonly verifyStoredResponse = signal('');
  readonly verifyUploadResponse = signal('');
  readonly verifyMessage = signal('');
  readonly storedVerificationMessage = signal('');
  readonly lastStoredVerificationDocumentId = signal('');
  readonly storedDocumentCheckOk = signal<boolean | null>(null);
  readonly storedBlockchainCheckOk = signal<boolean | null>(null);
  readonly storedWholeChainCheckOk = signal<boolean | null>(null);
  readonly storedChainBreakMessage = signal('');
  readonly blockchainResponse = signal('');
  readonly chainValidationResponse = signal('');
  readonly chainValidationMessage = signal('');
  readonly chainBreakDetails = signal('');
  readonly chainValidationOk = signal<boolean | null>(null);
  readonly blockchainSummary = signal<BlockchainSummary | null>(null);
  readonly blockchainBlocks = signal<BlockchainExplorerBlock[]>([]);
  readonly socketConnected = signal(false);
  readonly realtimeEvents = signal<string[]>([]);
  readonly activeView = signal<AppView>('dashboard');
  readonly devResponse = signal('');
  readonly error = signal('');
  readonly sessionExpired = signal(false);

  readonly currentUser = signal<AuthUser | null>(this.loadStoredUser());
  readonly token = signal<string | null>(localStorage.getItem('documentChainToken'));
  readonly myDocuments = signal<DocumentSummary[]>([]);
  readonly publicDocuments = signal<DocumentSummary[]>([]);
  readonly errorView = signal<AppView | null>(null);
  readonly selectedUploadFileName = signal('');
  readonly selectedVerifyFileName = signal('');
  readonly documentScope = signal<DocumentScope>('mine');
  readonly documentFilter = signal<DocumentFilter>('all');
  readonly documentSort = signal<DocumentSort>('newest');
  readonly documentQuery = signal('');
  readonly filteredDocuments = computed(() => this.getFilteredDocuments());
  readonly activeLibraryCount = computed(() => this.filteredDocuments().length);

  clearError(): void {
    this.error.set('');
    this.errorView.set(null);
  }

  private validateStoredSession(): void {
    if (!this.token()) {
      return;
    }

    this.http
      .get<AuthResponse>(`${this.apiUrl}/api/auth/me`, {
        headers: this.authHeaders(),
      })
      .subscribe({
        next: (response) => {
          if (!response.user) {
            this.expireSession();
            return;
          }

          this.currentUser.set(response.user);
          localStorage.setItem('documentChainUser', JSON.stringify(response.user));
          this.scheduleSessionExpiry(this.token());
          this.loadMyDocuments();
        },
        error: () => this.expireSession(),
      });
  }

  private scheduleSessionExpiry(token: string | null): void {
    this.clearSessionExpiryTimer();

    if (!token) {
      return;
    }

    const expiresAt = this.getJwtExpiryTime(token);
    if (!expiresAt) {
      return;
    }

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      this.expireSession();
      return;
    }

    this.sessionExpiryTimeoutId = window.setTimeout(() => this.expireSession(), remainingMs + 250);
  }

  private clearSessionExpiryTimer(): void {
    if (this.sessionExpiryTimeoutId !== null) {
      window.clearTimeout(this.sessionExpiryTimeoutId);
      this.sessionExpiryTimeoutId = null;
    }
  }

  private getJwtExpiryTime(token: string): number | null {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) {
        return null;
      }

      const normalizedPayload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = normalizedPayload.padEnd(
        Math.ceil(normalizedPayload.length / 4) * 4,
        '=',
      );
      const payload = JSON.parse(atob(paddedPayload)) as { exp?: number };
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch (_error) {
      return null;
    }
  }

  private expireSession(): void {
    if (!this.token() && !this.currentUser()) {
      return;
    }

    this.logout();
    this.sessionExpired.set(true);
    this.setActiveView('auth');
    this.error.set('Your session has expired. Please sign in again.');
    this.errorView.set('auth');
  }

  openAccount(): void {
    this.setActiveView('auth');
  }

  accountInitials(): string {
    const email = this.currentUser()?.email;

    if (!email) {
      return 'DC';
    }

    return email.slice(0, 2).toUpperCase();
  }

  selectUploadFile(files: FileList | null): void {
    this.selectedUploadFileName.set(files?.[0]?.name || '');
    this.clearError();
  }

  selectVerifyFile(files: FileList | null): void {
    this.selectedVerifyFileName.set(files?.[0]?.name || '');
    this.clearError();
  }

  setDocumentScope(scope: DocumentScope): void {
    this.documentScope.set(scope);
    this.documentFilter.set('all');
    this.documentQuery.set('');
    this.clearError();

    if (scope === 'mine' && this.token()) {
      this.loadMyDocuments();
    }

    if (scope === 'public') {
      this.loadPublicDocuments();
    }
  }

  setDocumentFilter(filter: string): void {
    const allowed: DocumentFilter[] = ['all', 'private', 'public', 'recent'];
    this.documentFilter.set(
      allowed.includes(filter as DocumentFilter) ? (filter as DocumentFilter) : 'all',
    );
  }

  setDocumentSort(sort: string): void {
    const allowed: DocumentSort[] = ['newest', 'oldest', 'name-asc', 'name-desc'];
    this.documentSort.set(
      allowed.includes(sort as DocumentSort) ? (sort as DocumentSort) : 'newest',
    );
  }

  setDocumentQuery(query: string): void {
    this.documentQuery.set(query);
  }

  clearDocumentFilters(): void {
    this.documentFilter.set('all');
    this.documentSort.set('newest');
    this.documentQuery.set('');
  }

  documentRelativeTime(value: string | Date | undefined): string {
    if (!value) {
      return 'Unknown time';
    }

    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    return this.formatDate(value);
  }

  documentTypeLabel(document: DocumentSummary): string {
    const type = document.mimeType.toLowerCase();
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('word') || type.includes('officedocument')) return 'DOC';
    if (type.includes('image')) return 'IMG';
    if (type.includes('text')) return 'TXT';
    return 'FILE';
  }

  private getFilteredDocuments(): DocumentSummary[] {
    const source = this.documentScope() === 'mine' ? this.myDocuments() : this.publicDocuments();
    const filter = this.documentFilter();
    const query = this.documentQuery().trim().toLocaleLowerCase();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    const filtered = source.filter((document) => {
      if (filter === 'private' && document.isPublic) return false;
      if (filter === 'public' && !document.isPublic) return false;
      if (filter === 'recent' && Date.now() - new Date(document.createdAt).getTime() > oneWeek)
        return false;
      if (!query) return true;

      return [document.originalName, document.mimeType, document.documentHash || document.fileHash]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });

    return [...filtered].sort((left, right) => {
      if (this.documentSort() === 'oldest') {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }
      if (this.documentSort() === 'name-asc') {
        return left.originalName.localeCompare(right.originalName);
      }
      if (this.documentSort() === 'name-desc') {
        return right.originalName.localeCompare(left.originalName);
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }

  private showError(message: string, view: AppView = this.activeView()): void {
    if (this.sessionExpired()) {
      return;
    }

    this.error.set(message);
    this.errorView.set(view);
  }

  ngOnInit(): void {
    window.addEventListener('documentchain:session-expired', this.onSessionExpired);
    this.connectRealtime();
    this.loadPublicDocuments();
    this.loadBlockchain();

    if (this.token()) {
      this.validateStoredSession();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('documentchain:session-expired', this.onSessionExpired);
    this.clearSessionExpiryTimer();
    this.socket?.disconnect();
  }

  setActiveView(view: AppView): void {
    this.activeView.set(view);
    this.clearError();

    if (view === 'documents' && !this.token()) {
      this.documentScope.set('public');
    }

    if (view === 'dashboard' || view === 'blockchain') {
      this.loadBlockchain();
    }

    if (view === 'dashboard' || view === 'documents' || view === 'verify') {
      this.loadPublicDocuments();

      if (this.token()) {
        this.loadMyDocuments();
      }
    }

    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  testBackend(): void {
    this.loading.set(true);
    this.backendResponse.set('');
    this.clearError();

    this.http.get(`${this.apiUrl}/api/health`).subscribe({
      next: (response) => {
        this.backendResponse.set(JSON.stringify(response, null, 2));
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.showError('Backend request failed. Check if server is running on port 5000.');
        this.loading.set(false);
      },
    });
  }

  testModels(): void {
    this.loading.set(true);
    this.modelResponse.set('');
    this.clearError();

    this.http.get(`${this.apiUrl}/api/models/status`).subscribe({
      next: (response) => {
        this.modelResponse.set(JSON.stringify(response, null, 2));
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.showError('Model status request failed. Check if server and MongoDB are running.');
        this.loading.set(false);
      },
    });
  }

  register(email: string, password: string): void {
    this.sessionExpired.set(false);
    this.loading.set(true);
    this.authResponse.set('');
    this.clearError();

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
          this.showError(err.error?.message || 'Registration failed.');
          this.loading.set(false);
        },
      });
  }

  login(email: string, password: string): void {
    this.sessionExpired.set(false);
    this.loading.set(true);
    this.authResponse.set('');
    this.clearError();

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
        this.showError(err.error?.message || 'Login failed.');
        this.loading.set(false);
      },
    });
  }

  getProfile(): void {
    if (!this.token()) {
      this.showError('You need to login first.');
      return;
    }

    this.loading.set(true);
    this.authResponse.set('');
    this.clearError();

    this.http
      .get<AuthResponse>(`${this.apiUrl}/api/auth/me`, {
        headers: this.authHeaders(),
      })
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
          this.showError(err.error?.message || 'Profile request failed.');
          this.loading.set(false);
        },
      });
  }

  uploadDocument(files: FileList | null): void {
    this.selectedUploadFileName.set(files?.[0]?.name || '');
    if (!this.token()) {
      this.showError('You need to login before uploading a document.');
      return;
    }

    if (!files || files.length === 0) {
      this.showError('Choose a document first.');
      return;
    }

    const formData = new FormData();
    formData.append('document', files[0]);

    this.loading.set(true);
    this.uploadResponse.set('');
    this.selectedUploadFileName.set('');
    this.selectedVerifyFileName.set('');
    this.lastUploadReceiptJson.set('');
    this.lastUploadReceiptFileName.set('documentchain-upload-receipt.json');
    this.clearError();

    this.http
      .post<UploadResponse>(`${this.apiUrl}/api/documents/upload`, formData, {
        headers: this.authHeaders(),
      })
      .subscribe({
        next: (response) => {
          const receiptJson = JSON.stringify(response, null, 2);

          this.uploadResponse.set(receiptJson);
          this.lastUploadReceiptJson.set(receiptJson);
          this.lastUploadReceiptFileName.set(this.buildReceiptFileName(response));
          this.loadMyDocuments();
          this.loadPublicDocuments();
          this.loadBlockchain();
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.showError(err.error?.message || 'Document upload failed.');
          this.loading.set(false);
        },
      });
  }

  downloadUploadReceipt(): void {
    if (!this.lastUploadReceiptJson()) {
      this.showError('No upload receipt is available yet. Upload a document first.');
      return;
    }

    const blob = new Blob([this.lastUploadReceiptJson()], {
      type: 'application/json;charset=utf-8',
    });

    this.saveBlob(blob, this.lastUploadReceiptFileName());
  }

  loadMyDocuments(): void {
    if (!this.token()) {
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
          this.showError(err.error?.message || 'Failed to load your documents.');
        },
      });
  }

  loadPublicDocuments(): void {
    const options = this.token() ? { headers: this.authHeaders() } : {};

    this.http.get<DocumentListResponse>(`${this.apiUrl}/api/documents/public`, options).subscribe({
      next: (response) => {
        this.publicDocuments.set(response.documents);
      },
      error: (err) => {
        console.error(err);
        this.showError(err.error?.message || 'Failed to load public documents.');
      },
    });
  }

  toggleDocumentVisibility(document: DocumentSummary): void {
    if (!this.token()) {
      this.showError('Login is required to change document visibility.');
      return;
    }

    if (!document.isPublic) {
      const confirmed = window.confirm(
        `Make "${document.originalName}" public? Anyone will be able to see it in Public documents, verify it, and download it through the backend route.`,
      );

      if (!confirmed) {
        return;
      }
    }

    this.loading.set(true);
    this.clearError();

    this.http
      .patch<
        DocumentListResponse | { status: string; message: string; document: DocumentSummary }
      >(`${this.apiUrl}/api/documents/${document.id}/visibility`, { isPublic: !document.isPublic }, { headers: this.authHeaders() })
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
          this.showError(err.error?.message || 'Failed to change document visibility.');
          this.loading.set(false);
        },
      });
  }

  loadBlockchain(): void {
    const options = this.token() ? { headers: this.authHeaders() } : {};

    this.http.get<BlockchainExplorerResponse>(`${this.apiUrl}/api/blockchain`, options).subscribe({
      next: (response) => {
        this.blockchainSummary.set(response.summary);
        this.blockchainBlocks.set(response.blocks);
        this.blockchainResponse.set(JSON.stringify(response, null, 2));
      },
      error: (err) => {
        console.error(err);
        this.showError(err.error?.message || 'Failed to load blockchain explorer.');
      },
    });
  }

  validateBlockchain(): void {
    this.loading.set(true);
    this.chainValidationResponse.set('');
    this.chainValidationMessage.set('');
    this.chainBreakDetails.set('');
    this.chainValidationOk.set(null);
    this.devResponse.set('');
    this.clearError();

    const options = this.token() ? { headers: this.authHeaders() } : {};

    this.http
      .get<BlockchainValidationResponse>(`${this.apiUrl}/api/blockchain/validate`, options)
      .subscribe({
        next: (response) => {
          const isChainValid = response.validation?.isChainValid ?? false;
          const brokenAtIndex = response.validation?.brokenAtIndex ?? null;
          const affectedFromIndex = response.validation?.affectedFromIndex ?? brokenAtIndex;
          const directBroken = response.validation?.directBrokenBlockIndexes ?? [];
          const affectedBlocks = response.validation?.affectedBlockIndexes ?? [];

          this.chainValidationOk.set(isChainValid);
          this.chainValidationMessage.set(
            isChainValid
              ? 'Blockchain lanac je valjan. Ova provjera čita samo block zapise, ne fileove.'
              : `Blockchain lanac je pukao na bloku #${brokenAtIndex}. Blokovi od #${affectedFromIndex} nadalje nisu potpuno pouzdani.`,
          );
          this.chainBreakDetails.set(
            isChainValid
              ? ''
              : `Direktno neispravni blokovi: ${this.formatBlockIndexes(directBroken)}. Zahvaćeni blokovi: ${this.formatBlockIndexes(affectedBlocks)}.`,
          );
          this.chainValidationResponse.set(JSON.stringify(response, null, 2));
          const currentSummary = this.blockchainSummary();
          if (currentSummary && response.validation) {
            this.blockchainSummary.set({
              ...currentSummary,
              isChainValid,
              firstBrokenIndex: response.validation.firstBrokenIndex ?? null,
              brokenAtIndex,
              affectedFromIndex: affectedFromIndex ?? null,
              directBrokenBlockIndexes: directBroken,
              affectedBlockIndexes: affectedBlocks,
            });
          }
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.showError(err.error?.message || 'Blockchain validation failed.');
          this.loading.set(false);
        },
      });
  }

  downloadDocument(document: DocumentSummary): void {
    if (!document.isPublic && !this.token()) {
      this.showError('Login is required to download private documents.');
      return;
    }

    this.loading.set(true);
    this.clearError();

    const options = this.token()
      ? { headers: this.authHeaders(), responseType: 'blob' as const }
      : { responseType: 'blob' as const };

    this.http.get(`${this.apiUrl}/api/documents/${document.id}/download`, options).subscribe({
      next: (blob) => {
        this.saveBlob(blob, document.originalName);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.showError(
          err.error?.message ||
            'Download failed. Private documents can be downloaded only by owner.',
        );
        this.loading.set(false);
      },
    });
  }

  verifyStoredDocument(document: DocumentSummary): void {
    if (!document.isPublic && !this.token()) {
      this.showError('Login is required to verify private documents.');
      return;
    }

    this.loading.set(true);
    this.verifyStoredResponse.set('');
    this.verifyMessage.set('');
    this.storedVerificationMessage.set('');
    this.lastStoredVerificationDocumentId.set(document.id);
    this.storedDocumentCheckOk.set(null);
    this.storedBlockchainCheckOk.set(null);
    this.storedWholeChainCheckOk.set(null);
    this.storedChainBreakMessage.set('');
    this.clearError();

    const options = this.token() ? { headers: this.authHeaders() } : {};

    this.http
      .post<StoredVerificationResponse>(
        `${this.apiUrl}/api/documents/${document.id}/verify`,
        {},
        options,
      )
      .subscribe({
        next: (response) => {
          const documentOk = response.verification?.documentIntegrity?.isValid ?? false;
          const blockchainOk = response.verification?.blockchainIntegrity?.isValid ?? false;
          const wholeChainOk = response.verification?.chainIntegrity?.isChainValid ?? false;
          const firstBrokenIndex = response.verification?.chainIntegrity?.firstBrokenIndex ?? null;
          const affectedFromIndex =
            response.verification?.chainIntegrity?.affectedFromIndex ?? null;
          const isAuthentic = response.verification?.isAuthentic ?? false;
          let message =
            'Dokument je izmijenjen ili oštećen: trenutni hash ne odgovara Document/Block hashu.';

          if (isAuthentic) {
            message =
              'Dokument je autentičan: hash dokumenta odgovara blockchain zapisu i cijeli lanac je valjan.';
          } else if (documentOk && blockchainOk && !wholeChainOk) {
            message = `Hash dokumenta i njegov blok izgledaju OK, ali cijeli blockchain lanac je pukao na bloku #${firstBrokenIndex}.`;
          } else if (documentOk && !blockchainOk) {
            message =
              'Hash dokumenta je ispravan, ali hash bloka ili direct previousHash veza nije valjana.';
          }

          this.storedDocumentCheckOk.set(documentOk);
          this.storedBlockchainCheckOk.set(blockchainOk);
          this.storedWholeChainCheckOk.set(wholeChainOk);
          this.storedChainBreakMessage.set(
            wholeChainOk
              ? ''
              : `Lanac je pukao na bloku #${firstBrokenIndex}; blokovi od #${affectedFromIndex} nadalje nisu potpuno pouzdani.`,
          );
          this.storedVerificationMessage.set(message);
          this.verifyMessage.set(message);
          this.verifyStoredResponse.set(JSON.stringify(response, null, 2));
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.showError(err.error?.message || 'Stored document verification failed.');
          this.loading.set(false);
        },
      });
  }

  verifyUploadedDocument(files: FileList | null): void {
    this.selectedVerifyFileName.set(files?.[0]?.name || '');
    if (!this.token()) {
      this.showError('Login is required to verify uploaded files.');
      return;
    }

    if (!files || files.length === 0) {
      this.showError('Choose a document for verification first.');
      return;
    }

    const formData = new FormData();
    formData.append('document', files[0]);

    this.loading.set(true);
    this.verifyUploadResponse.set('');
    this.verifyMessage.set('');
    this.clearError();

    this.http
      .post<UploadedVerificationResponse>(
        `${this.apiUrl}/api/documents/verify-uploaded`,
        formData,
        { headers: this.authHeaders() },
      )
      .subscribe({
        next: (response) => {
          const isKnown = response.verification?.isKnown ?? false;
          const chainOk = response.verification?.chainIntegrity?.isChainValid ?? true;
          const firstBrokenIndex = response.verification?.chainIntegrity?.firstBrokenIndex ?? null;
          const affectedMatches =
            response.verification?.chainIntegrity?.matchingBlocksAffectedByBreak ?? [];

          if (!isKnown) {
            this.verifyMessage.set('Dokument je nepoznat ili izmijenjen.');
          } else if (chainOk) {
            this.verifyMessage.set(
              'Dokument postoji u valjanoj blockchain evidenciji kojoj imaš pristup.',
            );
          } else if (affectedMatches.length > 0) {
            this.verifyMessage.set(
              `Hash dokumenta postoji u dostupnim zapisima, ali lanac je pukao na bloku #${firstBrokenIndex}, prije ili na pronađenom zapisu.`,
            );
          } else {
            this.verifyMessage.set(
              `Hash dokumenta postoji u dostupnim zapisima, ali cijeli blockchain lanac nije valjan. Prvi problem je na bloku #${firstBrokenIndex}.`,
            );
          }
          this.verifyUploadResponse.set(JSON.stringify(response, null, 2));
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.showError(err.error?.message || 'Uploaded document verification failed.');
          this.loading.set(false);
        },
      });
  }

  resetTestData(): void {
    const confirmed = window.confirm(
      'This deletes all documents, stored files, and blockchain blocks from the local development database. Users stay saved. Continue?',
    );

    if (!confirmed) {
      return;
    }

    this.loading.set(true);
    this.devResponse.set('');
    this.clearError();

    this.http.post(`${this.apiUrl}/api/dev/reset-documents-blocks`, {}).subscribe({
      next: (response) => {
        this.devResponse.set(JSON.stringify(response, null, 2));
        this.myDocuments.set([]);
        this.publicDocuments.set([]);
        this.uploadResponse.set('');
        this.selectedUploadFileName.set('');
        this.selectedVerifyFileName.set('');
        this.lastUploadReceiptJson.set('');
        this.lastUploadReceiptFileName.set('documentchain-upload-receipt.json');
        this.documentResponse.set('');
        this.verifyStoredResponse.set('');
        this.verifyUploadResponse.set('');
        this.verifyMessage.set('');
        this.storedVerificationMessage.set('');
        this.lastStoredVerificationDocumentId.set('');
        this.storedDocumentCheckOk.set(null);
        this.storedBlockchainCheckOk.set(null);
        this.storedWholeChainCheckOk.set(null);
        this.storedChainBreakMessage.set('');
        this.blockchainResponse.set('');
        this.blockchainBlocks.set([]);
        this.blockchainSummary.set(null);
        this.chainValidationResponse.set('');
        this.chainValidationMessage.set('');
        this.chainBreakDetails.set('');
        this.chainValidationOk.set(null);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.showError(
          err.error?.message ||
            'Development reset failed. This route works only in NODE_ENV=development.',
        );
        this.loading.set(false);
      },
    });
  }

  logout(): void {
    this.clearSessionExpiryTimer();
    this.sessionExpired.set(false);
    localStorage.removeItem('documentChainToken');
    localStorage.removeItem('documentChainUser');
    this.token.set(null);
    this.currentUser.set(null);
    this.myDocuments.set([]);
    this.loadPublicDocuments();
    this.authResponse.set('Logged out.');
    this.uploadResponse.set('');
    this.lastUploadReceiptJson.set('');
    this.lastUploadReceiptFileName.set('documentchain-upload-receipt.json');
    this.documentResponse.set('');
    this.verifyStoredResponse.set('');
    this.verifyUploadResponse.set('');
    this.verifyMessage.set('');
    this.storedVerificationMessage.set('');
    this.lastStoredVerificationDocumentId.set('');
    this.storedDocumentCheckOk.set(null);
    this.storedBlockchainCheckOk.set(null);
    this.storedWholeChainCheckOk.set(null);
    this.storedChainBreakMessage.set('');
    this.chainValidationResponse.set('');
    this.chainValidationMessage.set('');
    this.chainBreakDetails.set('');
    this.chainValidationOk.set(null);
    this.devResponse.set('');
    this.clearError();
    this.loadBlockchain();
  }

  private connectRealtime(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(this.apiUrl, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.socketConnected.set(true);
      this.addRealtimeEvent('Realtime explorer connected.');
    });

    this.socket.on('disconnect', () => {
      this.socketConnected.set(false);
      this.addRealtimeEvent('Realtime explorer disconnected.');
    });

    this.socket.on('blockchain:connected', (event: BlockchainRealtimeEvent) => {
      this.addRealtimeEvent(event.message || 'Connected to blockchain realtime channel.');
    });

    this.socket.on('blockchain:block-created', (event: BlockchainRealtimeEvent) => {
      this.handleRealtimeBlockchainEvent(event);
    });

    this.socket.on('blockchain:chain-updated', (event: BlockchainRealtimeEvent) => {
      this.handleRealtimeBlockchainEvent(event);
    });
  }

  private handleRealtimeBlockchainEvent(event: BlockchainRealtimeEvent): void {
    if (event.summary) {
      this.blockchainSummary.set(event.summary);
    }

    if (event.blocks) {
      this.blockchainBlocks.set(event.blocks);
    } else if (event.block) {
      this.upsertBlockchainBlock(event.block);
    }

    this.blockchainResponse.set(
      JSON.stringify(
        {
          status: 'ok',
          message: event.message,
          summary: this.blockchainSummary(),
          blocks: this.blockchainBlocks(),
        },
        null,
        2,
      ),
    );
    this.addRealtimeEvent(event.message);
  }

  private upsertBlockchainBlock(block: BlockchainExplorerBlock): void {
    const blocks = this.blockchainBlocks();
    const existingIndex = blocks.findIndex((item) => item.id === block.id);
    const nextBlocks =
      existingIndex === -1
        ? [...blocks, block]
        : blocks.map((item) => (item.id === block.id ? block : item));

    nextBlocks.sort((left, right) => left.index - right.index);
    this.blockchainBlocks.set(nextBlocks);
  }

  private addRealtimeEvent(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.realtimeEvents.set([`${timestamp} - ${message}`, ...this.realtimeEvents()].slice(0, 8));
  }

  formatDate(value: string | Date | undefined): string {
    if (!value) {
      return 'unknown';
    }

    return new Date(value).toLocaleString();
  }

  blockStatusLabel(block: BlockchainExplorerBlock): string {
    if (block.validation.isTrusted) {
      return 'trusted';
    }

    if (block.validation.breaksChainHere) {
      return 'breaks chain here';
    }

    if (block.validation.isAffectedByEarlierBreak) {
      return 'affected by earlier break';
    }

    return 'invalid';
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

  shortHash(hash: string | undefined): string {
    if (!hash) {
      return 'missing';
    }

    return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
  }

  private formatBlockIndexes(indexes: number[]): string {
    return indexes.length ? indexes.map((index) => `#${index}`).join(', ') : 'none';
  }

  private handleAuthSuccess(response: AuthResponse): void {
    this.sessionExpired.set(false);

    if (response.token) {
      localStorage.setItem('documentChainToken', response.token);
      this.token.set(response.token);
      this.scheduleSessionExpiry(response.token);
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

  private buildReceiptFileName(response: UploadResponse): string {
    const originalName = response.document?.originalName || 'document';
    const blockIndex = response.receipt?.blockIndex;
    const safeDocumentName = this.safeFileName(originalName.replace(/\.[^/.]+$/, ''));
    const blockPart = blockIndex === undefined ? 'block' : `block-${blockIndex}`;

    return `documentchain-receipt-${safeDocumentName}-${blockPart}.json`;
  }

  private safeFileName(value: string): string {
    return (
      value
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'document'
    );
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
