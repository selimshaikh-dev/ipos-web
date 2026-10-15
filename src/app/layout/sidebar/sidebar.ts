import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { WorkspaceContextService } from '../../core/workspace/services/workspace-context.service';

/**
 * iPOS Enterprise Navigation
 *
 * Navigation definitions are presentation metadata.
 * They do not grant permissions or bypass backend authorization.
 */

export interface NavigationItem {
  readonly label: string;
  readonly icon?: string;
  readonly route?: string;
  readonly children?: readonly NavigationItem[];
  readonly implemented?: boolean;
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

  // Active company and branch display state.
  readonly workspace = inject(WorkspaceContextService);

  /**
   * Tracks expanded parent navigation groups.
   *
   * Angular Signals ensure predictable UI updates
   * in Angular 22 and OnPush environments.
   */
  readonly expandedMenus = signal<ReadonlySet<string>>(
    new Set<string>()
  );

  readonly navigation: readonly NavigationItem[] = [

    // =====================================================
    // 01. Dashboard
    // =====================================================

    {
      label: 'Dashboard',
      icon: 'grid_view',
      route: '/dashboard',
      implemented: true,
      children: [
        { label: 'Business Overview' },
        { label: 'Sales Analytics' },
        { label: 'Financial Overview' },
        { label: 'Inventory Overview' },
        { label: 'Operational Alerts' }
      ]
    },

    // =====================================================
    // 02. Point of Sale
    // =====================================================

    {
      label: 'Point of Sale',
      icon: 'point_of_sale',
      children: [
        { label: 'POS Terminal' },
        { label: 'Open / Close Shift' },
        { label: 'Cash Register' },
        { label: 'Held Sales' },
        { label: 'POS Transactions' },
        { label: 'Shift Reconciliation' }
      ]
    },

    // =====================================================
    // 03. Sales
    // =====================================================

    {
      label: 'Sales',
      icon: 'receipt_long',
      children: [
        { label: 'Sales Invoices' },
        { label: 'Sales Orders' },
        { label: 'Quotations' },
        { label: 'Sales Returns & Refunds' },
        { label: 'Customer Payments' },
        { label: 'Discounts & Promotions' },
        { label: 'Sales Price Lists' }
      ]
    },

    // =====================================================
    // 04. Purchases
    // =====================================================

    {
      label: 'Purchases',
      icon: 'shopping_cart',
      children: [
        { label: 'Purchase Requisitions' },
        { label: 'Purchase Orders' },
        { label: 'Goods Receiving' },
        { label: 'Purchase Invoices' },
        { label: 'Purchase Returns' },
        { label: 'Supplier Payments' },
        { label: 'Purchase History' }
      ]
    },

    // =====================================================
    // 05. Inventory
    // =====================================================

    {
      label: 'Inventory',
      icon: 'inventory_2',
      children: [
        { label: 'Stock Overview' },
        { label: 'Warehouse Stock' },
        { label: 'Stock Movements' },
        { label: 'Stock Transfers' },
        { label: 'Stock Adjustments' },
        { label: 'Stock Counts' },
        { label: 'Damage & Expiry' },
        { label: 'Batch / Serial Tracking' },
        { label: 'Reorder Management' },
        { label: 'Inventory Valuation' }
      ]
    },

    // =====================================================
    // 06. Products
    // =====================================================

    {
      label: 'Products',
      icon: 'sell',
      children: [
        { label: 'Product Catalog' },
        { label: 'Categories' },
        { label: 'Brands' },
        { label: 'Units of Measurement' },
        { label: 'Attributes & Variations' },
        { label: 'Barcodes & Labels' },
        { label: 'Product Bundles' },
        { label: 'Product Import / Export' }
      ]
    },

    // =====================================================
    // 07. Customers
    // =====================================================

    {
      label: 'Customers',
      icon: 'group',
      children: [
        { label: 'Customer Directory' },
        { label: 'Customer Groups' },
        { label: 'Customer Ledger' },
        { label: 'Credit Management' },
        { label: 'Loyalty & Rewards' },
        { label: 'Customer Statements' }
      ]
    },

    // =====================================================
    // 08. Suppliers
    // =====================================================

    {
      label: 'Suppliers',
      icon: 'local_shipping',
      children: [
        { label: 'Supplier Directory' },
        { label: 'Supplier Groups' },
        { label: 'Supplier Ledger' },
        { label: 'Outstanding Payables' },
        { label: 'Supplier Statements' }
      ]
    },

    // =====================================================
    // 09. Expenses
    // =====================================================

    {
      label: 'Expenses',
      icon: 'payments',
      children: [
        { label: 'Expense Entries' },
        { label: 'Expense Categories' },
        { label: 'Expense Approvals' },
        { label: 'Recurring Expenses' },
        { label: 'Expense Analysis' }
      ]
    },

    // =====================================================
    // 10. Accounting & Finance
    // =====================================================

    {
      label: 'Accounting & Finance',
      icon: 'account_balance',
      children: [
        { label: 'Financial Dashboard' },
        { label: 'Chart of Accounts' },
        { label: 'Journal Entries' },
        { label: 'General Ledger' },
        { label: 'Cash & Bank Accounts' },
        { label: 'Bank Reconciliation' },
        { label: 'Accounts Receivable' },
        { label: 'Accounts Payable' },
        { label: 'Fiscal Periods' },
        { label: 'Trial Balance' },
        { label: 'Profit & Loss' },
        { label: 'Balance Sheet' },
        { label: 'Cash Flow Statement' }
      ]
    },

    // =====================================================
    // 11. HR & Payroll
    // =====================================================

    {
      label: 'HR & Payroll',
      icon: 'badge',
      children: [
        { label: 'Employee Directory' },
        { label: 'Departments & Designations' },
        { label: 'Attendance' },
        { label: 'Leave Management' },
        { label: 'Salary Structures' },
        { label: 'Payroll Processing' },
        { label: 'Payslips' },
        { label: 'Employee Advances' }
      ]
    },

    // =====================================================
    // 12. Reports & Analytics
    // =====================================================

    {
      label: 'Reports & Analytics',
      icon: 'bar_chart',
      children: [
        { label: 'Executive Reports' },
        { label: 'Sales Reports' },
        { label: 'Purchase Reports' },
        { label: 'Inventory Reports' },
        { label: 'Product Reports' },
        { label: 'Customer Reports' },
        { label: 'Supplier Reports' },
        { label: 'Expense Reports' },
        { label: 'Tax Reports' },
        { label: 'HR & Payroll Reports' },
        { label: 'Branch Performance' },
        { label: 'Report Export / Scheduling' }
      ]
    },

    // =====================================================
    // 13. Integrations
    // =====================================================

    {
      label: 'Integrations',
      icon: 'hub',
      children: [
        { label: 'Integration Overview' },
        { label: 'Payment Gateways' },
        { label: 'SMS & Email Providers' },
        { label: 'E-commerce Channels' },
        { label: 'External APIs' },
        { label: 'Webhooks' },
        { label: 'Integration Logs' }
      ]
    },

    // =====================================================
    // 14. Settings
    // =====================================================

    {
      label: 'Settings',
      icon: 'settings',
      children: [

        {
          label: 'Organization',
          children: [
            {
              label: 'Company Profile',
              route: '/settings/organization/company-profile',
              implemented: true
            },
            {
              label: 'Branches',
              route: '/settings/organization/branch-management',
              implemented: true
            },
            { label: 'Warehouses' },
            { label: 'POS Counters' }
          ]
        },

        {
          label: 'Users & Access Control',
          children: [
            { label: 'Users' },
            { label: 'Roles & Permissions' },
            { label: 'Company / Branch Access' },
            { label: 'User Sessions' }
          ]
        },

        {
          label: 'POS Configuration',
          children: [
            { label: 'Terminal Settings' },
            { label: 'Receipt Printers' },
            { label: 'Payment Methods' },
            { label: 'Shift Policies' }
          ]
        },

        {
          label: 'Tax Configuration',
          children: [
            { label: 'Tax Rates' },
            { label: 'Tax Groups' },
            { label: 'Tax Rules' }
          ]
        },

        {
          label: 'Document Configuration',
          children: [
            { label: 'Invoice & Receipt Templates' },
            { label: 'Document Numbering' },
            { label: 'Print Settings' }
          ]
        },

        {
          label: 'Regional Settings',
          children: [
            { label: 'Currency & Localization' },
            { label: 'Date & Time Formats' },
            { label: 'Time Zone' }
          ]
        },

        {
          label: 'Notifications',
          children: [
            { label: 'Notification Templates' },
            { label: 'Notification Rules' }
          ]
        },

        { label: 'System Preferences' },
        { label: 'Backup & Restore' },
        { label: 'Audit Logs' },
        { label: 'System Health' }
      ]
    },

    // =====================================================
    // 15. Help & Support
    // =====================================================

    {
      label: 'Help & Support',
      icon: 'help_outline',
      children: [
        { label: 'User Guide' },
        { label: 'Knowledge Base' },
        { label: 'Support Requests' },
        { label: 'Release Notes' },
        { label: 'About iPOS' }
      ]
    }

  ];

  // =======================================================
  // Branch Selector State
  // =======================================================

  readonly isBranchSelectorOpen = signal(false);

  toggleBranchSelector(): void {
    this.isBranchSelectorOpen.update(isOpen => !isOpen);
  }

  closeBranchSelector(): void {
    this.isBranchSelectorOpen.set(false);
  }

  selectBranch(branchId: number): void {
    if (!Number.isSafeInteger(branchId) || branchId <= 0) {
      return;
    }

    // The workspace service accepts only branches returned by
    // the authorized workspace options API.
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