
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';

import {
  PermissionBulkActionEvent,
  PermissionModuleScope,
  PermissionRowView,
  PermissionToggleEvent,
  PermissionViewFilter
} from '../../../models/permission-view.model';

/**
 * iPOS — Permission Matrix
 *
 * Presentational component only. The parent RolePermissions owns the
 * permission catalog, filtering, draft, validation, API requests and saving.
 * All changes are requested through typed outputs; this component never
 * mutates a permission row or persists permissions.
 */
@Component({
  selector: 'app-permission-matrix',
  standalone: true,
  imports: [],
  templateUrl: './permission-matrix.html',
  styleUrl: './permission-matrix.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PermissionMatrix {
  // Data is already filtered by the parent.
  readonly permissions = input.required<readonly PermissionRowView[]>();
  readonly selectedModule = input<PermissionModuleScope>(null);
  readonly searchText = input<string>('');
  readonly activeFilter = input<PermissionViewFilter>('all');
  readonly canEdit = input<boolean>(false);
  readonly disabled = input<boolean>(false);

  // Events are handled by the existing parent methods.
  readonly searchTextChanged = output<string>();
  readonly searchCleared = output<void>();
  readonly filterChanged = output<PermissionViewFilter>();
  readonly filtersReset = output<void>();
  readonly permissionToggled = output<PermissionToggleEvent>();
  readonly bulkActionRequested = output<PermissionBulkActionEvent>();

  readonly visiblePermissionCount = computed(() => this.permissions().length);
  readonly currentModuleTitle = computed(
    () => this.selectedModule() ?? 'All Permissions'
  );
  readonly isAllModules = computed(() => this.selectedModule() === null);
  readonly hasPermissions = computed(() => this.permissions().length > 0);
  readonly hasActiveFilters = computed(
    () => this.searchText().trim().length > 0 || this.activeFilter() !== 'all'
  );
  readonly canModify = computed(() => this.canEdit() && !this.disabled());

  setSearchText(value: string): void {
    if (this.disabled()) return;
    this.searchTextChanged.emit(value);
  }

  clearSearch(): void {
    if (this.disabled() || !this.searchText()) return;
    this.searchCleared.emit();
  }

  setPermissionFilter(value: string): void {
    if (this.disabled()) return;
    if (!this.isPermissionViewFilter(value)) return;
    this.filterChanged.emit(value);
  }

  resetFilters(): void {
    if (this.disabled()) return;
    this.filtersReset.emit();
  }

  togglePermission(code: string, allowed: boolean): void {
    if (!this.canModify()) return;
    if (!this.permissions().some(permission => permission.code === code)) return;
    this.permissionToggled.emit({ code, allowed });
  }

  requestGrantAll(): void {
    this.requestBulkAction(true);
  }

  requestRevokeAll(): void {
    this.requestBulkAction(false);
  }

  requestBulkAction(allowed: boolean): void {
    if (!this.canModify()) return;
    this.bulkActionRequested.emit({
      module: this.selectedModule(),
      allowed
    });
  }

  private isPermissionViewFilter(value: string): value is PermissionViewFilter {
    return value === 'all' ||
      value === 'assigned' ||
      value === 'unassigned' ||
      value === 'changed';
  }
}