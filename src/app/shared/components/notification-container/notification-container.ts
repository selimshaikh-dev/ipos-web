
import {
  ChangeDetectionStrategy,
  Component,
  inject
} from '@angular/core';

import {
  NotificationService,
  NotificationType
} from '../../../core/notifications/notification.service';

@Component({
  selector: 'app-notification-container',
  standalone: true,
  templateUrl: './notification-container.html',
  styleUrl: './notification-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationContainer {

  protected readonly notificationService =
    inject(NotificationService);

  protected dismiss(notificationId: number): void {
    this.notificationService.dismiss(notificationId);
  }

  protected getIcon(type: NotificationType): string {
    switch (type) {
      case 'success':
        return 'check_circle';

      case 'error':
        return 'error';

      case 'warning':
        return 'warning';

      case 'info':
        return 'info';
    }
  }
}