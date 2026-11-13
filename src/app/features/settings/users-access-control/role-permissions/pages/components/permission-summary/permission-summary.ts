
import {
  ChangeDetectionStrategy,
  Component,
  input
} from '@angular/core';

import {
  PermissionSummaryView
} from '../../../models/permission-view.model';

/**
 * iPOS Enterprise — Permission Summary
 *
 * Presentation-only Angular Standalone Component.
 *
 * Responsibilities:
 * - Display total permission modules
 * - Display total available permissions
 * - Display currently granted permissions
 *
 * Parent RolePermissions remains the single
 * source of truth.
 */

@Component({
  selector: 'app-permission-summary',
  standalone: true,
  imports: [],
  templateUrl: './permission-summary.html',
  styleUrl: './permission-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PermissionSummary {
  readonly summary = input.required<PermissionSummaryView>();
}