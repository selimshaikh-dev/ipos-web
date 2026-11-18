
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { finalize, Subscription } from 'rxjs';

import {
  ChangeProductCategoryStatusRequest,
  CreateProductCategoryRequest,
  ProductCategory,
  ProductCategoryListQuery,
  ProductCategoryPagedResult,
  UpdateProductCategoryRequest
} from '../../models/product-category.model';

import { ProductCategoryService } from '../../service/product-category.service';
import { NotificationService } from '../../../../../../core/notifications/notification.service';
import { WorkspaceContextService } from '../../../../../../core/workspace/services/workspace-context.service';
import { EffectivePermissionService } from '../../../../../../core/authorization/effective-permission.service';
import { PermissionCodes } from '../../../../../../core/authorization/permission-registry';

type CategoryActiveView = 'directory' | 'details';
type CategorySortDirection = 'asc' | 'desc';
type CategoryStatusAction = 'activate' | 'deactivate';

@Component({
  selector: 'app-product-categories',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './product-categories.html',
  styleUrl: './product-categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCategories {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);
  private readonly categoryService = inject(ProductCategoryService);
  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly permissionService = inject(EffectivePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace Context
  // =========================================================

  // Workspace selection is not an authorization boundary.
  // The backend must validate company access on every request.

  readonly companyId = this.workspaceContext.companyId;

  // =========================================================
  // Permissions
  // =========================================================

  readonly canView = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.view
    )
  );

  readonly canCreate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.create
    )
  );

  readonly canUpdate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.update
    )
  );

  readonly canActivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.activate
    )
  );

  readonly canDeactivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.deactivate
    )
  );

  // =========================================================
  // Page State
  // =========================================================

  readonly activeView = signal<CategoryActiveView>('directory');

  // =========================================================
  // Create State
  // =========================================================

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly lastCreatedCategory = signal<ProductCategory | null>(null);

  // =========================================================
  // Details / Edit State
  // =========================================================

  readonly selectedCategory = signal<ProductCategory | null>(null);
  readonly isLoadingCategoryDetails = signal(false);
  readonly categoryDetailsError = signal<string | null>(null);

  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);

  // =========================================================
  // Status State
  // =========================================================

  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);
  readonly pendingStatusAction =
    signal<CategoryStatusAction | null>(null);

  // =========================================================
  // Directory State
  // =========================================================

  readonly categories = signal<ProductCategory[]>([]);
  readonly isLoadingCategories = signal(false);
  readonly directoryError = signal<string | null>(null);

  readonly totalCount = signal(0);
  readonly totalPages = signal(0);
  readonly pageNumber = signal(1);
  readonly pageSize = signal(20);

  readonly hasPreviousPage = computed(() =>
    this.pageNumber() > 1
  );

  readonly hasNextPage = computed(() =>
    this.pageNumber() < this.totalPages()
  );

  // =========================================================
  // Directory Filters
  // =========================================================

  readonly searchCode = signal('');
  readonly searchName = signal('');

  readonly selectedParentCategoryId = signal<number | null>(null);
  readonly selectedIsActive = signal<boolean | null>(null);
  readonly includeInactive = signal(false);

  readonly sortBy = signal('name');
  readonly sortDirection = signal<CategorySortDirection>('asc');

  // =========================================================
  // Parent Category Options
  // =========================================================

  readonly parentCategories = signal<ProductCategory[]>([]);
  readonly isLoadingParentCategories = signal(false);
  readonly parentCategoriesError = signal<string | null>(null);

  readonly availableCreateParents = computed(() =>
    this.parentCategories().filter(category => category.isActive)
  );

  readonly availableEditParents = computed(() => {
    const selected = this.selectedCategory();

    if (!selected) {
      return [];
    }

    // This excludes the selected category itself.
    // The backend remains responsible for preventing
    // indirect parent-child cycles.
    return this.parentCategories().filter(category =>
      category.isActive &&
      category.id !== selected.id
    );
  });

  readonly selectedParentName = computed(() => {
    const category = this.selectedCategory();

    if (!category || category.parentCategoryId === null) {
      return 'Root category';
    }

    const parent = this.parentCategories().find(
      item => item.id === category.parentCategoryId
    );

    return parent?.name ?? `Category #${category.parentCategoryId}`;
  });

  // =========================================================
  // Request Subscriptions
  // =========================================================

  private directorySubscription: Subscription | null = null;
  private detailsSubscription: Subscription | null = null;
  private createSubscription: Subscription | null = null;
  private updateSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;
  private parentsSubscription: Subscription | null = null;

  // =========================================================
  // Request Versions
  // =========================================================

  private directoryRequestVersion = 0;
  private detailsRequestVersion = 0;
  private createRequestVersion = 0;
  private updateRequestVersion = 0;
  private statusRequestVersion = 0;
  private parentsRequestVersion = 0;

  // =========================================================
  // Forms
  // =========================================================

  readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(200)
    ]],
    parentCategoryId: [0]
  });

  readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(200)
    ]],
    parentCategoryId: [0]
  });

  // =========================================================
  // Lifecycle
  // =========================================================

  constructor() {

    effect(() => {
      const companyId = this.companyId();
      const canView = this.canView();

      untracked(() => {
        this.resetForCompanyChange();

        if (
          companyId !== null &&
          Number.isSafeInteger(companyId) &&
          companyId > 0 &&
          canView
        ) {
          this.loadCategories();
          this.loadParentCategories();
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelDirectoryRequest();
      this.cancelDetailsRequest();
      this.cancelCreateRequest();
      this.cancelUpdateRequest();
      this.cancelStatusRequest();
      this.cancelParentsRequest();
    });
  }

  // =========================================================
  // Navigation
  // =========================================================

  showDirectory(): void {

    if (
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    this.closeEditCategory();
    this.cancelDetailsRequest();

    this.isLoadingCategoryDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {

    if (
      this.selectedCategory() === null ||
      this.isCreating()
    ) {
      return;
    }

    this.activeView.set('details');
  }

  // =========================================================
  // Directory Loading
  // =========================================================

  loadCategories(): void {

    const companyId = this.companyId();

    this.cancelDirectoryRequest();

    const requestVersion = this.directoryRequestVersion;

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !this.canView()
    ) {
      this.clearDirectory();
      this.isLoadingCategories.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: ProductCategoryListQuery = {
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,
      parentCategoryId:
        this.selectedParentCategoryId() ?? undefined,
      isActive: this.selectedIsActive() ?? undefined,
      includeInactive: this.includeInactive(),
      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingCategories.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.categoryService
      .getProductCategories(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (
            requestVersion === this.directoryRequestVersion
          ) {
            this.isLoadingCategories.set(false);
          }
        })
      )
      .subscribe({
        next: (result: ProductCategoryPagedResult) => {

          if (
            requestVersion !== this.directoryRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.categories.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.clearDirectory();

          this.directoryError.set(
            this.getDirectoryErrorMessage(error)
          );
        }
      });
  }

  refreshDirectory(): void {
    this.loadCategories();
  }

  // =========================================================
  // Directory Search
  // =========================================================

  searchCategories(code: string, name: string): void {

    this.searchCode.set(code.trim());
    this.searchName.set(name.trim());

    this.pageNumber.set(1);
    this.loadCategories();
  }

  clearSearch(): void {

    this.searchCode.set('');
    this.searchName.set('');

    this.pageNumber.set(1);
    this.loadCategories();
  }

  // =========================================================
  // Directory Filters
  // =========================================================

  filterByStatus(isActive: boolean | null): void {

    this.selectedIsActive.set(isActive);

    this.pageNumber.set(1);
    this.loadCategories();
  }

  filterByParent(parentCategoryId: number | null): void {

    if (
      parentCategoryId !== null &&
      (!Number.isSafeInteger(parentCategoryId) ||
        parentCategoryId <= 0)
    ) {
      return;
    }

    this.selectedParentCategoryId.set(parentCategoryId);

    this.pageNumber.set(1);
    this.loadCategories();
  }

  setIncludeInactive(includeInactive: boolean): void {

    this.includeInactive.set(includeInactive);

    this.pageNumber.set(1);
    this.loadCategories();
  }

  clearFilters(): void {

    this.searchCode.set('');
    this.searchName.set('');
    this.selectedParentCategoryId.set(null);
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.loadCategories();
  }

  // =========================================================
  // Sorting
  // =========================================================

  changeSorting(
    sortBy: string,
    direction: CategorySortDirection
  ): void {

    this.sortBy.set(sortBy);
    this.sortDirection.set(direction);

    this.pageNumber.set(1);
    this.loadCategories();
  }

  // =========================================================
  // Pagination
  // =========================================================

  previousPage(): void {

    if (
      this.isLoadingCategories() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page =>
      Math.max(1, page - 1)
    );

    this.loadCategories();
  }

  nextPage(): void {

    if (
      this.isLoadingCategories() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);

    this.loadCategories();
  }

  changePageSize(size: number): void {

    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    ) {
      return;
    }

    this.pageSize.set(size);
    this.pageNumber.set(1);

    this.loadCategories();
  }

  // =========================================================
  // Parent Category Loading
  // =========================================================

  loadParentCategories(): void {

    const companyId = this.companyId();

    this.cancelParentsRequest();

    const requestVersion = this.parentsRequestVersion;

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !this.canView()
    ) {
      this.parentCategories.set([]);
      this.isLoadingParentCategories.set(false);
      return;
    }

    this.isLoadingParentCategories.set(true);
    this.parentCategoriesError.set(null);

    const collected: ProductCategory[] = [];
    const pageSize = 100;

    const loadPage = (pageNumber: number): void => {

      if (
        requestVersion !== this.parentsRequestVersion ||
        this.companyId() !== companyId ||
        !this.canView()
      ) {
        return;
      }

      this.parentsSubscription = this.categoryService
        .getProductCategories(companyId, {
          includeInactive: true,
          sortBy: 'name',
          sortDirection: 'asc',
          pageNumber,
          pageSize
        })
        .pipe(
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: result => {

            if (
              requestVersion !== this.parentsRequestVersion ||
              this.companyId() !== companyId ||
              !this.canView()
            ) {
              return;
            }

            collected.push(...result.items);

            if (pageNumber < result.totalPages) {
              loadPage(pageNumber + 1);
              return;
            }

            this.parentCategories.set(collected);
            this.isLoadingParentCategories.set(false);
          },

          error: (error: HttpErrorResponse) => {

            if (
              requestVersion !== this.parentsRequestVersion ||
              this.companyId() !== companyId
            ) {
              return;
            }

            this.parentCategories.set([]);
            this.isLoadingParentCategories.set(false);

            this.parentCategoriesError.set(
              this.getDirectoryErrorMessage(error)
            );
          }
        });
    };

    loadPage(1);
  }

  // =========================================================
  // Category Details
  // =========================================================

  viewCategory(categoryId: number): void {

    const companyId = this.companyId();

    this.cancelDetailsRequest();

    const requestVersion = this.detailsRequestVersion;

    this.closeEditCategory();

    this.selectedCategory.set(null);
    this.lastCreatedCategory.set(null);
    this.categoryDetailsError.set(null);
    this.statusError.set(null);
    this.isLoadingCategoryDetails.set(false);

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      !Number.isSafeInteger(categoryId) ||
      categoryId <= 0 ||
      !this.canView()
    ) {
      this.categoryDetailsError.set(
        'Select a valid company and product category.'
      );

      this.activeView.set('details');
      return;
    }

    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingCategoryDetails.set(true);

    this.detailsSubscription = this.categoryService
      .getProductCategoryById(companyId, categoryId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {

          if (
            requestVersion === this.detailsRequestVersion
          ) {
            this.isLoadingCategoryDetails.set(false);
          }
        })
      )
      .subscribe({
        next: category => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedCategory.set(category);
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.detailsRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.categoryDetailsError.set(
            this.getDetailsErrorMessage(error)
          );
        }
      });
  }

  refreshCategoryDetails(): void {

    const category = this.selectedCategory();

    if (category) {
      this.viewCategory(category.id);
    }
  }

  // =========================================================
  // Create Category
  // =========================================================

  openCreateCategory(): void {

    if (
      !this.canCreate() ||
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0
    ) {
      this.notificationService.error(
        'Select a company before creating a category.',
        { title: 'Company selection required' }
      );
      return;
    }

    this.createForm.reset({
      name: '',
      parentCategoryId: 0
    });

    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateCategory(): void {

    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createCategory(): void {

    if (
      !this.isCreateOpen() ||
      this.isCreating() ||
      !this.canCreate()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0
    ) {
      this.createError.set(
        'Select a valid company before creating a category.'
      );
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();
    const name = value.name.trim();

    if (!name) {
      this.createForm.markAllAsTouched();
      this.createError.set('Category name is required.');
      return;
    }

    const parentCategoryId = this.normalizeParentId(
      value.parentCategoryId
    );

    if (
      value.parentCategoryId !== 0 &&
      parentCategoryId === null
    ) {
      this.createError.set('Select a valid parent category.');
      return;
    }

    if (
      parentCategoryId !== null &&
      !this.availableCreateParents().some(
        category => category.id === parentCategoryId
      )
    ) {
      this.createError.set(
        'The selected parent category is not available.'
      );
      return;
    }

    const request: CreateProductCategoryRequest = {
      name,
      parentCategoryId
    };

    this.cancelCreateRequest();

    const requestVersion = this.createRequestVersion;

    this.createError.set(null);
    this.isCreating.set(true);

    this.createSubscription = this.categoryService
      .createProductCategory(companyId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {

          if (
            requestVersion === this.createRequestVersion
          ) {
            this.isCreating.set(false);
          }
        })
      )
      .subscribe({
        next: category => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.cancelDetailsRequest();

          this.selectedCategory.set(category);
          this.lastCreatedCategory.set(category);
          this.categoryDetailsError.set(null);
          this.isLoadingCategoryDetails.set(false);

          this.isCreateOpen.set(false);
          this.createForm.reset();

          this.notificationService.success(
            `Category ${category.code} created successfully.`,
            { title: 'Category created' }
          );

          this.pageNumber.set(1);
          this.loadCategories();
          this.loadParentCategories();

          this.activeView.set('details');
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.createRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getCreateErrorMessage(error);

          this.createError.set(null);

          this.notificationService.error(
            message,
            { title: 'Category creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Edit Category
  // =========================================================

  openEditCategory(): void {

    const category = this.selectedCategory();

    if (
      !category ||
      !this.canUpdate() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      this.isLoadingCategoryDetails() ||
      this.companyId() !== category.companyId
    ) {
      return;
    }

    this.editForm.reset({
      name: category.name,
      parentCategoryId: category.parentCategoryId ?? 0
    });

    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditCategory(): void {

    if (this.isUpdating()) {
      return;
    }

    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateCategory(): void {

    if (
      !this.isEditOpen() ||
      this.isUpdating() ||
      !this.canUpdate()
    ) {
      return;
    }

    const category = this.selectedCategory();
    const companyId = this.companyId();

    if (
      !category ||
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      category.companyId !== companyId ||
      !category.rowVersion
    ) {
      this.updateError.set(
        'Category details are unavailable. Reload and try again.'
      );
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    const name = value.name.trim();

    if (!name) {
      this.editForm.markAllAsTouched();
      this.updateError.set('Category name is required.');
      return;
    }

    const parentCategoryId = this.normalizeParentId(
      value.parentCategoryId
    );

    if (
      value.parentCategoryId !== 0 &&
      parentCategoryId === null
    ) {
      this.updateError.set('Select a valid parent category.');
      return;
    }

    if (parentCategoryId === category.id) {
      this.updateError.set(
        'A category cannot be its own parent.'
      );
      return;
    }

    if (
      parentCategoryId !== null &&
      !this.availableEditParents().some(
        item => item.id === parentCategoryId
      )
    ) {
      this.updateError.set(
        'The selected parent category is not available.'
      );
      return;
    }

    const request: UpdateProductCategoryRequest = {
      name,
      parentCategoryId,
      rowVersion: category.rowVersion
    };

    this.cancelUpdateRequest();

    const requestVersion = this.updateRequestVersion;

    this.updateError.set(null);
    this.isUpdating.set(true);

    this.updateSubscription = this.categoryService
      .updateProductCategory(companyId, category.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {

          if (
            requestVersion === this.updateRequestVersion
          ) {
            this.isUpdating.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            requestVersion !== this.updateRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedCategory.set(updated);

          this.categories.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.isEditOpen.set(false);
          this.editForm.reset();

          this.notificationService.success(
            `Category ${updated.code} updated successfully.`,
            { title: 'Category updated' }
          );

          this.loadCategories();
          this.loadParentCategories();
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.updateRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getUpdateErrorMessage(error);

          this.updateError.set(null);

          this.notificationService.error(
            message,
            { title: 'Category update failed' }
          );
        }
      });
  }

  // =========================================================
  // Activate / Deactivate
  // =========================================================

  activateCategory(): void {
    this.changeCategoryStatus('activate');
  }

  deactivateCategory(): void {
    this.changeCategoryStatus('deactivate');
  }

  private changeCategoryStatus(
    action: CategoryStatusAction
  ): void {

    const category = this.selectedCategory();
    const companyId = this.companyId();

    if (
      !category ||
      companyId === null ||
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      category.companyId !== companyId ||
      !category.rowVersion ||
      this.isChangingStatus() ||
      this.isUpdating() ||
      this.isEditOpen()
    ) {
      return;
    }

    if (
      action === 'activate' &&
      (!this.canActivate() || category.isActive)
    ) {
      return;
    }

    if (
      action === 'deactivate' &&
      (!this.canDeactivate() || !category.isActive)
    ) {
      return;
    }

    const request: ChangeProductCategoryStatusRequest = {
      rowVersion: category.rowVersion
    };

    this.cancelStatusRequest();

    const requestVersion = this.statusRequestVersion;

    this.statusError.set(null);
    this.pendingStatusAction.set(action);
    this.isChangingStatus.set(true);

    const operation = action === 'activate'
      ? this.categoryService.activateProductCategory(
          companyId,
          category.id,
          request
        )
      : this.categoryService.deactivateProductCategory(
          companyId,
          category.id,
          request
        );

    this.statusSubscription = operation
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {

          if (
            requestVersion === this.statusRequestVersion
          ) {
            this.isChangingStatus.set(false);
            this.pendingStatusAction.set(null);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedCategory.set(updated);

          this.categories.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.notificationService.success(
            `Category ${updated.code} ${
              updated.isActive ? 'activated' : 'deactivated'
            } successfully.`,
            {
              title: updated.isActive
                ? 'Category activated'
                : 'Category deactivated'
            }
          );

          this.loadCategories();
          this.loadParentCategories();
        },

        error: (error: HttpErrorResponse) => {

          if (
            requestVersion !== this.statusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getStatusErrorMessage(error);

          this.statusError.set(message);

          this.notificationService.error(
            message,
            { title: 'Category status change failed' }
          );
        }
      });
  }

  // =========================================================
  // Category Helpers
  // =========================================================

  getParentCategoryName(
    parentCategoryId: number | null
  ): string {

    if (parentCategoryId === null) {
      return 'Root category';
    }

    const parent = this.parentCategories().find(
      category => category.id === parentCategoryId
    );

    return parent?.name ?? `Category #${parentCategoryId}`;
  }

  private normalizeParentId(value: number): number | null {

    if (value === 0) {
      return null;
    }

    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      return null;
    }

    return value;
  }

  // =========================================================
  // Workspace Reset
  // =========================================================

  private resetForCompanyChange(): void {

    this.cancelDirectoryRequest();
    this.cancelDetailsRequest();
    this.cancelCreateRequest();
    this.cancelUpdateRequest();
    this.cancelStatusRequest();
    this.cancelParentsRequest();

    this.isCreating.set(false);
    this.isUpdating.set(false);
    this.isChangingStatus.set(false);

    this.isCreateOpen.set(false);
    this.isEditOpen.set(false);

    this.createError.set(null);
    this.updateError.set(null);
    this.statusError.set(null);

    this.createForm.reset();
    this.editForm.reset();

    this.selectedCategory.set(null);
    this.lastCreatedCategory.set(null);

    this.categoryDetailsError.set(null);
    this.isLoadingCategoryDetails.set(false);

    this.searchCode.set('');
    this.searchName.set('');
    this.selectedParentCategoryId.set(null);
    this.selectedIsActive.set(null);
    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();

    this.directoryError.set(null);
    this.isLoadingCategories.set(false);

    this.parentCategories.set([]);
    this.parentCategoriesError.set(null);
    this.isLoadingParentCategories.set(false);

    this.pendingStatusAction.set(null);
    this.activeView.set('directory');
  }

  private clearDirectory(): void {

    this.categories.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
  }

  // =========================================================
  // Request Cancellation
  // =========================================================

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

  private cancelStatusRequest(): void {

    ++this.statusRequestVersion;

    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
  }

  private cancelParentsRequest(): void {

    ++this.parentsRequestVersion;

    this.parentsSubscription?.unsubscribe();
    this.parentsSubscription = null;
  }

  // =========================================================
  // Error Handling
  // =========================================================

  private getDirectoryErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid category search or filter parameters.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view product categories.';
    }

    if (error.status === 404) {
      return 'The selected company could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load product categories. Please try again.';
  }

  private getDetailsErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid category or company identifier.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to view this category.';
    }

    if (error.status === 404) {
      return 'The requested product category was not found.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to load category details. Please try again.';
  }

  private getCreateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid category details. Review the form and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to create product categories.';
    }

    if (error.status === 404) {
      return 'The company or selected parent category was not found.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'A conflict occurred while creating the product category.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to create the category. Please try again.';
  }

  private getUpdateErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'Invalid category details or parent hierarchy.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to update product categories.';
    }

    if (error.status === 404) {
      return 'The category was not found. Return to the directory and refresh.';
    }

    if (error.status === 409) {
      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'This category has changed or has a dependency conflict. Reload its details before retrying.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to update the category. Please try again.';
  }

  private getStatusErrorMessage(
    error: HttpErrorResponse
  ): string {

    if (error.status === 400) {
      return 'The category status change request is invalid.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to change this category status.';
    }

    if (error.status === 404) {
      return 'The category was not found. Refresh the directory.';
    }

    if (error.status === 409) {
      return 'The category has changed or its current dependencies prevent this status change. Reload its details.';
    }

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    return 'Unable to change category status. Please try again.';
  }
}