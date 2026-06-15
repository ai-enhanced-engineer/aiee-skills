# Angular Examples

Production-ready component implementations for Angular 21+.

## Dashboard Metrics Component

```typescript
import { Component, input, computed } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';

interface Metric {
  label: string;
  value: number;
  format: 'number' | 'currency' | 'percent';
  trend: 'up' | 'down' | 'stable';
}

@Component({
  selector: 'app-metrics-widget',
  standalone: true,
  imports: [DecimalPipe, PercentPipe],
  template: `
    <div class="metrics-grid" role="region" aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" class="sr-only">Key Metrics</h2>

      @for (metric of metrics(); track metric.label) {
        <article
          class="metric-card"
          [attr.aria-label]="metric.label + ': ' + formatValue(metric)">
          <span class="label">{{ metric.label }}</span>
          <span class="value">{{ formatValue(metric) }}</span>
          <span class="trend" [class]="metric.trend">
            @switch (metric.trend) {
              @case ('up') { ↑ }
              @case ('down') { ↓ }
              @default { → }
            }
          </span>
        </article>
      }
    </div>
  `,
  styles: [`
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .metric-card {
      padding: 1.5rem;
      border-radius: 8px;
      background: var(--surface-card);
      box-shadow: var(--shadow-sm);
    }
    .trend.up { color: var(--green-500); }
    .trend.down { color: var(--red-500); }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
    }
  `]
})
export class MetricsWidgetComponent {
  metrics = input.required<Metric[]>();

  formatValue(metric: Metric): string {
    switch (metric.format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(metric.value);
      case 'percent':
        return `${(metric.value * 100).toFixed(1)}%`;
      default:
        return metric.value.toLocaleString();
    }
  }
}
```

## Data Table with Filtering

```typescript
import { Component, signal, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface TableColumn<T> {
  key: keyof T;
  header: string;
  sortable?: boolean;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="table-container">
      <!-- Search -->
      <input
        type="search"
        [(ngModel)]="searchTerm"
        placeholder="Search..."
        aria-label="Search table"
      />

      <!-- Table -->
      <table role="grid" aria-label="Data table">
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th
                [attr.aria-sort]="getSortDirection(col.key)"
                (click)="col.sortable && toggleSort(col.key)">
                {{ col.header }}
                @if (col.sortable) {
                  <span class="sort-icon">
                    @if (sortKey() === col.key) {
                      {{ sortDirection() === 'asc' ? '↑' : '↓' }}
                    }
                  </span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of paginatedData(); track trackBy(row)) {
            <tr>
              @for (col of columns(); track col.key) {
                <td>{{ row[col.key] }}</td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="columns().length" class="empty-state">
                No data found
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Pagination -->
      <nav class="pagination" aria-label="Table pagination">
        <button
          (click)="prevPage()"
          [disabled]="currentPage() === 1"
          aria-label="Previous page">
          Previous
        </button>
        <span>Page {{ currentPage() }} of {{ totalPages() }}</span>
        <button
          (click)="nextPage()"
          [disabled]="currentPage() === totalPages()"
          aria-label="Next page">
          Next
        </button>
      </nav>
    </div>
  `
})
export class DataTableComponent<T extends Record<string, any>> {
  data = input.required<T[]>();
  columns = input.required<TableColumn<T>[]>();
  pageSize = input(10);
  trackBy = input<(item: T) => any>((item) => item['id']);

  searchTerm = signal('');
  sortKey = signal<keyof T | null>(null);
  sortDirection = signal<'asc' | 'desc'>('asc');
  currentPage = signal(1);

  filteredData = computed(() => {
    const term = this.searchTerm().toLowerCase();
    let result = this.data();

    if (term) {
      result = result.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(term)
        )
      );
    }

    const key = this.sortKey();
    if (key) {
      result = [...result].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        const modifier = this.sortDirection() === 'asc' ? 1 : -1;
        return aVal < bVal ? -modifier : modifier;
      });
    }

    return result;
  });

  totalPages = computed(() =>
    Math.ceil(this.filteredData().length / this.pageSize())
  );

  paginatedData = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredData().slice(start, start + this.pageSize());
  });

  toggleSort(key: keyof T) {
    if (this.sortKey() === key) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
  }

  getSortDirection(key: keyof T): string | null {
    return this.sortKey() === key ? this.sortDirection() : null;
  }

  prevPage() {
    this.currentPage.update(p => Math.max(1, p - 1));
  }

  nextPage() {
    this.currentPage.update(p => Math.min(this.totalPages(), p + 1));
  }
}
```

## Authentication Service

```typescript
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private state = signal<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    loading: false
  });

  // Selectors
  user = computed(() => this.state().user);
  isAuthenticated = computed(() => !!this.state().token);
  isAdmin = computed(() => this.state().user?.role === 'admin');
  isLoading = computed(() => this.state().loading);

  async login(email: string, password: string): Promise<void> {
    this.state.update(s => ({ ...s, loading: true }));

    try {
      const response = await this.http.post<{ user: User; token: string }>(
        '/api/auth/login',
        { email, password }
      ).toPromise();

      if (response) {
        localStorage.setItem('token', response.token);
        this.state.set({
          user: response.user,
          token: response.token,
          loading: false
        });
      }
    } catch (error) {
      this.state.update(s => ({ ...s, loading: false }));
      throw error;
    }
  }

  logout(): void {
    localStorage.removeItem('token');
    this.state.set({ user: null, token: null, loading: false });
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.state().token;
  }
}
```

## WebSocket Service for Real-time Updates

```typescript
import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { environment } from '../environments/environment';

