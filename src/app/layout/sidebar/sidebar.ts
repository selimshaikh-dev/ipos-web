import { Component, computed, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { WorkspaceContextService } from '../../core/workspace/services/workspace-context.service';
import { AuthService } from '../../core/auth/services/auth.service';

/**
 * iPOS Enterprise Navigation
 *
 * Navigation definitions are presentation metadata.
 * They do not grant permissions or bypass backend authorization.
 *
 * Planned features remain visible but non-navigable until
 * their routes and functionality are implemented.
 */
export interface NavigationItem {
  readonly label: string;
  readonly icon?: string;
  readonly route?: string;
  readonly children?: readonly NavigationItem[];
  readonly implemented?: boolean;
  readonly workspaceScope?: 'company' | 'branch';
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class Sidebar {

  // =======================================================
  // Dependencies and Navigation State
  // =======================================================

  readonly workspace = inject(WorkspaceContextService);

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly activeUrl = signal(this.router.url);

  // Workspace mode follows the active route, not merely a saved branchId.
  readonly isPlatformMode = computed(() =>
    this.isSuperAdmin() && (
      this.activeUrl().split(/[?#]/, 1)[0] === '/platform' ||
      this.activeUrl().split(/[?#]/, 1)[0] === '/settings/organization/company-management'
    )
  );

  readonly isBranchMode = computed(() => {
    const path = this.activeUrl().split(/[?#]/, 1)[0];
    return path === '/settings/organization/warehouse-management' ||
      path === '/settings/organization/pos-counter-management';
  });

  readonly workspaceMode = computed<'platform' | 'company' | 'branch'>(() =>
    this.isPlatformMode() ? 'platform' : this.isBranchMode() ? 'branch' : 'company'
  );

  readonly visibleNavigation = computed<readonly NavigationItem[]>(() => {
    const mode = this.workspaceMode();
    if (mode === 'platform') return [];
    return this.navigation
      .filter(item => mode === 'branch'
        ? item.label !== 'Dashboard'
        : item.label === 'Dashboard' || item.label === 'Settings' || item.label === 'Help & Support')
      .map(item => this.filterNavigation(item, mode))
      .filter((item): item is NavigationItem => item !== null);
  });

  private filterNavigation(
    item: NavigationItem,
    mode: 'company' | 'branch'
  ): NavigationItem | null {
    // The company/branch split applies to Organization settings and
    // Users & Access Control; unimplemented modules remain disabled.
    if (mode === 'company' && item.route === '/dashboard') {
      return { ...item, children: undefined };
    }
    if (item.route === '/settings/organization/company-management') return null;
    if (item.route === '/settings/organization/branch-management' ||
        item.route === '/settings/users-access-control/user-management' ||
        item.route === '/settings/users-access-control/role-management') {
      return mode === 'company' ? item : null;
    }
    if (item.route === '/settings/organization/warehouse-management' ||
        item.route === '/settings/organization/pos-counter-management') {
      return mode === 'branch' ? item : null;
    }
    if (mode === 'company' && item.label === 'Settings') {
      // Company administration owns organization and access-control settings.
      const children = (item.children ?? [])
        .filter(child => child.label === 'Organization' || child.label === 'Users & Access Control')
        .map(child => this.filterNavigation(child, mode))
        .filter((child): child is NavigationItem => child !== null);
      return { ...item, children };
    }
    if (mode === 'branch' && item.label === 'Settings') {
      const children = (item.children ?? [])
        .filter(child => child.label !== 'Users & Access Control')
        .map(child => this.filterNavigation(child, mode))
        .filter((child): child is NavigationItem => child !== null);
      return { ...item, children };
    }
    if (!item.children) return item;
    const children = item.children
      .map(child => this.filterNavigation(child, mode))
      .filter((child): child is NavigationItem => child !== null);
    return children.length ? { ...item, children } : null;
  }

  readonly canEnterBranch = computed(() =>
    this.workspace.hasCompany() && this.workspace.branchOptions().length > 0
  );

  enterCompanyWorkspace(): void {
    this.closeBranchSelector();
    void this.router.navigateByUrl('/dashboard');
  }

  enterBranchWorkspace(): void {
    if (!this.workspace.hasCompany()) return;
    this.closeBranchSelector();
    // This branch-scoped route prompts for an authorized branch when needed.
    void this.router.navigateByUrl('/settings/organization/warehouse-management');
  }

  constructor() {
    this.router.events.pipe(
      filter(
        (event): event is NavigationEnd =>
          event instanceof NavigationEnd
      ),
      takeUntilDestroyed()
    ).subscribe(
      event => this.activeUrl.set(event.urlAfterRedirects)
    );
  }

  // =======================================================
  // Authorization Display State
  // =======================================================

  readonly isSuperAdmin = computed(() => {
    this.auth.sessionGenerationSignal();

    return this.auth.getCurrentUser()?.roles?.some(
      role => role.toLowerCase() === 'superadmin'
    ) ?? false;
  });

  // =======================================================
  // Expanded Navigation Menus
  // =======================================================

  readonly expandedMenus = signal<ReadonlySet<string>>(
    new Set<string>()
  );

  // =======================================================
  // Enterprise Navigation Definition
  // =======================================================

  readonly navigation: readonly NavigationItem[] = [

    // 01. Dashboard
    {
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
      implemented: true,
      children: [
        { label: 'Business Overview', icon: 'space_dashboard' },
        { label: 'Sales Analytics', icon: 'monitoring' },
        { label: 'Financial Overview', icon: 'account_balance' },
        { label: 'Inventory Overview', icon: 'inventory_2' },
        { label: 'Operational Alerts', icon: 'notification_important' }
      ]
    },

    // 02. Point of Sale
    {
      label: 'Point of Sale',
      icon: 'point_of_sale',
      children: [
        { label: 'POS Terminal', icon: 'desktop_windows' },
        { label: 'Open / Close Shift', icon: 'schedule' },
        { label: 'Cash Register', icon: 'payments' },
        { label: 'Cash In / Out', icon: 'currency_exchange' },
        { label: 'Held Sales', icon: 'pause_circle' },
        { label: 'Split Payments', icon: 'call_split' },
        { label: 'Offline Sales', icon: 'wifi_off' },
        { label: 'POS Transactions', icon: 'receipt_long' },
        { label: 'Shift Reconciliation', icon: 'fact_check' },
        { label: 'Day Closing / Z-Report', icon: 'summarize' }
      ]
    },

    // 03. Sales
    {
      label: 'Sales',
      icon: 'shopping_bag',
      children: [
        { label: 'Sales Invoices', icon: 'receipt_long' },
        { label: 'Sales Orders', icon: 'shopping_cart' },
        { label: 'Quotations', icon: 'request_quote' },
        { label: 'Sales Returns & Refunds', icon: 'assignment_return' },
        { label: 'Customer Payments', icon: 'payments' },
        { label: 'Discounts & Promotions', icon: 'local_offer' },
        { label: 'Sales Price Lists', icon: 'sell' },
        { label: 'Delivery Management', icon: 'local_shipping' },
        { label: 'Sales Commissions', icon: 'percent' }
      ]
    },

    // 04. Purchases
    {
      label: 'Purchases',
      icon: 'shopping_cart',
      children: [
        { label: 'Purchase Requisitions', icon: 'assignment' },
        { label: 'Supplier Quotations', icon: 'request_quote' },
        { label: 'Purchase Orders', icon: 'shopping_basket' },
        { label: 'Purchase Approvals', icon: 'approval' },
        { label: 'Goods Receiving', icon: 'move_to_inbox' },
        { label: 'Purchase Invoices', icon: 'description' },
        { label: 'Purchase Returns', icon: 'assignment_return' },
        { label: 'Supplier Payments', icon: 'payments' },
        { label: 'Purchase History', icon: 'history' }
      ]
    },

    // 05. Inventory
    {
      label: 'Inventory',
      icon: 'inventory_2',
      children: [
        { label: 'Stock Overview', icon: 'inventory' },
        { label: 'Warehouse Stock', icon: 'warehouse' },
        { label: 'Stock Movements', icon: 'swap_horiz' },
        { label: 'Stock Transfers', icon: 'move_up' },
        { label: 'Inter-Branch Transfers', icon: 'multiple_stop' },
        { label: 'Stock Reservations', icon: 'bookmark_added' },
        { label: 'Stock Adjustments', icon: 'tune' },
        { label: 'Stock Counts', icon: 'fact_check' },
        { label: 'Damage & Expiry', icon: 'warning' },
        { label: 'Batch / Serial Tracking', icon: 'qr_code_2' },
        { label: 'Reorder Management', icon: 'autorenew' },
        { label: 'Low Stock Alerts', icon: 'notification_important' },
        { label: 'Inventory Valuation', icon: 'price_check' }
      ]
    },

    // 06. Products
    {
      label: 'Products',
      icon: 'category',
      children: [
        { label: 'Product Catalog', icon: 'view_list' },
        { label: 'Categories', icon: 'category' },
        { label: 'Brands', icon: 'branding_watermark' },
        { label: 'Units of Measurement', icon: 'straighten' },
        { label: 'Attributes & Variations', icon: 'tune' },
        { label: 'Barcodes & Labels', icon: 'qr_code' },
        { label: 'Barcode Bulk Printing', icon: 'print' },
        { label: 'Product Bundles', icon: 'all_inbox' },
        { label: 'Product Price History', icon: 'history' },
        { label: 'Product Import / Export', icon: 'import_export' }
      ]
    },

    // 07. Customers
    {
      label: 'Customers',
      icon: 'groups',
      children: [
        { label: 'Customer Directory', icon: 'contacts' },
        { label: 'Customer Groups', icon: 'group_work' },
        { label: 'Customer Ledger', icon: 'menu_book' },
        { label: 'Credit Management', icon: 'credit_score' },
        { label: 'Loyalty & Rewards', icon: 'loyalty' },
        { label: 'Gift Cards', icon: 'redeem' },
        { label: 'Customer Feedback', icon: 'reviews' },
        { label: 'Customer Statements', icon: 'description' }
      ]
    },

    // 08. Suppliers
    {
      label: 'Suppliers',
      icon: 'local_shipping',
      children: [
        { label: 'Supplier Directory', icon: 'contacts' },
        { label: 'Supplier Groups', icon: 'groups' },
        { label: 'Supplier Ledger', icon: 'menu_book' },
        { label: 'Outstanding Payables', icon: 'pending_actions' },
        { label: 'Supplier Statements', icon: 'description' }
      ]
    },

    // 09. Expenses
    {
      label: 'Expenses',
      icon: 'payments',
      children: [
        { label: 'Expense Entries', icon: 'receipt' },
        { label: 'Expense Categories', icon: 'category' },
        { label: 'Expense Approvals', icon: 'approval' },
        { label: 'Recurring Expenses', icon: 'event_repeat' },
        { label: 'Expense Analysis', icon: 'analytics' }
      ]
    },

    // 10. Accounting & Finance
    {
      label: 'Accounting & Finance',
      icon: 'account_balance',
      children: [
        { label: 'Financial Dashboard', icon: 'dashboard' },
        { label: 'Chart of Accounts', icon: 'account_tree' },
        { label: 'Journal Entries', icon: 'edit_note' },
        { label: 'General Ledger', icon: 'menu_book' },
        { label: 'Cash & Bank Accounts', icon: 'account_balance_wallet' },
        { label: 'Petty Cash', icon: 'wallet' },
        { label: 'Bank Reconciliation', icon: 'fact_check' },
        { label: 'Mobile Banking Reconciliation', icon: 'phone_android' },
        { label: 'Accounts Receivable', icon: 'call_received' },
        { label: 'Accounts Payable', icon: 'call_made' },
        { label: 'Fiscal Periods', icon: 'date_range' },
        { label: 'Trial Balance', icon: 'balance' },
        { label: 'Profit & Loss', icon: 'trending_up' },
        { label: 'Balance Sheet', icon: 'account_balance' },
        { label: 'Cash Flow Statement', icon: 'waterfall_chart' }
      ]
    },

    // 11. HR & Payroll
    {
      label: 'HR & Payroll',
      icon: 'badge',
      children: [
        { label: 'Employee Directory', icon: 'badge' },
        { label: 'Departments & Designations', icon: 'account_tree' },
        { label: 'Employee Shifts', icon: 'schedule' },
        { label: 'Attendance', icon: 'how_to_reg' },
        { label: 'Overtime Management', icon: 'more_time' },
        { label: 'Leave Management', icon: 'event_available' },
        { label: 'Salary Structures', icon: 'payments' },
        { label: 'Payroll Processing', icon: 'calculate' },
        { label: 'Payslips', icon: 'receipt_long' },
        { label: 'Employee Advances', icon: 'request_quote' }
      ]
    },

    // 12. Reports & Analytics
    {
      label: 'Reports & Analytics',
      icon: 'bar_chart',
      children: [
        { label: 'Executive Reports', icon: 'analytics' },
        { label: 'Sales Reports', icon: 'trending_up' },
        { label: 'Purchase Reports', icon: 'shopping_cart' },
        { label: 'Inventory Reports', icon: 'inventory_2' },
        { label: 'Product Reports', icon: 'category' },
        { label: 'Customer Reports', icon: 'groups' },
        { label: 'Supplier Reports', icon: 'local_shipping' },
        { label: 'Expense Reports', icon: 'payments' },
        { label: 'Tax Reports', icon: 'receipt_long' },
        { label: 'VAT / Mushak Reports', icon: 'description' },
        { label: 'HR & Payroll Reports', icon: 'badge' },
        { label: 'Branch Performance', icon: 'store' },
        { label: 'Cashier Performance', icon: 'point_of_sale' },
        { label: 'Profit Margin Reports', icon: 'percent' },
        { label: 'Report Export / Scheduling', icon: 'file_download' }
      ]
    },

    // 13. Integrations
    {
      label: 'Integrations',
      icon: 'hub',
      children: [
        { label: 'Integration Overview', icon: 'hub' },
        { label: 'Payment Gateways', icon: 'credit_card' },
        { label: 'bKash / Nagad Integration', icon: 'account_balance_wallet' },
        { label: 'SMS & Email Providers', icon: 'forward_to_inbox' },
        { label: 'E-commerce Channels', icon: 'storefront' },
        { label: 'E-commerce Order Sync', icon: 'sync' },
        { label: 'External APIs', icon: 'api' },
        { label: 'Webhooks', icon: 'webhook' },
        { label: 'Integration Logs', icon: 'history' }
      ]
    },

    // 14. Settings
    {
      label: 'Settings',
      icon: 'settings',
      children: [

        {
          label: 'Organization',
          icon: 'corporate_fare',
          children: [
            {
              label: 'Companies',
              icon: 'domain',
              route: '/settings/organization/company-management',
              implemented: true
            },
            {
              label: 'Branches',
              icon: 'account_tree',
              route: '/settings/organization/branch-management',
              workspaceScope: 'company',
              implemented: true
            },
            {
              label: 'Warehouses',
              icon: 'warehouse',
              route: '/settings/organization/warehouse-management',
              workspaceScope: 'branch',
              implemented: true
            },
            {
              label: 'POS Counters',
              icon: 'point_of_sale',
              route: '/settings/organization/pos-counter-management',
              workspaceScope: 'branch',
              implemented: true
            }
          ]
        },

        {
          label: 'Users & Access Control',
          icon: 'admin_panel_settings',
          children: [
            {
              label: 'Users',
              icon: 'group',
              route: '/settings/users-access-control/user-management',
              workspaceScope: 'company',
              implemented: true
            },
            {
              label: 'Roles & Permissions',
              icon: 'verified_user',
              route: '/settings/users-access-control/role-management',
              workspaceScope: 'company',
              implemented: true
            },
            {
              label: 'Company / Branch Access',
              icon: 'account_tree'
            },
            {
              label: 'User Sessions',
              icon: 'devices'
            }
          ]
        },

        {
          label: 'POS Configuration',
          icon: 'tune',
          children: [
            { label: 'Terminal Settings', icon: 'desktop_windows' },
            { label: 'Receipt Printers', icon: 'print' },
            { label: 'Payment Methods', icon: 'payments' },
            { label: 'Shift Policies', icon: 'schedule' },
            { label: 'Device Management', icon: 'devices' }
          ]
        },

        {
          label: 'Tax Configuration',
          icon: 'receipt_long',
          children: [
            { label: 'Tax Rates', icon: 'percent' },
            { label: 'Tax Groups', icon: 'category' },
            { label: 'Tax Rules', icon: 'rule' }
          ]
        },

        {
          label: 'Document Configuration',
          icon: 'description',
          children: [
            { label: 'Invoice & Receipt Templates', icon: 'receipt' },
            { label: 'Document Numbering', icon: 'format_list_numbered' },
            { label: 'Print Settings', icon: 'print' }
          ]
        },

        {
          label: 'Regional Settings',
          icon: 'language',
          children: [
            { label: 'Currency & Localization', icon: 'currency_exchange' },
            { label: 'Date & Time Formats', icon: 'calendar_month' },
            { label: 'Time Zone', icon: 'schedule' }
          ]
        },

        {
          label: 'Notifications',
          icon: 'notifications',
          children: [
            { label: 'Notification Templates', icon: 'drafts' },
            { label: 'Notification Rules', icon: 'rule' }
          ]
        },

        {
          label: 'Approval Workflows',
          icon: 'approval',
          children: [
            { label: 'Approval Rules', icon: 'rule' },
            { label: 'Approval Levels', icon: 'account_tree' },
            { label: 'Approval History', icon: 'history' }
          ]
        },

        {
          label: 'Data Management',
          icon: 'database',
          children: [
            { label: 'Data Import / Export', icon: 'import_export' },
            { label: 'Data Validation', icon: 'fact_check' }
          ]
        },

        { label: 'System Preferences', icon: 'settings_suggest' },
        { label: 'Backup & Restore', icon: 'backup' },
        { label: 'Audit Logs', icon: 'history' },
        { label: 'System Health', icon: 'monitor_heart' }
      ]
    },

    // 15. Help & Support
    {
      label: 'Help & Support',
      icon: 'help_outline',
      children: [
        { label: 'User Guide', icon: 'menu_book' },
        { label: 'Knowledge Base', icon: 'school' },
        { label: 'Support Requests', icon: 'support_agent' },
        { label: 'Release Notes', icon: 'new_releases' },
        { label: 'About iPOS', icon: 'info' }
      ]
    }

  ];

  // =======================================================
  // Branch Selector State
  // =======================================================

  readonly isBranchSelectorOpen = signal(false);

  toggleBranchSelector(): void {
    this.isBranchSelectorOpen.update(
      isOpen => !isOpen
    );
  }

  closeBranchSelector(): void {
    this.isBranchSelectorOpen.set(false);
  }

  selectBranch(branchId: number): void {

    if (
      !Number.isSafeInteger(branchId) ||
      branchId <= 0
    ) {
      return;
    }

    // The workspace service accepts only branches returned
    // by the authorized workspace options API.
    if (this.workspace.selectBranch(branchId)) {
      this.closeBranchSelector();
    }
  }

  // =======================================================
  // Navigation State
  // =======================================================

  toggleMenu(menuKey: string): void {

    this.expandedMenus.update(current => {

      const next = new Set(current);

      if (next.has(menuKey)) {
        next.delete(menuKey);
      } else {
        next.add(menuKey);
      }

      return next;
    });
  }

  isMenuExpanded(menuKey: string): boolean {
    return this.expandedMenus().has(menuKey);
  }

  /**
   * Stable hierarchical keys avoid collisions where
   * different modules use the same submenu label.
   */
  getMenuKey(parentKey: string, label: string): string {

    return parentKey
      ? `${parentKey}/${label}`
      : label;
  }
}