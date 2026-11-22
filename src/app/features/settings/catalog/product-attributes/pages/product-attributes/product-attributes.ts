import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener,
  computed, effect, inject, signal, untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';

import {
  ProductAttribute, ProductAttributeListQuery, ProductAttributeValue,
  ProductAttributeValueListQuery
} from '../../models/product-attribute.model';
import { ProductAttributeService } from '../../service/product-attribute.service';
import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';
import { EffectivePermissionService } from '../../../../../../core/authorization/effective-permission.service';
import { PermissionCodes } from '../../../../../../core/authorization/permission-registry';

type ActiveView = 'directory' | 'details';
type SortField = 'name' | 'code' | 'id';
type SortDirection = 'asc' | 'desc';
type StatusTarget =
  | { kind: 'attribute'; record: ProductAttribute }
  | { kind: 'value'; record: ProductAttributeValue; attributeId: number };
type RequestKey =
  | 'attributes' | 'attributeDetails' | 'attributeCreate' | 'attributeUpdate'
  | 'values' | 'valueDetails' | 'valueCreate' | 'valueUpdate' | 'status';

@Component({
  selector: 'app-product-attributes',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './product-attributes.html',
  styleUrl: './product-attributes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductAttributes {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ProductAttributeService);
  private readonly notifications = inject(NotificationService);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly permissions = inject(EffectivePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly companyId = this.workspace.companyId;
  readonly canView = computed(() => this.permissions.hasCompanyPermission(PermissionCodes.productAttributes.view));
  readonly canCreate = computed(() => this.permissions.hasCompanyPermission(PermissionCodes.productAttributes.create));
  readonly canUpdate = computed(() => this.permissions.hasCompanyPermission(PermissionCodes.productAttributes.update));
  readonly canActivate = computed(() => this.permissions.hasCompanyPermission(PermissionCodes.productAttributes.activate));
  readonly canDeactivate = computed(() => this.permissions.hasCompanyPermission(PermissionCodes.productAttributes.deactivate));

  readonly activeView = signal<ActiveView>('directory');
  readonly attributes = signal<ProductAttribute[]>([]);
  readonly selectedAttribute = signal<ProductAttribute | null>(null);
  readonly isLoadingAttributes = signal(false);
  readonly isLoadingAttributeDetails = signal(false);
  readonly directoryError = signal<string | null>(null);
  readonly attributeDetailsError = signal<string | null>(null);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);
  readonly searchCode = signal('');
  readonly searchName = signal('');
  readonly selectedIsActive = signal<boolean | null>(null);
  readonly includeInactive = signal(false);
  readonly sortBy = signal<SortField>('name');
  readonly sortDirection = signal<SortDirection>('asc');
  readonly hasPreviousPage = computed(() => this.pageNumber() > 1);
  readonly hasNextPage = computed(() => this.pageNumber() < this.totalPages());

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);
  readonly lastCreatedAttribute = signal<ProductAttribute | null>(null);

  readonly values = signal<ProductAttributeValue[]>([]);
  readonly selectedValue = signal<ProductAttributeValue | null>(null);
  readonly isLoadingValues = signal(false);
  readonly isLoadingValueDetails = signal(false);
  readonly valuesError = signal<string | null>(null);
  readonly valueDetailsError = signal<string | null>(null);
  readonly valueTotalCount = signal(0);
  readonly valueTotalPages = signal(0);
  readonly valuePageNumber = signal(1);
  readonly valuePageSize = signal(20);
  readonly valueSearchCode = signal('');
  readonly valueSearchName = signal('');
  readonly valueSelectedIsActive = signal<boolean | null>(null);
  readonly valueIncludeInactive = signal(false);
  readonly valueSortBy = signal<SortField>('name');
  readonly valueSortDirection = signal<SortDirection>('asc');
  readonly hasPreviousValuePage = computed(() => this.valuePageNumber() > 1);
  readonly hasNextValuePage = computed(() => this.valuePageNumber() < this.valueTotalPages());

  readonly isValueCreateOpen = signal(false);
  readonly isCreatingValue = signal(false);
  readonly valueCreateError = signal<string | null>(null);
  readonly isValueEditOpen = signal(false);
  readonly isUpdatingValue = signal(false);
  readonly valueUpdateError = signal<string | null>(null);

  readonly pendingStatus = signal<StatusTarget | null>(null);
  readonly isStatusConfirmationOpen = computed(() => this.pendingStatus() !== null);
  readonly pendingStatusAction = computed(() => this.pendingStatus()?.record.isActive ? 'deactivate' : 'activate');
  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]] });
  readonly editForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]] });
  readonly valueCreateForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]] });
  readonly valueEditForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]] });

  private readonly subscriptions: Partial<Record<RequestKey, Subscription>> = {};
  private readonly versions: Record<RequestKey, number> = {
    attributes: 0, attributeDetails: 0, attributeCreate: 0, attributeUpdate: 0,
    values: 0, valueDetails: 0, valueCreate: 0, valueUpdate: 0, status: 0
  };
  private previousFocus: HTMLElement | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly focusableSelector =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  constructor() {
    effect(() => {
      const companyId = this.companyId();
      const canView = this.canView();
      untracked(() => {
        this.resetForContextChange();
        if (this.validId(companyId) && canView) this.loadAttributes();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.cancelAll();
      this.clearFocusTimers();
    });
  }

  private validId(id: number | null | undefined): id is number {
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
  }

  private context(companyId: number, key: RequestKey, version: number): boolean {
    return this.versions[key] === version && this.companyId() === companyId && this.canView();
  }

  private cancel(key: RequestKey): number {
    this.versions[key]++;
    this.subscriptions[key]?.unsubscribe();
    delete this.subscriptions[key];
    return this.versions[key];
  }

  private cancelAll(): void {
    (Object.keys(this.versions) as RequestKey[]).forEach(key => this.cancel(key));
  }

  private busy(): boolean {
    return this.isCreating() || this.isUpdating() || this.isCreatingValue() ||
      this.isUpdatingValue() || this.isChangingStatus();
  }

  private validAttribute(attribute: ProductAttribute, companyId: number): boolean {
    return attribute.companyId === companyId && this.validId(attribute.id) &&
      typeof attribute.rowVersion === 'string' && attribute.rowVersion.length > 0;
  }

  private validValue(value: ProductAttributeValue, companyId: number, attributeId: number): boolean {
    return value.companyId === companyId && value.productAttributeId === attributeId &&
      this.validId(value.id) && typeof value.rowVersion === 'string' && value.rowVersion.length > 0;
  }

  showDirectory(): void {
    if (this.busy() || this.isStatusConfirmationOpen()) return;
    this.cancel('attributeDetails');
    this.cancel('values');
    this.cancel('valueDetails');
    this.selectedAttribute.set(null);
    this.resetValueState();
    this.isEditOpen.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {
    if (this.selectedAttribute() && !this.busy() && !this.isStatusConfirmationOpen()) {
      this.activeView.set('details');
    }
  }

  loadAttributes(): void {
    const companyId = this.companyId();
    const version = this.cancel('attributes');
    if (!this.validId(companyId) || !this.canView()) {
      this.clearAttributes();
      this.isLoadingAttributes.set(false);
      return;
    }
    const query: ProductAttributeListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(), sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(), pageSize: this.pageSize()
    };
    this.isLoadingAttributes.set(true);
    this.directoryError.set(null);
    this.subscriptions.attributes = this.api.getProductAttributes(companyId, query).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.attributes === version) this.isLoadingAttributes.set(false); })
    ).subscribe({
      next: result => {
        if (!this.context(companyId, 'attributes', version)) return;
        if (!Array.isArray(result.items) || result.items.some(x => !this.validAttribute(x, companyId))) {
          this.clearAttributes();
          this.directoryError.set('The server returned invalid product attribute records.');
          return;
        }
        this.attributes.set(result.items);
        this.totalCount.set(result.totalCount);
        this.totalPages.set(result.totalPages);
        this.pageNumber.set(result.pageNumber);
        this.pageSize.set(result.pageSize);
      },
      error: (error: HttpErrorResponse) => {
        if (!this.context(companyId, 'attributes', version)) return;
        this.clearAttributes();
        this.directoryError.set(this.errorMessage(error, 'load product attributes'));
      }
    });
  }

  refreshDirectory(): void { this.loadAttributes(); }
  searchAttributes(code: string, name: string): void {
    this.searchCode.set(code.trim()); this.searchName.set(name.trim());
    this.pageNumber.set(1); this.loadAttributes();
  }
  clearSearch(): void { this.searchAttributes('', ''); }
  filterByStatus(status: boolean | null): void {
    this.selectedIsActive.set(status);
    if (status === false) this.includeInactive.set(true);
    this.pageNumber.set(1); this.loadAttributes();
  }
  setIncludeInactive(value: boolean): void {
    this.includeInactive.set(value);
    if (!value && this.selectedIsActive() === false) this.selectedIsActive.set(null);
    this.pageNumber.set(1); this.loadAttributes();
  }
  clearFilters(): void {
    this.searchCode.set(''); this.searchName.set(''); this.selectedIsActive.set(null);
    this.includeInactive.set(false); this.sortBy.set('name'); this.sortDirection.set('asc');
    this.pageNumber.set(1); this.loadAttributes();
  }
  changeSorting(field: SortField, direction: SortDirection): void {
    this.sortBy.set(field); this.sortDirection.set(direction);
    this.pageNumber.set(1); this.loadAttributes();
  }
  previousPage(): void {
    if (this.isLoadingAttributes() || !this.hasPreviousPage()) return;
    this.pageNumber.update(n => n - 1); this.loadAttributes();
  }
  nextPage(): void {
    if (this.isLoadingAttributes() || !this.hasNextPage()) return;
    this.pageNumber.update(n => n + 1); this.loadAttributes();
  }
  changePageSize(size: number): void {
    if (!Number.isInteger(size) || size < 1 || size > 100) return;
    this.pageSize.set(size); this.pageNumber.set(1); this.loadAttributes();
  }

  viewAttribute(attributeId: number): void {
    if (this.busy() || this.isStatusConfirmationOpen()) return;
    const companyId = this.companyId();
    const version = this.cancel('attributeDetails');
    this.cancel('values'); this.cancel('valueDetails');
    this.selectedAttribute.set(null);
    this.resetValueState();
    this.isEditOpen.set(false);
    this.attributeDetailsError.set(null);
    this.activeView.set('details');
    if (!this.validId(companyId) || !this.validId(attributeId) || !this.canView()) {
      this.attributeDetailsError.set('Select a valid company and product attribute.');
      return;
    }
    this.isCreateOpen.set(false);
    this.isLoadingAttributeDetails.set(true);
    this.subscriptions.attributeDetails = this.api.getProductAttributeById(companyId, attributeId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.attributeDetails === version) this.isLoadingAttributeDetails.set(false); })
    ).subscribe({
      next: attribute => {
        if (!this.context(companyId, 'attributeDetails', version)) return;
        if (!this.validAttribute(attribute, companyId) || attribute.id !== attributeId) {
          this.attributeDetailsError.set('The server returned an invalid product attribute.');
          return;
        }
        this.selectedAttribute.set(attribute);
        this.loadValues();
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'attributeDetails', version)) {
          this.attributeDetailsError.set(this.errorMessage(error, 'load attribute details'));
        }
      }
    });
  }

  refreshAttributeDetails(): void {
    const attribute = this.selectedAttribute();
    if (attribute && !this.busy() && !this.isStatusConfirmationOpen()) this.viewAttribute(attribute.id);
  }

  openCreateAttribute(): void {
    if (!this.canCreate() || !this.validId(this.companyId()) || this.busy() || this.isStatusConfirmationOpen()) return;
    this.createForm.reset({ name: '' });
    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }
  cancelCreateAttribute(): void {
    if (this.isCreating()) return;
    this.isCreateOpen.set(false); this.createError.set(null); this.createForm.reset();
  }
  createAttribute(): void {
    const companyId = this.companyId();
    if (!this.isCreateOpen() || !this.canCreate() || !this.validId(companyId) || this.busy()) return;
    if (this.createForm.invalid) { this.createForm.markAllAsTouched(); return; }
    const name = this.createForm.controls.name.value.trim();
    if (!name) { this.createError.set('Attribute name is required.'); return; }
    const version = this.cancel('attributeCreate');
    this.isCreating.set(true); this.createError.set(null);
    this.subscriptions.attributeCreate = this.api.createProductAttribute(companyId, { name }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.attributeCreate === version) this.isCreating.set(false); })
    ).subscribe({
      next: attribute => {
        if (!this.context(companyId, 'attributeCreate', version)) return;
        if (!this.validAttribute(attribute, companyId)) {
          this.createError.set('The server returned an invalid attribute record.'); return;
        }
        this.isCreateOpen.set(false); this.createForm.reset();
        this.lastCreatedAttribute.set(attribute);
        this.selectedAttribute.set(attribute);
        this.resetValueState();
        this.activeView.set('details');
        this.pageNumber.set(1); this.loadAttributes(); this.loadValues();
        this.notifications.success(`Attribute ${attribute.code} created successfully.`, { title: 'Attribute created' });
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'attributeCreate', version)) {
          this.createError.set(this.errorMessage(error, 'create the attribute'));
        }
      }
    });
  }

  openEditAttribute(): void {
    const attribute = this.selectedAttribute();
    if (!attribute || !this.canUpdate() || this.companyId() !== attribute.companyId ||
        this.busy() || this.isStatusConfirmationOpen()) return;
    this.editForm.reset({ name: attribute.name });
    this.updateError.set(null); this.isEditOpen.set(true);
  }
  closeEditAttribute(): void {
    if (this.isUpdating()) return;
    this.isEditOpen.set(false); this.updateError.set(null); this.editForm.reset();
  }
  updateAttribute(): void {
    const attribute = this.selectedAttribute(); const companyId = this.companyId();
    if (!this.isEditOpen() || !attribute || !this.validId(companyId) ||
        !this.canUpdate() || this.busy() || !this.validAttribute(attribute, companyId)) return;
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const name = this.editForm.controls.name.value.trim();
    if (!name) { this.updateError.set('Attribute name is required.'); return; }
    if (name === attribute.name) { this.closeEditAttribute(); return; }
    const version = this.cancel('attributeUpdate');
    this.isUpdating.set(true); this.updateError.set(null);
    this.subscriptions.attributeUpdate = this.api.updateProductAttribute(companyId, attribute.id, {
      name, rowVersion: attribute.rowVersion
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      if (this.versions.attributeUpdate === version) this.isUpdating.set(false);
    })).subscribe({
      next: updated => {
        if (!this.context(companyId, 'attributeUpdate', version)) return;
        if (!this.validAttribute(updated, companyId) || updated.id !== attribute.id) {
          this.updateError.set('The server returned an invalid attribute record.'); return;
        }
        this.selectedAttribute.set(updated);
        this.attributes.update(items => items.map(x => x.id === updated.id ? updated : x));
        this.isEditOpen.set(false); this.editForm.reset(); this.loadAttributes();
        this.notifications.success(`Attribute ${updated.code} updated successfully.`, { title: 'Attribute updated' });
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'attributeUpdate', version)) {
          this.updateError.set(this.errorMessage(error, 'update the attribute'));
        }
      }
    });
  }

  loadValues(): void {
    const attribute = this.selectedAttribute(); const companyId = this.companyId();
    const version = this.cancel('values');
    if (!attribute || !this.validId(companyId) || !this.validAttribute(attribute, companyId) || !this.canView()) {
      this.clearValues(); this.isLoadingValues.set(false); return;
    }
    const attributeId = attribute.id;
    const query: ProductAttributeValueListQuery = {
      code: this.valueSearchCode().trim() || undefined,
      name: this.valueSearchName().trim() || undefined,
      isActive: this.valueSelectedIsActive() ?? undefined,
      includeInactive: this.valueIncludeInactive(),
      sortBy: this.valueSortBy(), sortDirection: this.valueSortDirection(),
      pageNumber: this.valuePageNumber(), pageSize: this.valuePageSize()
    };
    this.isLoadingValues.set(true); this.valuesError.set(null);
    this.subscriptions.values = this.api.getProductAttributeValues(companyId, attributeId, query).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.values === version) this.isLoadingValues.set(false); })
    ).subscribe({
      next: result => {
        if (!this.context(companyId, 'values', version) || this.selectedAttribute()?.id !== attributeId) return;
        if (!Array.isArray(result.items) || result.items.some(x => !this.validValue(x, companyId, attributeId))) {
          this.clearValues(); this.valuesError.set('The server returned invalid attribute values.'); return;
        }
        this.values.set(result.items); this.valueTotalCount.set(result.totalCount);
        this.valueTotalPages.set(result.totalPages); this.valuePageNumber.set(result.pageNumber);
        this.valuePageSize.set(result.pageSize);
      },
      error: (error: HttpErrorResponse) => {
        if (!this.context(companyId, 'values', version) || this.selectedAttribute()?.id !== attributeId) return;
        this.clearValues(); this.valuesError.set(this.errorMessage(error, 'load attribute values'));
      }
    });
  }
  refreshValues(): void { this.loadValues(); }
  searchValues(code: string, name: string): void {
    this.valueSearchCode.set(code.trim()); this.valueSearchName.set(name.trim());
    this.valuePageNumber.set(1); this.loadValues();
  }
  clearValueSearch(): void { this.searchValues('', ''); }
  filterValuesByStatus(status: boolean | null): void {
    this.valueSelectedIsActive.set(status);
    if (status === false) this.valueIncludeInactive.set(true);
    this.valuePageNumber.set(1); this.loadValues();
  }
  setValueIncludeInactive(value: boolean): void {
    this.valueIncludeInactive.set(value);
    if (!value && this.valueSelectedIsActive() === false) this.valueSelectedIsActive.set(null);
    this.valuePageNumber.set(1); this.loadValues();
  }
  clearValueFilters(): void {
    this.valueSearchCode.set(''); this.valueSearchName.set(''); this.valueSelectedIsActive.set(null);
    this.valueIncludeInactive.set(false); this.valueSortBy.set('name'); this.valueSortDirection.set('asc');
    this.valuePageNumber.set(1); this.loadValues();
  }
  changeValueSorting(field: SortField, direction: SortDirection): void {
    this.valueSortBy.set(field); this.valueSortDirection.set(direction);
    this.valuePageNumber.set(1); this.loadValues();
  }
  previousValuePage(): void {
    if (this.isLoadingValues() || !this.hasPreviousValuePage()) return;
    this.valuePageNumber.update(n => n - 1); this.loadValues();
  }
  nextValuePage(): void {
    if (this.isLoadingValues() || !this.hasNextValuePage()) return;
    this.valuePageNumber.update(n => n + 1); this.loadValues();
  }
  changeValuePageSize(size: number): void {
    if (!Number.isInteger(size) || size < 1 || size > 100) return;
    this.valuePageSize.set(size); this.valuePageNumber.set(1); this.loadValues();
  }

  viewValue(valueId: number): void {
    const attribute = this.selectedAttribute(); const companyId = this.companyId();
    if (!attribute || !this.validId(companyId) || !this.validId(valueId) || this.busy() || this.isStatusConfirmationOpen()) return;
    const attributeId = attribute.id;
    const version = this.cancel('valueDetails');
    this.selectedValue.set(null); this.valueDetailsError.set(null);
    this.isValueEditOpen.set(false); this.isLoadingValueDetails.set(true);
    this.subscriptions.valueDetails = this.api.getProductAttributeValueById(companyId, attributeId, valueId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.valueDetails === version) this.isLoadingValueDetails.set(false); })
    ).subscribe({
      next: value => {
        if (!this.context(companyId, 'valueDetails', version) || this.selectedAttribute()?.id !== attributeId) return;
        if (!this.validValue(value, companyId, attributeId) || value.id !== valueId) {
          this.valueDetailsError.set('The server returned an invalid attribute value.'); return;
        }
        this.selectedValue.set(value);
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'valueDetails', version) && this.selectedAttribute()?.id === attributeId) {
          this.valueDetailsError.set(this.errorMessage(error, 'load the attribute value'));
        }
      }
    });
  }
  closeValueDetails(): void {
    if (this.busy() || this.isStatusConfirmationOpen()) return;
    this.cancel('valueDetails'); this.selectedValue.set(null);
    this.valueDetailsError.set(null); this.isValueEditOpen.set(false);
  }
  refreshValueDetails(): void {
    const value = this.selectedValue();
    if (value && !this.busy() && !this.isStatusConfirmationOpen()) this.viewValue(value.id);
  }

  openCreateValue(): void {
    const attribute = this.selectedAttribute();
    if (!attribute || !attribute.isActive || !this.canCreate() || this.busy() ||
        this.isStatusConfirmationOpen() || this.companyId() !== attribute.companyId) return;
    this.valueCreateForm.reset({ name: '' }); this.valueCreateError.set(null);
    this.isValueCreateOpen.set(true);
  }
  cancelCreateValue(): void {
    if (this.isCreatingValue()) return;
    this.isValueCreateOpen.set(false); this.valueCreateError.set(null); this.valueCreateForm.reset();
  }
  createValue(): void {
    const attribute = this.selectedAttribute(); const companyId = this.companyId();
    if (!this.isValueCreateOpen() || !attribute?.isActive || !this.validId(companyId) ||
        !this.canCreate() || this.busy() || !this.validAttribute(attribute, companyId)) return;
    if (this.valueCreateForm.invalid) { this.valueCreateForm.markAllAsTouched(); return; }
    const name = this.valueCreateForm.controls.name.value.trim();
    if (!name) { this.valueCreateError.set('Value name is required.'); return; }
    const attributeId = attribute.id;
    const version = this.cancel('valueCreate');
    this.isCreatingValue.set(true); this.valueCreateError.set(null);
    this.subscriptions.valueCreate = this.api.createProductAttributeValue(companyId, attributeId, { name }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { if (this.versions.valueCreate === version) this.isCreatingValue.set(false); })
    ).subscribe({
      next: value => {
        if (!this.context(companyId, 'valueCreate', version) || this.selectedAttribute()?.id !== attributeId) return;
        if (!this.validValue(value, companyId, attributeId)) {
          this.valueCreateError.set('The server returned an invalid attribute value.'); return;
        }
        this.isValueCreateOpen.set(false); this.valueCreateForm.reset();
        this.selectedValue.set(value); this.valuePageNumber.set(1); this.loadValues();
        this.notifications.success(`Value ${value.code} created successfully.`, { title: 'Attribute value created' });
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'valueCreate', version) && this.selectedAttribute()?.id === attributeId) {
          this.valueCreateError.set(this.errorMessage(error, 'create the attribute value'));
        }
      }
    });
  }
  openEditValue(): void {
    const value = this.selectedValue(); const attribute = this.selectedAttribute();
    if (!value || !attribute || !this.canUpdate() || this.busy() || this.isStatusConfirmationOpen() ||
        !this.validId(this.companyId()) || value.productAttributeId !== attribute.id) return;
    this.valueEditForm.reset({ name: value.name }); this.valueUpdateError.set(null);
    this.isValueEditOpen.set(true);
  }
  closeEditValue(): void {
    if (this.isUpdatingValue()) return;
    this.isValueEditOpen.set(false); this.valueUpdateError.set(null); this.valueEditForm.reset();
  }
  updateValue(): void {
    const attribute = this.selectedAttribute(); const value = this.selectedValue(); const companyId = this.companyId();
    if (!this.isValueEditOpen() || !attribute || !value || !this.validId(companyId) ||
        !this.canUpdate() || this.busy() || !this.validValue(value, companyId, attribute.id)) return;
    if (this.valueEditForm.invalid) { this.valueEditForm.markAllAsTouched(); return; }
    const name = this.valueEditForm.controls.name.value.trim();
    if (!name) { this.valueUpdateError.set('Value name is required.'); return; }
    if (name === value.name) { this.closeEditValue(); return; }
    const attributeId = attribute.id;
    const version = this.cancel('valueUpdate');
    this.isUpdatingValue.set(true); this.valueUpdateError.set(null);
    this.subscriptions.valueUpdate = this.api.updateProductAttributeValue(companyId, attributeId, value.id, {
      name, rowVersion: value.rowVersion
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      if (this.versions.valueUpdate === version) this.isUpdatingValue.set(false);
    })).subscribe({
      next: updated => {
        if (!this.context(companyId, 'valueUpdate', version) || this.selectedAttribute()?.id !== attributeId) return;
        if (!this.validValue(updated, companyId, attributeId) || updated.id !== value.id) {
          this.valueUpdateError.set('The server returned an invalid attribute value.'); return;
        }
        this.selectedValue.set(updated);
        this.values.update(items => items.map(x => x.id === updated.id ? updated : x));
        this.isValueEditOpen.set(false); this.valueEditForm.reset(); this.loadValues();
        this.notifications.success(`Value ${updated.code} updated successfully.`, { title: 'Attribute value updated' });
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'valueUpdate', version) && this.selectedAttribute()?.id === attributeId) {
          this.valueUpdateError.set(this.errorMessage(error, 'update the attribute value'));
        }
      }
    });
  }

  openAttributeStatusConfirmation(): void {
    const attribute = this.selectedAttribute();
    if (!attribute || this.busy() || this.isStatusConfirmationOpen() || this.isEditOpen() ||
        this.isValueEditOpen() || this.isValueCreateOpen() || this.isCreateOpen() ||
        !(attribute.isActive ? this.canDeactivate() : this.canActivate())) return;
    this.openStatus({ kind: 'attribute', record: attribute });
  }
  openValueStatusConfirmation(value?: ProductAttributeValue): void {
    const attribute = this.selectedAttribute(); const target = value ?? this.selectedValue();
    if (!attribute || !target || this.busy() || this.isStatusConfirmationOpen() ||
        this.isValueEditOpen() || this.isValueCreateOpen() || this.isEditOpen() ||
        target.productAttributeId !== attribute.id ||
        (!attribute.isActive && !target.isActive) ||
        !(target.isActive ? this.canDeactivate() : this.canActivate())) return;
    this.openStatus({ kind: 'value', record: target, attributeId: attribute.id });
  }
  private openStatus(target: StatusTarget): void {
    const companyId = this.companyId();
    if (!this.validId(companyId) || target.record.companyId !== companyId || !target.record.rowVersion) return;
    this.clearFocusTimers();
    const active = this.document.activeElement;
    this.previousFocus = active instanceof HTMLElement ? active : null;
    this.statusError.set(null); this.pendingStatus.set(target);
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (!this.isStatusConfirmationOpen()) return;
      const dialog = this.getDialog();
      if (!dialog) return;
      const cancel = dialog.querySelector<HTMLButtonElement>('.confirmation-actions .btn-secondary');
      (cancel && !cancel.disabled ? cancel : this.focusables(dialog)[0] ?? dialog).focus();
    }, 0);
  }
  cancelStatusConfirmation(): void {
    if (!this.isChangingStatus()) this.closeStatus();
  }
  confirmStatusChange(): void {
    const target = this.pendingStatus(); const companyId = this.companyId();
    if (!target || !this.validId(companyId) || this.busy() || !this.canView()) return;
    const activating = !target.record.isActive;
    if (!(activating ? this.canActivate() : this.canDeactivate())) {
      this.statusError.set('You do not have permission to perform this action.'); return;
    }
    const attribute = this.selectedAttribute();
    if (!attribute || attribute.companyId !== companyId) {
      this.statusError.set('Attribute context changed. Close this dialog and refresh.'); return;
    }
    const current = target.kind === 'attribute'
      ? attribute
      : (this.selectedValue()?.id === target.record.id ? this.selectedValue() : this.values().find(x => x.id === target.record.id));
    if (!current || current.rowVersion !== target.record.rowVersion || current.isActive !== target.record.isActive) {
      this.statusError.set('This record changed. Close the dialog and refresh before retrying.'); return;
    }
    if (target.kind === 'value' && (!attribute.isActive && activating || target.attributeId !== attribute.id)) {
      this.statusError.set('The parent attribute must be active to activate a value.'); return;
    }
    const version = this.cancel('status');
    const request = { rowVersion: target.record.rowVersion };
    const operation = target.kind === 'attribute'
      ? (activating
          ? this.api.activateProductAttribute(companyId, target.record.id, request)
          : this.api.deactivateProductAttribute(companyId, target.record.id, request))
      : (activating
          ? this.api.activateProductAttributeValue(companyId, target.attributeId, target.record.id, request)
          : this.api.deactivateProductAttributeValue(companyId, target.attributeId, target.record.id, request));
    this.isChangingStatus.set(true); this.statusError.set(null);
    this.subscriptions.status = operation.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      if (this.versions.status === version) this.isChangingStatus.set(false);
    })).subscribe({
      next: updated => {
        if (!this.context(companyId, 'status', version) || this.selectedAttribute()?.id !== attribute.id) return;
        if (target.kind === 'attribute') {
          const result = updated as ProductAttribute;
          if (!this.validAttribute(result, companyId) || result.id !== target.record.id || result.isActive !== activating) {
            this.statusError.set('The server returned an unexpected attribute status.'); return;
          }
          this.selectedAttribute.set(result);
          this.attributes.update(items => items.map(x => x.id === result.id ? result : x));
          this.loadAttributes();
        } else {
          const result = updated as ProductAttributeValue;
          if (!this.validValue(result, companyId, target.attributeId) || result.id !== target.record.id || result.isActive !== activating) {
            this.statusError.set('The server returned an unexpected attribute value status.'); return;
          }
          if (this.selectedValue()?.id === result.id) this.selectedValue.set(result);
          this.values.update(items => items.map(x => x.id === result.id ? result : x));
          this.loadValues();
        }
        this.closeStatus();
        this.notifications.success(`${target.kind === 'attribute' ? 'Attribute' : 'Attribute value'} ${activating ? 'activated' : 'deactivated'} successfully.`,
          { title: 'Status updated' });
      },
      error: (error: HttpErrorResponse) => {
        if (this.context(companyId, 'status', version)) this.statusError.set(this.errorMessage(error, 'change status'));
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.isStatusConfirmationOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!this.isChangingStatus()) this.cancelStatusConfirmation();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = this.getDialog();
    if (!dialog) return;
    const focusable = this.focusables(dialog);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (!(active instanceof Node) || !dialog.contains(active)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault(); first.focus();
    }
  }
  private getDialog(): HTMLElement | null {
    return this.host.nativeElement.querySelector('.confirmation-dialog') as HTMLElement | null;
  }
  private focusables(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(this.focusableSelector)).filter(x =>
      x.getClientRects().length > 0 && x.getAttribute('aria-hidden') !== 'true' && !x.closest('[inert]'));
  }
  private closeStatus(): void {
    this.clearFocusTimers();
    const previous = this.previousFocus;
    this.previousFocus = null;
    this.pendingStatus.set(null); this.statusError.set(null);
    if (previous) this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      if (!this.isStatusConfirmationOpen() && previous.isConnected &&
          !previous.hasAttribute('disabled') && !previous.closest('[inert]')) previous.focus();
    }, 0);
  }
  private clearFocusTimers(): void {
    if (this.focusTimer !== null) clearTimeout(this.focusTimer);
    if (this.restoreTimer !== null) clearTimeout(this.restoreTimer);
    this.focusTimer = null; this.restoreTimer = null;
  }

  private clearAttributes(): void {
    this.attributes.set([]); this.totalCount.set(0); this.totalPages.set(0);
  }
  private clearValues(): void {
    this.values.set([]); this.valueTotalCount.set(0); this.valueTotalPages.set(0);
  }
  private resetValueState(): void {
    this.cancel('values'); this.cancel('valueDetails');
    this.cancel('valueCreate'); this.cancel('valueUpdate');
    this.clearValues(); this.selectedValue.set(null);
    this.isLoadingValues.set(false); this.isLoadingValueDetails.set(false);
    this.valuesError.set(null); this.valueDetailsError.set(null);
    this.isValueCreateOpen.set(false); this.isCreatingValue.set(false);
    this.isValueEditOpen.set(false); this.isUpdatingValue.set(false);
    this.valueCreateError.set(null); this.valueUpdateError.set(null);
    this.valueCreateForm.reset(); this.valueEditForm.reset();
    this.valuePageNumber.set(1); this.valuePageSize.set(20);
    this.valueSearchCode.set(''); this.valueSearchName.set('');
    this.valueSelectedIsActive.set(null); this.valueIncludeInactive.set(false);
    this.valueSortBy.set('name'); this.valueSortDirection.set('asc');
  }
  private resetForContextChange(): void {
    this.cancelAll(); this.clearFocusTimers(); this.previousFocus = null;
    this.pendingStatus.set(null); this.isChangingStatus.set(false); this.statusError.set(null);
    this.clearAttributes(); this.selectedAttribute.set(null); this.lastCreatedAttribute.set(null);
    this.isLoadingAttributes.set(false); this.isLoadingAttributeDetails.set(false);
    this.directoryError.set(null); this.attributeDetailsError.set(null);
    this.isCreateOpen.set(false); this.isCreating.set(false);
    this.isEditOpen.set(false); this.isUpdating.set(false);
    this.createError.set(null); this.updateError.set(null);
    this.createForm.reset(); this.editForm.reset();
    this.pageNumber.set(1); this.pageSize.set(20);
    this.searchCode.set(''); this.searchName.set(''); this.selectedIsActive.set(null);
    this.includeInactive.set(false); this.sortBy.set('name'); this.sortDirection.set('asc');
    this.resetValueState(); this.activeView.set('directory');
  }
  private errorMessage(error: HttpErrorResponse, action: string): string {
    if (error.status === 0) return 'Unable to connect to the server. Check your connection.';
    if (error.status === 400) return `Invalid request to ${action}. Review the submitted information.`;
    if (error.status === 401 || error.status === 403) return `You do not have permission to ${action}.`;
    if (error.status === 404) return 'The company, attribute, or attribute value was not found. Refresh and try again.';
    if (error.status === 409) {
      const message: unknown = (error.error as { message?: unknown } | null)?.message;
      return typeof message === 'string' && message.trim()
        ? message : 'A duplicate, dependency, or concurrency conflict occurred. Refresh and try again.';
    }
    return `Unable to ${action}. Please try again.`;
  }
}