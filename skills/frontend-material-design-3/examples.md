# Material Design 3 Examples

Production-ready code examples for M3 implementations.

---

## CSS Design Tokens

### Complete Token Set

```css
:root {
  /* Primary */
  --md-sys-color-primary: #6750a4;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #eaddff;
  --md-sys-color-on-primary-container: #21005e;

  /* Secondary */
  --md-sys-color-secondary: #625b71;
  --md-sys-color-on-secondary: #ffffff;
  --md-sys-color-secondary-container: #e8def8;

  /* Tertiary */
  --md-sys-color-tertiary: #7d5260;
  --md-sys-color-on-tertiary: #ffffff;

  /* Surface */
  --md-sys-color-surface: #fef7ff;
  --md-sys-color-on-surface: #1d1b20;
  --md-sys-color-surface-variant: #e7e0ec;
  --md-sys-color-on-surface-variant: #49454f;

  /* Error */
  --md-sys-color-error: #b3261e;
  --md-sys-color-on-error: #ffffff;
  --md-sys-color-error-container: #f9dedc;

  /* Outline */
  --md-sys-color-outline: #79747e;
  --md-sys-color-outline-variant: #cac4d0;

  /* Shape */
  --md-sys-shape-corner-none: 0px;
  --md-sys-shape-corner-extra-small: 4px;
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-extra-large: 28px;
  --md-sys-shape-corner-full: 9999px;

  /* Typography */
  --md-sys-typescale-body-large-size: 16px;
  --md-sys-typescale-body-large-line-height: 24px;
  --md-sys-typescale-body-large-weight: 400;
  --md-sys-typescale-label-large-size: 14px;
  --md-sys-typescale-label-large-weight: 500;
  --md-sys-typescale-title-medium-size: 16px;
  --md-sys-typescale-title-medium-weight: 500;
}

/* Dark theme */
.dark-theme {
  --md-sys-color-primary: #d0bcff;
  --md-sys-color-on-primary: #381e72;
  --md-sys-color-surface: #141218;
  --md-sys-color-on-surface: #e6e0e9;
  --md-sys-color-surface-variant: #49454f;
  --md-sys-color-on-surface-variant: #cac4d0;
}
```

---

## Angular Dashboard Layout

### Sidenav with Navigation Rail

```typescript
import { Component } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [MatSidenavModule, MatListModule, MatIconModule, RouterLink, RouterOutlet],
  template: `
    <mat-sidenav-container class="dashboard-container">
      <mat-sidenav mode="side" opened class="nav-rail">
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/analytics" routerLinkActive="active">
            <mat-icon matListItemIcon>analytics</mat-icon>
            <span matListItemTitle>Analytics</span>
          </a>
          <a mat-list-item routerLink="/conversations" routerLinkActive="active">
            <mat-icon matListItemIcon>chat</mat-icon>
            <span matListItemTitle>Conversations</span>
          </a>
          <a mat-list-item routerLink="/settings" routerLinkActive="active">
            <mat-icon matListItemIcon>settings</mat-icon>
            <span matListItemTitle>Settings</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <router-outlet></router-outlet>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .dashboard-container {
      height: 100vh;
    }
    .nav-rail {
      width: 80px;
      background: var(--mat-sys-surface-container);
    }
    .nav-rail mat-nav-list a {
      flex-direction: column;
      height: 72px;
      padding: 12px 0;
    }
    .nav-rail .active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `]
})
export class DashboardLayoutComponent {}
```

### Data Table in Card