interface WSMessage {
  type: string;
  payload: unknown;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connectionStatus = signal<'connected' | 'connecting' | 'disconnected'>('disconnected');
  lastMessage = signal<WSMessage | null>(null);

  connect(sessionId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.connectionStatus.set('connecting');

    const url = `${environment.wsUrl}/ws?session=${sessionId}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.connectionStatus.set('connected');
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as WSMessage;
      this.lastMessage.set(message);
    };

    this.socket.onclose = () => {
      this.connectionStatus.set('disconnected');
      this.attemptReconnect(sessionId);
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  send(message: WSMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(sessionId: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(sessionId), delay);
    }
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
```

## Signal Testing Patterns

### PLATFORM_ID Mocking for Constructor Side Effects

When services have `isPlatformBrowser()` checks in constructor:

```typescript
// Problem: Service makes HTTP calls in constructor before mocks ready
// Solution: In TestBed.configureTestingModule providers:
{ provide: PLATFORM_ID, useValue: 'server' }  // Prevents browser-only code
```

### WritableSignal Pattern for Component Tests

Signal references use `.set()` rather than reassignment:

```typescript
// Create writable signals BEFORE component initialization
const loadingSignal = signal(false);
const errorSignal = signal<string | null>(null);

const mockAuthService = {
  loading: loadingSignal,
  error: errorSignal,
  login: vi.fn(),
};

// In test - use .set(), not reassignment
loadingSignal.set(true);
fixture.detectChanges();
```

### NG0100 Error Prevention

Initialize signals before first `detectChanges()`:

```typescript
beforeEach(() => {
  // Set initial signal values BEFORE creating component
  loadingSignal.set(false);
  errorSignal.set(null);

  fixture = TestBed.createComponent(LoginComponent);
  component = fixture.componentInstance;
  fixture.detectChanges();  // Safe - signals already initialized
});
```

## Signal-Based Reactivity (Counter Example)

```typescript
import { Component, signal, computed, effect } from '@angular/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <button (click)="increment()">
      {{ count() }} × 2 = {{ doubled() }}
    </button>
  `
})
export class CounterComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);

  constructor() {
    effect(() => console.log('Count changed:', this.count()));
  }

  increment() {
    this.count.update(n => n + 1);
  }
}
```

## Modern Control Flow Syntax

```html
<!-- Conditionals -->
@if (isLoading()) {
  <app-spinner />
} @else if (hasError()) {
  <app-error [message]="error()" />
} @else {
  <app-content [data]="data()" />
}

<!-- Loops with tracking -->
@for (item of items(); track item.id) {
  <app-item [data]="item" />
} @empty {
  <p>No items found</p>
}

<!-- Switch -->
@switch (status()) {
  @case ('pending') { <app-pending /> }
  @case ('active') { <app-active /> }
  @default { <app-unknown /> }
}
```

## Standalone Architecture & Bootstrapping

```typescript
// No NgModules - components declare their dependencies
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterModule, MetricsComponent],
  template: `...`
})
export class DashboardComponent {}

// Bootstrapping
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
});
```

## Component I/O (Angular 21+)

```typescript
@Component({...})
export class UserCardComponent {
  // Input signal (required)
  user = input.required<User>();

  // Input with default
  showAvatar = input(true);

  // Output
  selected = output<User>();

  // Two-way binding
  isExpanded = model(false);

  onSelect() {
    this.selected.emit(this.user());
  }
}
```

## Signal-Based Service Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private _summary = signal<Summary | null>(null);
  readonly summary = this._summary.asReadonly();

  private _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  getSummary() {
    this._loading.set(true);
    return this.http.get<Summary>('/api/analytics/summary').pipe(
      tap(data => {
        this._summary.set(data);
        this._loading.set(false);
      }),
      catchError(err => {
        this._loading.set(false);
        throw err;
      })
    );
  }
}

// Component usage:
@Component({...})
export class DashboardComponent {
  private analytics = inject(AnalyticsService);
  summary = this.analytics.summary;
  loading = this.analytics.loading;
}
```

## Signal-Based DOM Queries

```typescript
// Angular 21+ signal-based (correct)
phoneInput = viewChild<ElementRef>('phoneInput');
focusInput() { this.phoneInput()?.nativeElement.focus(); }

// NOT: @ViewChild('phoneInput') phoneInput!: ElementRef;
// NOT: document.querySelector('#phone-input')
```

## Async Timing (Memory-Safe)

```typescript
private destroyRef = inject(DestroyRef);

triggerAction() {
  timer(300).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
    this.doWork();
  });
}
```

Raw `setTimeout` leaks memory if the component is destroyed before the timeout fires.

## Debounced Signal-to-Iframe Preview

```typescript
// Class-field initializer — stays in Angular injection context (avoids NG0203)
debouncedConfig = toSignal(
  toObservable(this.config).pipe(debounceTime(150)),
  { initialValue: undefined }
);

// In template: use debouncedConfig() ?? this.config() for instant first render
```
