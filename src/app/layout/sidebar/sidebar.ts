import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class Sidebar {
  readonly navigation: NavigationItem[] = [
    { label: 'Dashboard', icon: 'grid_view', route: '/dashboard' },
    { label: 'Point of Sale', icon: 'point_of_sale', route: '/pos' },
    { label: 'Sales', icon: 'receipt_long', route: '/sales' },
    { label: 'Purchases', icon: 'shopping_cart', route: '/purchases' },
    { label: 'Inventory', icon: 'inventory_2', route: '/inventory' },
    { label: 'Products', icon: 'sell', route: '/products' },
    { label: 'Customers', icon: 'group', route: '/customers' },
    { label: 'Suppliers', icon: 'local_shipping', route: '/suppliers' },
    { label: 'Expenses', icon: 'payments', route: '/expenses' },
    { label: 'Accounting', icon: 'account_balance', route: '/accounting' },
    { label: 'Reports', icon: 'bar_chart', route: '/reports' },
    { label: 'HR & Payroll', icon: 'badge', route: '/hr' },
    { label: 'Settings', icon: 'settings', route: '/settings' }
  ];
}