import { Component } from '@angular/core';

interface DashboardStat {
  label: string;
  value: string;
  icon: string;
  type: string;
  trend: string;
  comparison: string;
  direction: 'up' | 'down' | 'neutral';
}

interface PaymentMethod {
  name: string;
  percent: number;
}

interface TopProduct {
  name: string;
  quantity: string;
}

interface RecentSale {
  invoice: string;
  date: string;
  customer: string;
  items: number;
  total: string;
  payment: string;
  status: string;
}

interface StockAlert {
  product: string;
  stock: string;
  reorder: string;
  status: 'Low Stock' | 'Critical';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {

  readonly userName = 'System Admin';

  readonly greeting = this.getGreeting();

  readonly businessDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  readonly stats: DashboardStat[] = [
    {
      label: `Today's Sales`,
      value: '৳ 125,430',
      icon: 'monitoring',
      type: 'sales',
      trend: '+12.5%',
      comparison: 'vs. yesterday',
      direction: 'up'
    },
    {
      label: 'Purchases',
      value: '৳ 63,210',
      icon: 'shopping_cart',
      type: 'purchase',
      trend: '+8.3%',
      comparison: 'vs. yesterday',
      direction: 'up'
    },
    {
      label: 'Expenses',
      value: '৳ 18,540',
      icon: 'payments',
      type: 'expense',
      trend: '+6.1%',
      comparison: 'vs. yesterday',
      direction: 'up'
    },
    {
      label: 'Receivables',
      value: '৳ 92,340',
      icon: 'account_balance_wallet',
      type: 'receivable',
      trend: '-4.2%',
      comparison: 'vs. last week',
      direction: 'down'
    },
    {
      label: 'Payables',
      value: '৳ 48,900',
      icon: 'credit_card',
      type: 'payable',
      trend: '+10.8%',
      comparison: 'vs. last week',
      direction: 'up'
    },
    {
      label: 'Low Stock Items',
      value: '12',
      icon: 'inventory_2',
      type: 'stock',
      trend: '+3',
      comparison: 'items need attention',
      direction: 'up'
    }
  ];

  readonly paymentMethods: PaymentMethod[] = [
    {
      name: 'Cash',
      percent: 45
    },
    {
      name: 'Card',
      percent: 28
    },
    {
      name: 'Mobile Banking',
      percent: 18
    },
    {
      name: 'Credit',
      percent: 9
    }
  ];

  readonly topProducts: TopProduct[] = [
    {
      name: 'City Cream Biscuit',
      quantity: '1,240 pcs'
    },
    {
      name: 'Fresh Milk 1 Ltr',
      quantity: '980 pcs'
    },
    {
      name: 'Premium Sugar 1kg',
      quantity: '850 pcs'
    },
    {
      name: 'Cooking Oil 5 Ltr',
      quantity: '720 pcs'
    },
    {
      name: 'Dettol Handwash',
      quantity: '250 pcs'
    }
  ];

  readonly recentSales: RecentSale[] = [
    {
      invoice: 'SL-000124',
      date: '07 Sep 10:24 AM',
      customer: 'Walk-in Customer',
      items: 3,
      total: '৳ 2,450',
      payment: 'Cash',
      status: 'Completed'
    },
    {
      invoice: 'SL-000123',
      date: '07 Sep 09:48 AM',
      customer: 'Rahim Traders',
      items: 5,
      total: '৳ 12,300',
      payment: 'Card',
      status: 'Completed'
    },
    {
      invoice: 'SL-000122',
      date: '07 Sep 09:12 AM',
      customer: 'Walk-in Customer',
      items: 2,
      total: '৳ 1,280',
      payment: 'Cash',
      status: 'Completed'
    },
    {
      invoice: 'SL-000121',
      date: '07 Sep 08:36 AM',
      customer: 'Karim Enterprise',
      items: 8,
      total: '৳ 18,450',
      payment: 'Mobile',
      status: 'Completed'
    }
  ];

  readonly stockAlerts: StockAlert[] = [
    {
      product: 'Coca Cola 500ml',
      stock: '8 pcs',
      reorder: '50 pcs',
      status: 'Low Stock'
    },
    {
      product: 'Dettol Handwash',
      stock: '4 pcs',
      reorder: '30 pcs',
      status: 'Low Stock'
    },
    {
      product: 'Surf Excel 1kg',
      stock: '6 pcs',
      reorder: '40 pcs',
      status: 'Low Stock'
    },
    {
      product: 'Fresh Milk 1 Ltr',
      stock: '3 pcs',
      reorder: '20 pcs',
      status: 'Critical'
    }
  ];

  private getGreeting(): string {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    }

    if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    }

    if (hour >= 17 && hour < 21) {
      return 'Good evening';
    }

    return 'Good night';
  }
}