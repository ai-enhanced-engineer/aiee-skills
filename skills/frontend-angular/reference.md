# Angular Reference

Detailed patterns and component library guidance for Angular 21+.

## Zoneless Change Detection (Default in v21)

```typescript
// No Zone.js needed - signals trigger updates automatically
bootstrapApplication(AppComponent, {
  providers: [
    // Zoneless is default in Angular 21+
    // Only add this if you need Zone.js for legacy code:
    // provideZoneChangeDetection()
  ]
});
```

**Benefits:**
- Smaller bundle (no Zone.js ~100KB)
- Predictable change detection
- Better debugging (no Zone.js stack traces)
- Signals automatically schedule updates

## Dependency Injection

```typescript
// Modern inject() function (preferred)
@Component({...})
export class UserService {
  private http = inject(HttpClient);
  private router = inject(Router);
}

// Constructor injection (still valid)
constructor(private http: HttpClient) {}
```

## HTTP Client Patterns

```typescript
// Functional interceptors (Angular 21+)
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();

  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  return next(req);
};

// Registration
provideHttpClient(
  withInterceptors([authInterceptor, loggingInterceptor])
)
```

## Resource API (Async Data)

```typescript
// Signal-based async data loading
@Component({...})
export class UsersComponent {
  private usersService = inject(UsersService);

  searchQuery = signal('');

  usersResource = resource({
    request: () => ({ query: this.searchQuery() }),
    loader: async ({ request }) => {
      return this.usersService.search(request.query);
    }
  });

  // In template:
  // @if (usersResource.isLoading()) { ... }
  // @if (usersResource.hasValue()) { ... }
  // @if (usersResource.error()) { ... }
}
```

## Component Libraries Comparison

| Library | Cost | Components | Best For |
|---------|------|------------|----------|
| **PrimeNG** | Free (MIT) | 80+ | B2B dashboards, forms |
| **Kendo UI** | $1,028+/dev/year | 110+ | Enterprise, data grids |
| **Angular Material** | Free | ~40 | Material Design apps |

### PrimeNG (Recommended for Dashboards)

```typescript
// Installation
// npm install primeng primeicons

import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';
import { ButtonModule } from 'primeng/button';

@Component({
  standalone: true,
  imports: [TableModule, ChartModule, ButtonModule],
  template: `
    <p-table [value]="data()" [paginator]="true" [rows]="10">
      <ng-template pTemplate="header">
        <tr><th>Name</th><th>Status</th></tr>
      </ng-template>
      <ng-template pTemplate="body" let-item>
        <tr><td>{{item.name}}</td><td>{{item.status}}</td></tr>
      </ng-template>
    </p-table>
  `
})
```

### Angular Material

```typescript
// Installation
// ng add @angular/material

import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';

@Component({
  standalone: true,
  imports: [MatTableModule, MatButtonModule],
  template: `
    <table mat-table [dataSource]="data()">
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef>Name</th>
        <td mat-cell *matCellDef="let row">{{row.name}}</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
    </table>
  `
})
```

## Reactive Forms with Signals

```typescript
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input formControlName="email" />
      @if (form.controls.email.errors?.['required']) {
        <span class="error">Email is required</span>
      }
      <button type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  onSubmit() {
    if (this.form.valid) {
      console.log(this.form.value);
    }
  }
}
```

## Router Patterns

```typescript
// Route configuration
export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component')
      .then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  { path: '**', component: NotFoundComponent }
];

// Functional guard
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};
```

## Error Handling

```typescript
// Global error handler
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private snackBar = inject(MatSnackBar);

  handleError(error: Error) {
    console.error('Unhandled error:', error);
    this.snackBar.open('An error occurred', 'Dismiss', {
      duration: 5000
    });
  }
}

// Provider
{ provide: ErrorHandler, useClass: GlobalErrorHandler }
```

---

## HTTP Error Handling Ownership

401 Unauthorized handling belongs only in the HTTP interceptor. Services that catch 401 individually conflict with the interceptor's token refresh flow and create divergent error paths.

---

## Debounced Signal-to-Iframe Preview

