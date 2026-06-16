# Angular Testing Examples

Complete test suites for Angular 21+ components.

## Dashboard Component Test Suite

```typescript
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from './dashboard.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initialization', () => {
    it('should show loading state initially', () => {
      expect(component.isLoading()).toBe(true);
      expect(fixture.nativeElement.querySelector('.loading')).toBeTruthy();
    });

    it('should load metrics on init', async () => {
      fixture.detectChanges(); // Triggers ngOnInit

      const req = httpMock.expectOne('/api/metrics');
      req.flush({
        revenue: 50000,
        users: 1200,
        conversion: 0.045
      });

      TestBed.flushEffects();
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.metrics()).toEqual({
        revenue: 50000,
        users: 1200,
        conversion: 0.045
      });
    });
  });

  describe('computed values', () => {
    it('should format currency correctly', () => {
      component.metrics.set({ revenue: 50000, users: 0, conversion: 0 });
      TestBed.flushEffects();

      expect(component.formattedRevenue()).toBe('$50,000.00');
    });

    it('should calculate percentage correctly', () => {
      component.metrics.set({ revenue: 0, users: 0, conversion: 0.0456 });
      TestBed.flushEffects();

      expect(component.formattedConversion()).toBe('4.6%');
    });
  });

  describe('user interactions', () => {
    it('should refresh data when button clicked', async () => {
      // Initial load
      fixture.detectChanges();
      httpMock.expectOne('/api/metrics').flush({ revenue: 100 });

      // Click refresh
      const refreshBtn = fixture.nativeElement.querySelector('[data-testid="refresh"]');
      refreshBtn.click();

      const req = httpMock.expectOne('/api/metrics');
      req.flush({ revenue: 200 });
      TestBed.flushEffects();

      expect(component.metrics()?.revenue).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should display error message on API failure', async () => {
      fixture.detectChanges();

      const req = httpMock.expectOne('/api/metrics');
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      TestBed.flushEffects();
      fixture.detectChanges();

      expect(component.error()).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.error')).toBeTruthy();
    });
  });
});
```

## Data Table Component Test

```typescript
import { TestBed } from '@angular/core/testing';
import { DataTableComponent } from './data-table.component';

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<DataTableComponent<TestItem>>;
  let component: DataTableComponent<TestItem>;

  interface TestItem {
    id: string;
    name: string;
    status: string;
  }

  const testData: TestItem[] = [
    { id: '1', name: 'Item A', status: 'active' },
    { id: '2', name: 'Item B', status: 'inactive' },
    { id: '3', name: 'Item C', status: 'active' }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataTableComponent]
    });

    fixture = TestBed.createComponent(DataTableComponent<TestItem>);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('data', testData);
    fixture.componentRef.setInput('columns', [
      { key: 'name', header: 'Name', sortable: true },
      { key: 'status', header: 'Status', sortable: true }
    ]);
    fixture.detectChanges();
  });

  describe('rendering', () => {
    it('should render all rows', () => {
      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    it('should render column headers', () => {
      const headers = fixture.nativeElement.querySelectorAll('th');
      expect(headers[0].textContent).toContain('Name');
      expect(headers[1].textContent).toContain('Status');
    });
  });

  describe('filtering', () => {
    it('should filter data by search term', () => {
      component.searchTerm.set('Item A');
      TestBed.flushEffects();
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Item A');
    });

    it('should show empty state when no matches', () => {
      component.searchTerm.set('nonexistent');
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.empty-state')).toBeTruthy();
    });
  });

  describe('sorting', () => {
    it('should sort by column ascending', () => {
      component.toggleSort('name');
      TestBed.flushEffects();

      expect(component.sortKey()).toBe('name');
      expect(component.sortDirection()).toBe('asc');
      expect(component.filteredData()[0].name).toBe('Item A');
    });

    it('should toggle to descending on second click', () => {
      component.toggleSort('name');
      component.toggleSort('name');
      TestBed.flushEffects();

      expect(component.sortDirection()).toBe('desc');
      expect(component.filteredData()[0].name).toBe('Item C');
    });
  });

  describe('pagination', () => {
    it('should paginate correctly', () => {
      fixture.componentRef.setInput('pageSize', 2);
      fixture.detectChanges();

      expect(component.paginatedData().length).toBe(2);
      expect(component.totalPages()).toBe(2);
    });

    it('should navigate to next page', () => {
      fixture.componentRef.setInput('pageSize', 2);
      fixture.detectChanges();

      component.nextPage();
      TestBed.flushEffects();

      expect(component.currentPage()).toBe(2);
      expect(component.paginatedData().length).toBe(1);
    });
  });
});
```

## E2E Test Suite (Playwright)

```typescript
import { test, expect, Page } from '@playwright/test';

test.describe('Dashboard E2E', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should display dashboard metrics', async () => {
    await expect(page.locator('[data-testid="revenue-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="users-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="conversion-card"]')).toBeVisible();
  });

  test('should filter table data', async () => {
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill('active');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('should navigate to detail page', async () => {
    await page.click('[data-testid="row-1"]');
    await expect(page).toHaveURL(/\/detail\/1/);
  });

  test('should handle logout', async () => {
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout"]');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Visual Regression', () => {
  test('dashboard should match screenshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixels: 100
    });
  });

  test('metrics cards should match screenshot', async ({ page }) => {
    await page.goto('/dashboard');
    const metricsSection = page.locator('[data-testid="metrics-section"]');

    await expect(metricsSection).toHaveScreenshot('metrics-cards.png');
  });
});

test.describe('Accessibility', () => {
  test('should pass axe-core accessibility tests', async ({ page }) => {
    await page.goto('/dashboard');

    // Run axe-core
    const accessibilityScanResults = await page.evaluate(async () => {
      // @ts-ignore
      const axe = await import('axe-core');
      return await axe.run();
    });

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/dashboard');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', 'search-input');

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', 'refresh-btn');
  });
});
```

## Auth Service Test

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);

    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should store token on successful login', async () => {
      const loginPromise = service.login('user@test.com', 'password');

      const req = httpMock.expectOne('/api/auth/login');
      req.flush({
        token: 'jwt-token-123',
        user: { id: '1', email: 'user@test.com', role: 'user' }
      });

      await loginPromise;

      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()?.email).toBe('user@test.com');
      expect(localStorage.getItem('token')).toBe('jwt-token-123');
    });

    it('should handle login failure', async () => {
      const loginPromise = service.login('wrong@test.com', 'wrong');

      const req = httpMock.expectOne('/api/auth/login');
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

      await expect(loginPromise).rejects.toThrow();
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear state and redirect', () => {
      // Setup authenticated state
      service['state'].set({
        user: { id: '1', email: 'test@test.com', name: 'Test', role: 'user' },
        token: 'token',
        loading: false
      });

      service.logout();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('token management', () => {
    it('should restore token from localStorage on init', () => {
      localStorage.setItem('token', 'stored-token');

      // Re-create service to trigger initialization
      const freshService = TestBed.inject(AuthService);

      expect(freshService.getToken()).toBe('stored-token');
    });
  });
});
```

## Window Method Mocking (vi.spyOn)

```typescript
// Spy on window.confirm instead of deleting globalThis.window
const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
// ... test guard or component that calls window.confirm ...
confirmSpy.mockRestore();
```

Deleting `globalThis.window` in jsdom breaks cross-suite tests — `window` IS the global object itself.