```typescript
import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';

interface Order {
  id: string;
  customer: string;
  amount: number;
  status: string;
}

@Component({
  selector: 'app-orders-table',
  standalone: true,
  imports: [MatCardModule, MatTableModule, MatPaginatorModule, MatSortModule],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Recent Orders</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <table mat-table [dataSource]="orders" matSort>
          <ng-container matColumnDef="id">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Order ID</th>
            <td mat-cell *matCellDef="let row">{{ row.id }}</td>
          </ng-container>
          <ng-container matColumnDef="customer">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Customer</th>
            <td mat-cell *matCellDef="let row">{{ row.customer }}</td>
          </ng-container>
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Amount</th>
            <td mat-cell *matCellDef="let row">{{ row.amount | currency }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let row">
              <span class="status-chip" [class]="row.status">{{ row.status }}</span>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
        </table>
        <mat-paginator [pageSizeOptions]="[5, 10, 25]" showFirstLastButtons></mat-paginator>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    mat-card {
      background: var(--mat-sys-surface-container-low);
    }
    table {
      width: 100%;
    }
    .status-chip {
      padding: 4px 12px;
      border-radius: var(--md-sys-shape-corner-full);
      font-size: var(--md-sys-typescale-label-large-size);
    }
    .status-chip.completed {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .status-chip.pending {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `]
})
export class OrdersTableComponent {
  displayedColumns = ['id', 'customer', 'amount', 'status'];
  orders: Order[] = [
    { id: 'ORD-001', customer: 'Acme Corp', amount: 1250, status: 'completed' },
    { id: 'ORD-002', customer: 'TechStart', amount: 890, status: 'pending' },
  ];
}
```

---

## Svelte M3 Components

### M3 Card Component

```svelte
<!-- Card.svelte -->
<script lang="ts">
  type CardVariant = 'elevated' | 'filled' | 'outlined';

  let { variant = 'elevated', children } = $props<{
    variant?: CardVariant;
    children: any;
  }>();
</script>

<div class="m3-card" class:elevated={variant === 'elevated'}
     class:filled={variant === 'filled'} class:outlined={variant === 'outlined'}>
  {@render children()}
</div>

<style>
  .m3-card {
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    padding: 16px;
  }

  .elevated {
    background: var(--md-sys-color-surface, #fef7ff);
    box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15);
  }

  .filled {
    background: var(--md-sys-color-surface-variant, #e7e0ec);
  }

  .outlined {
    background: var(--md-sys-color-surface, #fef7ff);
    border: 1px solid var(--md-sys-color-outline, #79747e);
  }
</style>
```

### Theme Switching

```svelte
<!-- ThemeProvider.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let theme = $state<'light' | 'dark'>('light');

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  }

  // Check system preference
  $effect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      theme = 'dark';
      document.documentElement.classList.add('dark-theme');
    }
  });

  setContext('theme', { theme: () => theme, toggleTheme });
</script>

<slot />
```

### Metric Card

```svelte
<!-- MetricCard.svelte -->
<script lang="ts">
  let { title, value, change, icon } = $props<{
    title: string;
    value: string;
    change?: number;
    icon: string;
  }>();

  let changeClass = $derived(change && change > 0 ? 'positive' : 'negative');
</script>

<div class="metric-card">
  <div class="header">
    <span class="icon">{icon}</span>
    <span class="title">{title}</span>
  </div>
  <div class="content">
    <span class="value">{value}</span>
    {#if change !== undefined}
      <span class="change {changeClass}">
        {change > 0 ? '+' : ''}{change}%
      </span>
    {/if}
  </div>
</div>

<style>
  .metric-card {
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    padding: 16px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .title {
    font-size: var(--md-sys-typescale-title-medium-size, 16px);
    font-weight: var(--md-sys-typescale-title-medium-weight, 500);
  }

  .value {
    font-size: var(--md-sys-typescale-display-small-size, 36px);
    font-weight: 400;
    color: var(--md-sys-color-on-surface);
  }

  .change {
    font-size: var(--md-sys-typescale-label-large-size, 14px);
    padding: 4px 8px;
    border-radius: var(--md-sys-shape-corner-full);
  }

  .change.positive {
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
  }

  .change.negative {
    background: var(--md-sys-color-error-container);
    color: var(--md-sys-color-on-error-container);
  }
</style>
```

---

## Dynamic Color Runtime Update

```typescript
// theme.service.ts (Angular)
import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor(@Inject(DOCUMENT) private document: Document) {}

  updatePrimaryColor(hexColor: string): void {
    const root = this.document.documentElement;

    // In production, use Material Color Utilities to generate full palette
    root.style.setProperty('--mat-sys-primary', hexColor);
    root.style.setProperty('--mat-sys-on-primary', this.getContrastColor(hexColor));
  }

  toggleDarkMode(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark-theme', isDark);
  }

  private getContrastColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }
}
```
