
import { Injectable, computed, signal } from '@angular/core';

export type NotificationType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export interface AppNotification {
  readonly id: number;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly duration: number;
}

export interface NotificationOptions {
  readonly title?: string;
  readonly duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private readonly maxVisibleNotifications = 4;

  private nextNotificationId = 0;

  private readonly notificationState =
    signal<readonly AppNotification[]>([]);

  private readonly dismissalTimers =
    new Map<number, ReturnType<typeof setTimeout>>();

  readonly notifications = this.notificationState.asReadonly();

  readonly hasNotifications = computed(
    () => this.notifications().length > 0
  );

  success(
    message: string,
    options: NotificationOptions = {}
  ): number {
    return this.show(
      'success',
      message,
      options
    );
  }

  error(
    message: string,
    options: NotificationOptions = {}
  ): number {
    return this.show(
      'error',
      message,
      options
    );
  }

  warning(
    message: string,
    options: NotificationOptions = {}
  ): number {
    return this.show(
      'warning',
      message,
      options
    );
  }

  info(
    message: string,
    options: NotificationOptions = {}
  ): number {
    return this.show(
      'info',
      message,
      options
    );
  }

  dismiss(id: number): void {

    const timer = this.dismissalTimers.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.dismissalTimers.delete(id);
    }

    this.notificationState.update(
      notifications =>
        notifications.filter(
          notification => notification.id !== id
        )
    );
  }

  clear(): void {

    for (const timer of this.dismissalTimers.values()) {
      clearTimeout(timer);
    }

    this.dismissalTimers.clear();
    this.notificationState.set([]);
  }

  private show(
    type: NotificationType,
    message: string,
    options: NotificationOptions
  ): number {

    const id = ++this.nextNotificationId;

    const duration =
      options.duration ??
      this.getDefaultDuration(type);

    const notification: AppNotification = {
      id,
      type,
      title: options.title ?? this.getDefaultTitle(type),
      message,
      duration
    };

    const current = this.notificationState();

    const overflowCount = Math.max(
      0,
      current.length + 1 - this.maxVisibleNotifications
    );

    const overflowIds = current
      .slice(0, overflowCount)
      .map(item => item.id);

    for (const overflowId of overflowIds) {
      this.dismiss(overflowId);
    }

    this.notificationState.update(
      notifications => [...notifications, notification]
    );

    if (duration > 0) {

      const timer = setTimeout(() => {
        this.dismiss(id);
      }, duration);

      this.dismissalTimers.set(id, timer);
    }

    return id;
  }

  private getDefaultDuration(
    type: NotificationType
  ): number {

    switch (type) {
      case 'success':
        return 4500;

      case 'info':
        return 5000;

      case 'warning':
        return 6500;

      case 'error':
        return 0;
    }
  }

  private getDefaultTitle(
    type: NotificationType
  ): string {

    switch (type) {
      case 'success':
        return 'Changes saved successfully';

      case 'error':
        return 'Something went wrong';

      case 'warning':
        return 'Attention required';

      case 'info':
        return 'Information';
    }
  }
}