For live preview UIs (e.g., configuration panels updating an iframe), use `toSignal` with `debounceTime` as a class-field initializer. Use `debouncedConfig() ?? this.config()` in templates for instant first render (no 150ms delay). Class-field initialization keeps the chain in Angular's injection context — calling `toObservable()` in `ngOnInit` throws `NG0203`.

See `examples.md` for the debounced signal-to-iframe code.

---

## Async In-Flight Marker and Ephemeral Flow Patterns

### Single-Slot In-Flight Marker Clobber

Signal services commonly hold a single boolean (or ID) to indicate that a request is in flight. When the async result arrives, clearing that marker unconditionally introduces a race: a second operation launched after the first will have its marker cleared by the first operation's late-arriving response.

Safe pattern: capture the operation's identity before the async call, then clear the marker only when the stored identity still matches.

```typescript
private _loadingId = signal<string | null>(null);

load(id: string) {
  this._loadingId.set(id);
  this.http.get(`/api/items/${id}`).pipe(
    tap(() => {
      // Only clear if this response still belongs to the latest request
      if (this._loadingId() === id) {
        this._loadingId.set(null);
      }
    })
  ).subscribe();
}
```

A shared `isLoading = computed(() => this._loadingId() !== null)` derived from the captured ID correctly reflects the current operation's state rather than any prior response's cleanup.

### Ephemeral Flow: Side-Effect-Free Service Methods

Signal services that centralize a list signal (e.g., `items = signal<Item[]>([])`) expose mutating methods (`create`, `update`, `delete`) that write back to that list. Reusing those methods for ephemeral operations — preview generation, draft validation, temporary rendering — inserts internal rows into the user-facing list, inflating counts and polluting sort/filter results.

Add a parallel, side-effect-free method for ephemeral operations. It calls the same HTTP endpoint but does not touch shared signals:

```typescript
// Mutating (user-visible): writes to this._items signal
createItem(payload: CreateItemDto): Observable<Item> {
  return this.http.post<Item>('/api/items', payload).pipe(
    tap(item => this._items.update(list => [...list, item]))
  );
}

// Side-effect-free (ephemeral): same HTTP call, no signal writes
previewItem(payload: CreateItemDto): Observable<Item> {
  return this.http.post<Item>('/api/items/preview', payload);
}
```

The ephemeral method composes rather than diverges — the HTTP call is identical, only the signal side-effects are absent. Happy-path unit tests for `createItem` do not exercise `previewItem`, so this distinction requires explicit test coverage for the ephemeral path.

---

The existing pattern for multi-entity pages (e.g., widgets → assistants) uses:

- **Layout**: 280px sticky sidebar with list component, detail grid (`1fr` + right column)
- **Service**: `selectedEntitySignal` + `selectEntity()` that clears dependent data, `createEntity()` auto-selects, `updateEntity()` patches list in-place
- **Data loading**: `forkJoin` in `ngOnInit` for parallel initialization
- **Intra-page dirty check**: `CanDeactivate` only fires on route changes. For intra-page selection switching, manually check `isDirty()` with `window.confirm()` — wrap with `isPlatformBrowser(this.platformId)` — bare `window.confirm()` crashes during SSR
- **Cross-entity display**: `widgetCounts = computed(() => ...)` for "Used by N widgets" badges

---

## CanDeactivate Guard Patterns

- **`CanDeactivateFn` with `viewChild` bridge**: When a route loads a page wrapper but dirty state lives on a child, implement `HasDirtyCheck` interface on the page via `viewChild(ChildComponent)` delegation: `isDirty(): boolean { return this.formComponent()?.isDirty() ?? false; }`. The `?? false` handles loading/error states.
- **`isPlatformBrowser` guard**: Functional guards use `inject(PLATFORM_ID)` inside the guard body. Short-circuit to `true` on server to avoid `window.confirm` crashes during SSR.
- **Widget config note**: `voiceInput` is client-only (HTML attribute toggle, excluded from BackendConfig). Widget appearance is runtime-loaded via gateway API, not embedded in script tag — only `client_id` is in embed code.
