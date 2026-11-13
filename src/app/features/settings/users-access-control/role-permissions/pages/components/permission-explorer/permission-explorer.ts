
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';

import {
  PermissionModuleScope,
  PermissionModuleView,
  PermissionSummaryView
} from '../../../models/permission-view.model';

/**
 * ============================================================
 * iPOS Enterprise — Permission Explorer
 * ============================================================
 *
 * Angular Standalone Presentational Component
 *
 * Responsibilities:
 * - Display all permission modules
 * - Display overall permission statistics
 * - Display module-specific permission statistics
 * - Highlight the currently selected module
 * - Emit module selection events to the parent
 * - Provide accessible module navigation
 *
 * Architecture:
 * - Parent owns API requests and permission state
 * - Parent supplies data through signal inputs
 * - Child emits user actions through outputs
 * - No direct API or service dependencies
 * - No permission draft mutations
 *
 * ============================================================
 */

@Component({
  selector: 'app-permission-explorer',
  standalone: true,
  imports: [],
  templateUrl: './permission-explorer.html',
  styleUrl: './permission-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PermissionExplorer {

  // ==========================================================
  // Inputs
  // ==========================================================

  /**
   * Available permission modules.
   *
   * Provided by:
   * RolePermissions.permissionModules()
   */
  readonly modules =
    input.required<readonly PermissionModuleView[]>();

  /**
   * Overall permission statistics.
   *
   * Provided by:
   * RolePermissions.permissionSummary()
   */
  readonly summary =
    input.required<PermissionSummaryView>();

  /**
   * Currently selected permission module.
   *
   * null represents "All Permissions".
   */
  readonly selectedModule =
    input<PermissionModuleScope>(null);

  /**
   * Disables navigation while permissions are loading.
   */
  readonly disabled =
    input<boolean>(false);

  // ==========================================================
  // Outputs
  // ==========================================================

  /**
   * Notifies the parent when a module is selected.
   *
   * null = All Permissions
   * string = Specific module
   */
  readonly moduleSelected =
    output<PermissionModuleScope>();

  // ==========================================================
  // Computed State
  // ==========================================================

  /**
   * Indicates whether "All Permissions" is selected.
   */
  readonly isAllSelected = computed(
    () => this.selectedModule() === null
  );

  /**
   * Total number of available modules.
   */
  readonly totalModules = computed(
    () => this.modules().length
  );

  /**
   * Total number of available permissions.
   */
  readonly totalPermissions = computed(
    () => this.summary().totalPermissions
  );

  /**
   * Total number of granted permissions.
   */
  readonly grantedPermissions = computed(
    () => this.summary().grantedPermissions
  );

  /**
   * Total number of permissions not granted.
   */
  readonly unassignedPermissions = computed(
    () => Math.max(
      0,
      this.totalPermissions() - this.grantedPermissions()
    )
  );

  /**
   * Indicates whether the module catalog is empty.
   */
  readonly hasModules = computed(
    () => this.modules().length > 0
  );

  /**
   * Currently selected module information.
   *
   * Returns null when:
   * - All Permissions is selected
   * - The selected module is not available
   */
  readonly activeModule = computed<PermissionModuleView | null>(
    () => {
      const selected = this.selectedModule();

      if (selected === null) {
        return null;
      }

      return this.modules().find(
        module => module.name === selected
      ) ?? null;
    }
  );

  /**
   * Display title for the active selection.
   */
  readonly activeModuleTitle = computed(
    () => this.activeModule()?.name ?? 'All Permissions'
  );

  /**
   * Total permissions in the selected scope.
   */
  readonly activePermissionCount = computed(
    () => this.activeModule()?.count ??
      this.totalPermissions()
  );

  /**
   * Granted permissions in the selected scope.
   */
  readonly activeGrantedCount = computed(
    () => this.activeModule()?.assigned ??
      this.grantedPermissions()
  );

  // ==========================================================
  // Module Selection
  // ==========================================================

  /**
   * Selects "All Permissions".
   *
   * The parent receives null and updates its selectedModule
   * signal.
   */
  selectAllPermissions(): void {
    if (this.disabled()) {
      return;
    }

    if (this.selectedModule() === null) {
      return;
    }

    this.moduleSelected.emit(null);
  }

  /**
   * Selects a specific permission module.
   *
   * Invalid or unavailable modules are ignored.
   */
  selectModule(moduleName: string): void {
    if (this.disabled()) {
      return;
    }

    const normalizedName = moduleName.trim();

    if (!normalizedName) {
      return;
    }

    const exists = this.modules().some(
      module => module.name === normalizedName
    );

    if (!exists) {
      return;
    }

    if (this.selectedModule() === normalizedName) {
      return;
    }

    this.moduleSelected.emit(normalizedName);
  }

  // ==========================================================
  // Selection Helpers
  // ==========================================================

  /**
   * Determines whether a specific module is selected.
   *
   * Used for:
   * - Active navigation styling
   * - aria-pressed
   */
  isModuleSelected(moduleName: string): boolean {
    return this.selectedModule() === moduleName;
  }

  /**
   * Returns the granted permission percentage
   * for a specific module.
   *
   * The result is clamped between 0 and 100.
   */
  getGrantedPercentage(module: PermissionModuleView): number {
    if (module.count <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (module.assigned / module.count) * 100
        )
      )
    );
  }

  /**
   * Returns the overall granted permission percentage.
   */
  readonly overallGrantedPercentage = computed(() => {
    const total = this.totalPermissions();

    if (total <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (this.grantedPermissions() / total) * 100
        )
      )
    );
  });

}