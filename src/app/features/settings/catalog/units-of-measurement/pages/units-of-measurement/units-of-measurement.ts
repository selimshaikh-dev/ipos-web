import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';

import {
  CreateUnitOfMeasureRequest,
  UnitOfMeasure,
  UnitOfMeasureListQuery,
  UnitOfMeasurePagedResult,
  UpdateUnitOfMeasureRequest
} from '../../models/unit-of-measurement.model';
import { UnitOfMeasureService } from '../../services/unit-of-measurement.service';
import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';

type UnitActiveView = 'directory' | 'details';
type UnitSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-units-of-measurement',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './units-of-measurement.html',
  styleUrl: './units-of-measurement.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UnitsOfMeasurement {
  private readonly formBuilder = inject(FormBuilder);
  private readonly unitService = inject(UnitOfMeasureService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly destroyRef = inject(DestroyRef);

  // Workspace context is only a client-side selection.
  // All company access and permissions must be checked by the backend.
  readonly companyId = this.workspaceContext.companyId;

  readonly activeView = signal<UnitActiveView>('directory');
  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly lastCreatedUnit = signal<UnitOfMeasure | null>(null);

  readonly selectedUnit = signal<UnitOfMeasure | null>(null);
  readonly isLoadingUnitDetails = signal(false);
  readonly unitDetailsError = signal<string | null>(null);
  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);

  readonly units = signal<UnitOfMeasure[]>([]);
  readonly isLoadingUnits = signal(false);
  readonly directoryError = signal<string | null>(null);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);
  readonly hasPreviousPage = signal(false);
  readonly hasNextPage = signal(false);

  readonly searchCode = signal('');
  readonly searchName = signal('');
  readonly searchSymbol = signal('');
  readonly selectedIsActive = signal<boolean | null>(null);
  readonly includeInactive = signal(false);
  readonly sortBy = signal('name');
  readonly sortDirection = signal<UnitSortDirection>('asc');

  private directorySubscription: Subscription | null = null;
  private detailsSubscription: Subscription | null = null;
  private createSubscription: Subscription | null = null;
  private updateSubscription: Subscription | null = null;
  private directoryRequestVersion = 0;
  private detailsRequestVersion = 0;
  private createRequestVersion = 0;
  private updateRequestVersion = 0;

  readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    symbol: ['', [Validators.required, Validators.maxLength(20)]]
  });

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    symbol: ['', [Validators.required, Validators.maxLength(20)]]
  });

  constructor() {
    effect(() => {
      const companyId = this.companyId();
      untracked(() => {
        this.resetForCompanyChange();
        if (companyId !== null && companyId > 0) {
          this.loadUnits();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelDetailsRequest();
      this.cancelCreateRequest();
      this.cancelUpdateRequest();
    });
  }

  showDirectory(): void {
    if (this.isCreating() || this.isUpdating()) return;
    this.closeEditUnit();
    this.cancelDetailsRequest();
    this.isLoadingUnitDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {
    if (this.selectedUnit() === null || this.isCreating()) return;
    this.activeView.set('details');
  }

  viewUnit(unitId: number): void {
    const companyId = this.companyId();
    this.cancelDetailsRequest();
    const requestVersion = this.detailsRequestVersion;
    this.closeEditUnit();
    this.selectedUnit.set(null);
    this.lastCreatedUnit.set(null);
    this.unitDetailsError.set(null);
    this.isLoadingUnitDetails.set(false);

    if (companyId === null || companyId <= 0 ||
        !Number.isSafeInteger(unitId) || unitId <= 0) {
      this.unitDetailsError.set('Select a valid company and unit of measurement.');
      this.activeView.set('details');
      return;
    }

    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingUnitDetails.set(true);
    this.detailsSubscription = this.unitService
      .getUnitOfMeasureById(companyId, unitId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.detailsRequestVersion) {
            this.isLoadingUnitDetails.set(false);
          }
        })
      )
      .subscribe({
        next: unit => {
          if (requestVersion !== this.detailsRequestVersion ||
              this.companyId() !== companyId) return;
          this.selectedUnit.set(unit);
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.detailsRequestVersion ||
              this.companyId() !== companyId) return;
          this.unitDetailsError.set(this.getDetailsErrorMessage(error));
        }
      });
  }

  openEditUnit(): void {
    const unit = this.selectedUnit();
    if (!unit || this.isUpdating() || this.isLoadingUnitDetails() ||
        this.companyId() !== unit.companyId) return;
    this.editForm.reset({ name: unit.name, symbol: unit.symbol });
    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditUnit(): void {
    if (this.isUpdating()) return;
    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateUnit(): void {
    if (!this.isEditOpen() || this.isUpdating()) return;
    const unit = this.selectedUnit();
    const companyId = this.companyId();
    if (!unit || companyId === null || companyId <= 0 ||
        unit.companyId !== companyId || !unit.rowVersion) {
      this.updateError.set('Unit details are unavailable. Reload and try again.');
      return;
    }
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    const name = value.name.trim();
    const symbol = value.symbol.trim();
    if (!name || !symbol) {
      this.editForm.markAllAsTouched();
      this.updateError.set('Name and symbol are required.');
      return;
    }
    const request: UpdateUnitOfMeasureRequest = {
      name, symbol, rowVersion: unit.rowVersion
    };
    this.cancelUpdateRequest();
    const requestVersion = this.updateRequestVersion;
    this.updateError.set(null);
    this.isUpdating.set(true);
    this.updateSubscription = this.unitService
      .updateUnitOfMeasure(companyId, unit.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.updateRequestVersion) {
            this.isUpdating.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {
          if (requestVersion !== this.updateRequestVersion ||
              this.companyId() !== companyId) return;
          this.selectedUnit.set(updated);
          this.lastCreatedUnit.set(updated);
          this.units.update(items =>
            items.map(item => item.id === updated.id ? updated : item)
          );
          this.isEditOpen.set(false);
          this.editForm.reset();
          this.notificationService.success(
            `Unit ${updated.code} updated successfully.`,
            { title: 'Unit updated' }
          );
          this.loadUnits();
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.updateRequestVersion ||
              this.companyId() !== companyId) return;
          const message = this.getUpdateErrorMessage(error);
          this.updateError.set(message);
          this.notificationService.error(message, { title: 'Unit update failed' });
        }
      });
  }

  loadUnits(): void {
    const companyId = this.companyId();
    this.cancelDirectoryRequest();
    const requestVersion = this.directoryRequestVersion;
    if (companyId === null || companyId <= 0) {
      this.clearDirectory();
      this.isLoadingUnits.set(false);
      this.directoryError.set(null);
      return;
    }
    const query: UnitOfMeasureListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      symbol: this.searchSymbol().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };
    this.isLoadingUnits.set(true);
    this.directoryError.set(null);
    this.directorySubscription = this.unitService
      .getUnitsOfMeasurement(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.directoryRequestVersion) {
            this.isLoadingUnits.set(false);
          }
        })
      )
      .subscribe({
        next: (result: UnitOfMeasurePagedResult) => {
          if (requestVersion !== this.directoryRequestVersion ||
              this.companyId() !== companyId) return;
          this.units.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
          this.hasPreviousPage.set(result.hasPreviousPage);
          this.hasNextPage.set(result.hasNextPage);
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.directoryRequestVersion ||
              this.companyId() !== companyId) return;
          this.clearDirectory();
          this.directoryError.set(this.getDirectoryErrorMessage(error));
        }
      });
  }

  refreshDirectory(): void { this.loadUnits(); }

  searchUnits(code: string, name: string, symbol: string): void {
    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());
    this.searchSymbol.set(symbol.trim());
    this.pageNumber.set(1);
    this.loadUnits();
  }

  clearSearch(): void {
    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');
    this.pageNumber.set(1);
    this.loadUnits();
  }

  filterByStatus(isActive: boolean | null): void {
    this.selectedIsActive.set(isActive);
    this.pageNumber.set(1);
    this.loadUnits();
  }

  setIncludeInactive(includeInactive: boolean): void {
    this.includeInactive.set(includeInactive);
    this.pageNumber.set(1);
    this.loadUnits();
  }

  clearFilters(): void {
    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);
    this.sortBy.set('name');
    this.sortDirection.set('asc');
    this.pageNumber.set(1);
    this.loadUnits();
  }

  changeSorting(sortBy: string, direction: UnitSortDirection): void {
    this.sortBy.set(sortBy);
    this.sortDirection.set(direction);
    this.pageNumber.set(1);
    this.loadUnits();
  }

  previousPage(): void {
    if (this.isLoadingUnits() || !this.hasPreviousPage()) return;
    this.pageNumber.update(page => Math.max(1, page - 1));
    this.loadUnits();
  }

  nextPage(): void {
    if (this.isLoadingUnits() || !this.hasNextPage()) return;
    this.pageNumber.update(page => page + 1);
    this.loadUnits();
  }

  changePageSize(size: number): void {
    if (!Number.isInteger(size) || size < 1 || size > 100) return;
    this.pageSize.set(size);
    this.pageNumber.set(1);
    this.loadUnits();
  }

  openCreateUnit(): void {
    if (this.isCreating() || this.isUpdating()) return;
    if (this.companyId() === null || this.companyId()! <= 0) {
      this.notificationService.error(
        'Select a company before creating a unit.',
        { title: 'Company selection required' }
      );
      return;
    }
    this.createForm.reset({ name: '', symbol: '' });
    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateUnit(): void {
    if (this.isCreating()) return;
    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createUnit(): void {
    if (!this.isCreateOpen() || this.isCreating()) return;
    const companyId = this.companyId();
    if (companyId === null || companyId <= 0) {
      this.createError.set('Select a valid company before creating a unit.');
      return;
    }
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const value = this.createForm.getRawValue();
    const name = value.name.trim();
    const symbol = value.symbol.trim();
    if (!name || !symbol) {
      this.createForm.markAllAsTouched();
      this.createError.set('Name and symbol are required.');
      return;
    }
    // Preserve the current API contract. The backend generates the code.
    const request: CreateUnitOfMeasureRequest = { code: '', name, symbol };
    this.cancelCreateRequest();
    const requestVersion = this.createRequestVersion;
    this.createError.set(null);
    this.isCreating.set(true);
    this.createSubscription = this.unitService
      .createUnitOfMeasure(companyId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (requestVersion === this.createRequestVersion) {
            this.isCreating.set(false);
          }
        })
      )
      .subscribe({
        next: unit => {
          if (requestVersion !== this.createRequestVersion ||
              this.companyId() !== companyId) return;
          this.cancelDetailsRequest();
          this.selectedUnit.set(unit);
          this.lastCreatedUnit.set(unit);
          this.unitDetailsError.set(null);
          this.isLoadingUnitDetails.set(false);
          this.isCreateOpen.set(false);
          this.createForm.reset();
          this.notificationService.success(
            `Unit ${unit.code} created successfully.`,
            { title: 'Unit created' }
          );
          this.pageNumber.set(1);
          this.loadUnits();
          this.activeView.set('details');
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.createRequestVersion ||
              this.companyId() !== companyId) return;
          const message = this.getCreateErrorMessage(error);
          this.createError.set(message);
          this.notificationService.error(message, { title: 'Unit creation failed' });
        }
      });
  }

  private resetForCompanyChange(): void {
    this.cancelDirectoryRequest();
    this.cancelDetailsRequest();
    this.cancelCreateRequest();
    this.cancelUpdateRequest();
    this.isCreating.set(false);
    this.isUpdating.set(false);
    this.isCreateOpen.set(false);
    this.isEditOpen.set(false);
    this.createError.set(null);
    this.updateError.set(null);
    this.createForm.reset();
    this.editForm.reset();
    this.selectedUnit.set(null);
    this.lastCreatedUnit.set(null);
    this.unitDetailsError.set(null);
    this.isLoadingUnitDetails.set(false);
    this.searchCode.set('');
    this.searchName.set('');
    this.searchSymbol.set('');
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);
    this.sortBy.set('name');
    this.sortDirection.set('asc');
    this.pageNumber.set(1);
    this.pageSize.set(20);
    this.clearDirectory();
    this.directoryError.set(null);
    this.isLoadingUnits.set(false);
    this.activeView.set('directory');
  }

  private clearDirectory(): void {
    this.units.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
    this.hasPreviousPage.set(false);
    this.hasNextPage.set(false);
  }

  private cancelDirectoryRequest(): void {
    ++this.directoryRequestVersion;
    this.directorySubscription?.unsubscribe();
    this.directorySubscription = null;
  }

  private cancelDetailsRequest(): void {
    ++this.detailsRequestVersion;
    this.detailsSubscription?.unsubscribe();
    this.detailsSubscription = null;
  }

  private cancelCreateRequest(): void {
    ++this.createRequestVersion;
    this.createSubscription?.unsubscribe();
    this.createSubscription = null;
  }

  private cancelUpdateRequest(): void {
    ++this.updateRequestVersion;
    this.updateSubscription?.unsubscribe();
    this.updateSubscription = null;
  }

  private getDirectoryErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'Invalid unit search or filter parameters.';
    if (error.status === 401 || error.status === 403) return 'You do not have permission to view units of measurement.';
    if (error.status === 404) return 'The selected company could not be found.';
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    return 'Unable to load units of measurement. Please try again.';
  }

  private getDetailsErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'Invalid unit or company identifier.';
    if (error.status === 401 || error.status === 403) return 'You do not have permission to view this unit.';
    if (error.status === 404) return 'The requested unit of measurement was not found.';
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    return 'Unable to load unit details. Please try again.';
  }

  private getCreateErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'Invalid unit details. Review the form and try again.';
    if (error.status === 401 || error.status === 403) return 'You do not have permission to create units of measurement.';
    if (error.status === 404) return 'The selected company could not be found.';
    if (error.status === 409) return 'This unit code already exists or conflicts with another record.';
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    return 'Unable to create the unit. Please try again.';
  }

  private getUpdateErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 400) return 'Invalid unit details. Review the form and try again.';
    if (error.status === 401 || error.status === 403) return 'You do not have permission to update units of measurement.';
    if (error.status === 404) return 'The unit was not found. Return to the directory and refresh.';
    if (error.status === 409) return 'This unit has changed or has a dependency conflict. Reload its details before retrying.';
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    return 'Unable to update the unit. Please try again.';
  }
}