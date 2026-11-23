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
import {
  debounceTime,
  finalize,
  Subject,
  Subscription
} from 'rxjs';

import {
  ChangeProductStatusRequest,
  CreateProductRequest,
  Product,
  ProductListQuery,
  ProductPagedResult,
  UpdateProductRequest
} from '../../models/product.model';

import { ProductService } from '../../service/product.service';

import {
  ProductSkuBarcodeManager
} from '../../components/product-sku-barcode-manager/product-sku-barcode-manager';

import {
  ProductCategory
} from '../../../product-categories/models/product-category.model';
import {
  ProductCategoryService
} from '../../../product-categories/service/product-category.service';

import {
  UnitOfMeasure
} from '../../../units-of-measurement/models/unit-of-measurement.model';
import {
  UnitOfMeasureService
} from '../../../units-of-measurement/services/unit-of-measurement.service';

import {
  ProductBrand
} from '../../../product-brands/models/product-brand.model';
import {
  ProductBrandService
} from '../../../product-brands/service/product-brand.service';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';
import {
  WorkspaceContextService
} from '../../../../../../core/workspace/services/workspace-context.service';
import {
  EffectivePermissionService
} from '../../../../../../core/authorization/effective-permission.service';
import {
  PermissionCodes
} from '../../../../../../core/authorization/permission-registry';

type ProductActiveView = 'directory' | 'details';
type ProductSortBy = 'name' | 'code' | 'id';
type ProductSortDirection = 'asc' | 'desc';

interface ProductSearchInput {
  term: string;
  companyId: number | null;
  version: number;
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [ReactiveFormsModule, ProductSkuBarcodeManager],
  templateUrl: './products.html',
  styleUrl: './products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Products {

  // =========================================================
  // Dependencies
  // =========================================================

  private readonly formBuilder = inject(FormBuilder);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(ProductCategoryService);
  private readonly unitService = inject(UnitOfMeasureService);
  private readonly brandService = inject(ProductBrandService);

  private readonly notificationService = inject(NotificationService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly permissionService = inject(EffectivePermissionService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================
  // Workspace
  //
  // Company selection is not an authorization boundary.
  // The backend validates company access on every request.
  // =========================================================

  readonly companyId = this.workspaceContext.companyId;

  // =========================================================
  // Permissions
  // =========================================================

  readonly canView = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.products.view
    )
  );

  readonly canCreate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.products.create
    )
  );

  readonly canUpdate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.products.update
    )
  );

  readonly canActivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.products.activate
    )
  );

  readonly canDeactivate = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.products.deactivate
    )
  );

  readonly canViewCategories = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productCategories.view
    )
  );

  readonly canViewUnits = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.unitsOfMeasurement.view
    )
  );

  readonly canViewBrands = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBrands.view
    )
  );

  // =========================================================
  // View State
  // =========================================================

  readonly activeView = signal<ProductActiveView>('directory');

  // =========================================================
  // Directory State
  // =========================================================

  readonly products = signal<Product[]>([]);
  readonly isLoadingProducts = signal(false);
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
  // Unified Product Search
  //
  // Backend supports:
  // - Product name
  // - Generated product code
  // - Active variant SKU
  // - Active barcode
  //
  // Legacy fields remain temporarily for compatibility
  // with the current products.html.
  // =========================================================

  readonly searchTerm = signal('');

  readonly searchCode = signal('');
  readonly searchName = signal('');

  private readonly searchInput = new Subject<ProductSearchInput>();
  private searchInputVersion = 0;

  // =========================================================
  // Directory Filters
  // =========================================================

  readonly selectedIsActive = signal<boolean | null>(null);
  readonly selectedCategoryId = signal<number | null>(null);
  readonly selectedBrandId = signal<number | null>(null);

  readonly includeInactive = signal(false);

  readonly sortBy = signal<ProductSortBy>('name');
  readonly sortDirection = signal<ProductSortDirection>('asc');

  // =========================================================
  // Reference Data
  // =========================================================

  readonly categories = signal<ProductCategory[]>([]);
  readonly unitsOfMeasurement = signal<UnitOfMeasure[]>([]);
  readonly brands = signal<ProductBrand[]>([]);

  readonly isLoadingReferenceData = signal(false);
  readonly referenceDataError = signal<string | null>(null);

  // =========================================================
  // Create State
  // =========================================================

  readonly isCreateOpen = signal(false);
  readonly isCreating = signal(false);
  readonly createError = signal<string | null>(null);

  // =========================================================
  // Details / Edit State
  // =========================================================

  readonly selectedProduct = signal<Product | null>(null);

  readonly isLoadingProductDetails = signal(false);
  readonly productDetailsError = signal<string | null>(null);

  readonly isEditOpen = signal(false);
  readonly isUpdating = signal(false);
  readonly updateError = signal<string | null>(null);

  // =========================================================
  // Status State
  // =========================================================

  readonly isChangingStatus = signal(false);
  readonly statusError = signal<string | null>(null);

  // =========================================================
  // Forms
  // =========================================================

  readonly createForm = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(200)
    ]),
    description: this.formBuilder.control<string | null>(null),
    categoryId: this.formBuilder.control<number | null>(
      null,
      Validators.required
    ),
    unitOfMeasureId: this.formBuilder.control<number | null>(
      null,
      Validators.required
    ),
    brandId: this.formBuilder.control<number | null>(null)
  });

  readonly editForm = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(200)
    ]),
    description: this.formBuilder.control<string | null>(null),
    categoryId: this.formBuilder.control<number | null>(
      null,
      Validators.required
    ),
    unitOfMeasureId: this.formBuilder.control<number | null>(
      null,
      Validators.required
    ),
    brandId: this.formBuilder.control<number | null>(null)
  });

  // =========================================================
  // Request Subscriptions
  // =========================================================

  private directorySubscription: Subscription | null = null;
  private detailsSubscription: Subscription | null = null;
  private createSubscription: Subscription | null = null;
  private updateSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;

  private categorySubscription: Subscription | null = null;
  private unitSubscription: Subscription | null = null;
  private brandSubscription: Subscription | null = null;

  // =========================================================
  // Request Versions
  // =========================================================

  private directoryRequestVersion = 0;
  private detailsRequestVersion = 0;
  private createRequestVersion = 0;
  private updateRequestVersion = 0;
  private statusRequestVersion = 0;
  private referenceRequestVersion = 0;

  private referenceRequestsRemaining = 0;
  private referenceFailures: string[] = [];

  // =========================================================
  // Lifecycle
  // =========================================================

  constructor() {

    // Debounced unified search.
    // Company and version checks prevent stale search events.
    this.searchInput
      .pipe(
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ term, companyId, version }) => {

        if (
          version !== this.searchInputVersion ||
          companyId !== this.companyId() ||
          !this.isValidId(companyId) ||
          !this.canView()
        ) {
          return;
        }

        this.applyUnifiedSearch(term);
      });

    effect(() => {
      const companyId = this.companyId();
      const canView = this.canView();

      const canViewCategories = this.canViewCategories();
      const canViewUnits = this.canViewUnits();
      const canViewBrands = this.canViewBrands();

      untracked(() => {
        this.resetForCompanyChange();

        if (!this.isValidId(companyId) || !canView) {
          return;
        }

        this.loadProducts();

        this.loadReferenceData(
          canViewCategories,
          canViewUnits,
          canViewBrands
        );
      });
    });

    this.destroyRef.onDestroy(() => {
      this.cancelAllRequests();
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

    this.closeEditProduct();
    this.cancelDetailsRequest();

    this.isLoadingProductDetails.set(false);
    this.activeView.set('directory');
  }

  showDetails(): void {

    if (
      !this.selectedProduct() ||
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    this.activeView.set('details');
  }

  // =========================================================
  // Product Directory
  // =========================================================

  loadProducts(): void {

    const companyId = this.companyId();

    this.cancelDirectoryRequest();
    const version = this.directoryRequestVersion;

    if (!this.isValidId(companyId) || !this.canView()) {
      this.clearDirectory();
      this.isLoadingProducts.set(false);
      this.directoryError.set(null);
      return;
    }

    const query: ProductListQuery = {

      // Preferred unified search parameter.
      search: this.searchTerm().trim() || undefined,

      // Temporary backward compatibility.
      code: this.searchCode().trim() || undefined,
      name: this.searchName().trim() || undefined,

      categoryId: this.selectedCategoryId() ?? undefined,
      brandId: this.selectedBrandId() ?? undefined,
      isActive: this.selectedIsActive() ?? undefined,

      includeInactive:
        this.includeInactive() ||
        this.selectedIsActive() === false,

      sortBy: this.sortBy(),
      sortDirection: this.sortDirection(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize()
    };

    this.isLoadingProducts.set(true);
    this.directoryError.set(null);

    this.directorySubscription = this.productService
      .getProducts(companyId, query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.directoryRequestVersion) {
            this.isLoadingProducts.set(false);
          }
        })
      )
      .subscribe({
        next: (result: ProductPagedResult) => {

          if (
            version !== this.directoryRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.products.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPages.set(result.totalPages);
          this.pageNumber.set(result.pageNumber);
          this.pageSize.set(result.pageSize);
        },

        error: (error: HttpErrorResponse) => {

          if (
            version !== this.directoryRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.clearDirectory();

          this.directoryError.set(
            this.getErrorMessage(
              error,
              'Unable to load products.'
            )
          );
        }
      });
  }

  refreshDirectory(): void {
    this.loadProducts();
  }

  // =========================================================
  // Unified Search Methods
  // =========================================================

  // Used by the upcoming HTML input event.
  // API request runs after 300ms of inactivity.
  onSearchInput(value: string): void {

    this.searchInput.next({
      term: value,
      companyId: this.companyId(),
      version: ++this.searchInputVersion
    });
  }

  // Compatible with both:
  //
  // Old HTML:
  // searchProducts(code, name)
  //
  // New HTML:
  // searchProducts(search)
  searchProducts(search: string, legacyName?: string): void {

    ++this.searchInputVersion;

    if (legacyName !== undefined) {
      this.searchTerm.set('');
      this.searchCode.set(search.trim());
      this.searchName.set(legacyName.trim());
    } else {
      this.searchTerm.set(search.trim());
      this.searchCode.set('');
      this.searchName.set('');
    }

    this.pageNumber.set(1);
    this.loadProducts();
  }

  private applyUnifiedSearch(value: string): void {

    const term = value.trim();

    if (
      term === this.searchTerm() &&
      !this.searchCode() &&
      !this.searchName()
    ) {
      return;
    }

    this.searchTerm.set(term);
    this.searchCode.set('');
    this.searchName.set('');

    this.pageNumber.set(1);
    this.loadProducts();
  }

  // =========================================================
  // Directory Filters
  // =========================================================

  filterByStatus(value: string): void {

    this.selectedIsActive.set(
      value === 'active'
        ? true
        : value === 'inactive'
          ? false
          : null
    );

    this.pageNumber.set(1);
    this.loadProducts();
  }

  filterByCategory(value: string): void {

    const id = Number(value);

    this.selectedCategoryId.set(
      value !== '' && this.isValidId(id) ? id : null
    );

    this.pageNumber.set(1);
    this.loadProducts();
  }

  filterByBrand(value: string): void {

    const id = Number(value);

    this.selectedBrandId.set(
      value !== '' && this.isValidId(id) ? id : null
    );

    this.pageNumber.set(1);
    this.loadProducts();
  }

  setIncludeInactive(value: boolean): void {

    this.includeInactive.set(value);
    this.pageNumber.set(1);
    this.loadProducts();
  }

  changeSorting(value: string): void {

    const [sort, direction] = value.split(':');

    if (
      (sort !== 'name' && sort !== 'code' && sort !== 'id') ||
      (direction !== 'asc' && direction !== 'desc')
    ) {
      return;
    }

    this.sortBy.set(sort);
    this.sortDirection.set(direction);

    this.pageNumber.set(1);
    this.loadProducts();
  }

  clearFilters(): void {

    ++this.searchInputVersion;

    this.searchTerm.set('');
    this.searchCode.set('');
    this.searchName.set('');

    this.selectedIsActive.set(null);
    this.selectedCategoryId.set(null);
    this.selectedBrandId.set(null);

    this.includeInactive.set(false);

    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.loadProducts();
  }

  // =========================================================
  // Pagination
  // =========================================================

  previousPage(): void {

    if (
      this.isLoadingProducts() ||
      !this.hasPreviousPage()
    ) {
      return;
    }

    this.pageNumber.update(page =>
      Math.max(1, page - 1)
    );

    this.loadProducts();
  }

  nextPage(): void {

    if (
      this.isLoadingProducts() ||
      !this.hasNextPage()
    ) {
      return;
    }

    this.pageNumber.update(page => page + 1);
    this.loadProducts();
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
    this.loadProducts();
  }

  // =========================================================
  // Reference Data
  // =========================================================
    private loadReferenceData(
    allowCategories: boolean,
    allowUnits: boolean,
    allowBrands: boolean
  ): void {

    const companyId = this.companyId();

    this.cancelReferenceRequests();
    const version = this.referenceRequestVersion;

    this.categories.set([]);
    this.unitsOfMeasurement.set([]);
    this.brands.set([]);

    this.referenceDataError.set(null);
    this.referenceFailures = [];

    if (!this.isValidId(companyId)) {
      this.isLoadingReferenceData.set(false);
      return;
    }

    const requestCount =
      Number(allowCategories) +
      Number(allowUnits) +
      Number(allowBrands);

    this.referenceRequestsRemaining = requestCount;
    this.isLoadingReferenceData.set(requestCount > 0);

    if (!allowCategories) {
      this.referenceFailures.push(
        'Category lookup permission is unavailable.'
      );
    }

    if (!allowUnits) {
      this.referenceFailures.push(
        'Unit lookup permission is unavailable.'
      );
    }

    if (!allowBrands) {
      this.referenceFailures.push(
        'Brand lookup permission is unavailable.'
      );
    }

    if (requestCount === 0) {
      this.finishReferenceLoading(version);
      return;
    }

    if (allowCategories) {

      this.categorySubscription = this.categoryService
        .getProductCategories(companyId, {
          includeInactive: false,
          isActive: true,
          pageNumber: 1,
          pageSize: 100,
          sortBy: 'name',
          sortDirection: 'asc'
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.categories.set(result.items);
              this.completeReferenceRequest(version);
            }
          },
          error: () => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.referenceFailures.push(
                'Unable to load product categories.'
              );
              this.completeReferenceRequest(version);
            }
          }
        });
    }

    if (allowUnits) {

      this.unitSubscription = this.unitService
        .getUnitsOfMeasurement(companyId, {
          includeInactive: false,
          isActive: true,
          pageNumber: 1,
          pageSize: 100,
          sortBy: 'name',
          sortDirection: 'asc'
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.unitsOfMeasurement.set(result.items);
              this.completeReferenceRequest(version);
            }
          },
          error: () => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.referenceFailures.push(
                'Unable to load units of measurement.'
              );
              this.completeReferenceRequest(version);
            }
          }
        });
    }

    if (allowBrands) {

      this.brandSubscription = this.brandService
        .getProductBrands(companyId, {
          includeInactive: false,
          isActive: true,
          pageNumber: 1,
          pageSize: 100,
          sortBy: 'name',
          sortDirection: 'asc'
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.brands.set(result.items);
              this.completeReferenceRequest(version);
            }
          },
          error: () => {
            if (this.isCurrentReferenceRequest(version, companyId)) {
              this.referenceFailures.push(
                'Unable to load product brands.'
              );
              this.completeReferenceRequest(version);
            }
          }
        });
    }
  }

  private isCurrentReferenceRequest(
    version: number,
    companyId: number
  ): boolean {

    return (
      version === this.referenceRequestVersion &&
      this.companyId() === companyId &&
      this.canView()
    );
  }

  private completeReferenceRequest(version: number): void {

    if (version !== this.referenceRequestVersion) {
      return;
    }

    this.referenceRequestsRemaining = Math.max(
      0,
      this.referenceRequestsRemaining - 1
    );

    if (this.referenceRequestsRemaining === 0) {
      this.finishReferenceLoading(version);
    }
  }

  private finishReferenceLoading(version: number): void {

    if (version !== this.referenceRequestVersion) {
      return;
    }

    this.isLoadingReferenceData.set(false);

    this.referenceDataError.set(
      this.referenceFailures.length > 0
        ? this.referenceFailures.join(' ')
        : null
    );
  }

  categoryName(categoryId: number): string {

    const category = this.categories().find(
      item => item.id === categoryId
    );

    return category?.name ?? `Category #${categoryId}`;
  }

  unitName(unitId: number): string {

    const unit = this.unitsOfMeasurement().find(
      item => item.id === unitId
    );

    return unit
      ? `${unit.name} (${unit.symbol})`
      : `Unit #${unitId}`;
  }

  brandName(brandId: number | null): string {

    if (brandId === null) {
      return 'No brand';
    }

    const brand = this.brands().find(
      item => item.id === brandId
    );

    return brand?.name ?? `Brand #${brandId}`;
  }

  // =========================================================
  // Product Details
  // =========================================================

  viewProduct(productId: number): void {

    if (
      !this.isValidId(productId) ||
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    const companyId = this.companyId();

    this.cancelDetailsRequest();
    const version = this.detailsRequestVersion;

    this.isEditOpen.set(false);
    this.selectedProduct.set(null);

    this.productDetailsError.set(null);
    this.updateError.set(null);
    this.statusError.set(null);

    if (!this.isValidId(companyId) || !this.canView()) {
      this.productDetailsError.set(
        'Select a valid company and product.'
      );
      this.activeView.set('details');
      return;
    }

    this.isCreateOpen.set(false);
    this.activeView.set('details');
    this.isLoadingProductDetails.set(true);

    this.detailsSubscription = this.productService
      .getProduct(companyId, productId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.detailsRequestVersion) {
            this.isLoadingProductDetails.set(false);
          }
        })
      )
      .subscribe({
        next: product => {

          if (
            version !== this.detailsRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedProduct.set(product);
        },

        error: (error: HttpErrorResponse) => {

          if (
            version !== this.detailsRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.productDetailsError.set(
            this.getErrorMessage(
              error,
              'Unable to load product details.'
            )
          );
        }
      });
  }

  refreshProductDetails(): void {

    if (this.isUpdating() || this.isChangingStatus()) {
      return;
    }

    const product = this.selectedProduct();

    if (product) {
      this.viewProduct(product.id);
    }
  }

  // =========================================================
  // Create Product
  // =========================================================

  openCreateProduct(): void {

    if (
      !this.canCreate() ||
      this.isCreating() ||
      this.isUpdating() ||
      this.isChangingStatus()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (!this.isValidId(companyId)) {
      this.notificationService.error(
        'Select a company before creating a product.',
        { title: 'Company selection required' }
      );
      return;
    }

    this.createForm.reset({
      name: '',
      description: null,
      categoryId: null,
      unitOfMeasureId: null,
      brandId: null
    });

    this.createError.set(null);
    this.isCreateOpen.set(true);
    this.activeView.set('directory');
  }

  cancelCreateProduct(): void {

    if (this.isCreating()) {
      return;
    }

    this.isCreateOpen.set(false);
    this.createError.set(null);
    this.createForm.reset();
  }

  createProduct(): void {

    if (
      !this.isCreateOpen() ||
      this.isCreating() ||
      !this.canCreate()
    ) {
      return;
    }

    const companyId = this.companyId();

    if (!this.isValidId(companyId)) {
      this.createError.set('Select a valid company.');
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();
    const name = value.name.trim();

    if (!name) {
      this.createForm.controls.name.setErrors({
        required: true
      });
      this.createForm.markAllAsTouched();
      return;
    }

    if (
      !this.isValidId(value.categoryId) ||
      !this.isValidId(value.unitOfMeasureId)
    ) {
      this.createForm.markAllAsTouched();
      this.createError.set(
        'Select a valid category and unit of measurement.'
      );
      return;
    }

    if (
      !this.categories().some(
        category =>
          category.id === value.categoryId &&
          category.isActive
      ) ||
      !this.unitsOfMeasurement().some(
        unit =>
          unit.id === value.unitOfMeasureId &&
          unit.isActive
      )
    ) {
      this.createError.set(
        'Select an active category and unit of measurement.'
      );
      return;
    }

    if (
      value.brandId !== null &&
      !this.brands().some(
        brand =>
          brand.id === value.brandId &&
          brand.isActive
      )
    ) {
      this.createError.set(
        'Select an active brand.'
      );
      return;
    }

    const request: CreateProductRequest = {
      name,
      description: value.description?.trim() || null,
      categoryId: value.categoryId,
      unitOfMeasureId: value.unitOfMeasureId,
      brandId: value.brandId
    };

    this.cancelCreateRequest();
    const version = this.createRequestVersion;

    this.createError.set(null);
    this.isCreating.set(true);

    this.createSubscription = this.productService
      .createProduct(companyId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.createRequestVersion) {
            this.isCreating.set(false);
          }
        })
      )
      .subscribe({
        next: product => {

          if (
            version !== this.createRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.cancelDetailsRequest();

          this.selectedProduct.set(product);
          this.productDetailsError.set(null);
          this.isLoadingProductDetails.set(false);

          this.isCreateOpen.set(false);
          this.createForm.reset();

          this.notificationService.success(
            `Product ${product.code} created successfully.`,
            { title: 'Product created' }
          );

          this.pageNumber.set(1);
          this.loadProducts();

          this.activeView.set('details');
        },

        error: (error: HttpErrorResponse) => {

          if (
            version !== this.createRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          this.notificationService.error(
            this.getErrorMessage(
              error,
              'Unable to create the product.'
            ),
            { title: 'Product creation failed' }
          );
        }
      });
  }

  // =========================================================
  // Edit Product
  // =========================================================
    openEditProduct(): void {

    const product = this.selectedProduct();

    if (
      !product ||
      !this.canUpdate() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      this.isLoadingProductDetails() ||
      this.companyId() !== product.companyId
    ) {
      return;
    }

    this.editForm.reset({
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      unitOfMeasureId: product.unitOfMeasureId,
      brandId: product.brandId
    });

    this.updateError.set(null);
    this.isEditOpen.set(true);
  }

  closeEditProduct(): void {

    if (this.isUpdating()) {
      return;
    }

    this.isEditOpen.set(false);
    this.updateError.set(null);
    this.editForm.reset();
  }

  updateProduct(): void {

    if (
      !this.isEditOpen() ||
      this.isUpdating() ||
      this.isChangingStatus() ||
      !this.canUpdate()
    ) {
      return;
    }

    const product = this.selectedProduct();
    const companyId = this.companyId();

    if (
      !product ||
      !this.isValidId(companyId) ||
      product.companyId !== companyId ||
      !product.rowVersion
    ) {
      this.updateError.set(
        'Product details are unavailable. Refresh and try again.'
      );
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const value = this.editForm.getRawValue();
    const name = value.name.trim();

    if (
      !name ||
      !this.isValidId(value.categoryId) ||
      !this.isValidId(value.unitOfMeasureId)
    ) {
      this.editForm.markAllAsTouched();
      this.updateError.set(
        'Enter a product name, category and unit.'
      );
      return;
    }

    if (
      !this.categories().some(
        category =>
          category.id === value.categoryId &&
          category.isActive
      ) ||
      !this.unitsOfMeasurement().some(
        unit =>
          unit.id === value.unitOfMeasureId &&
          unit.isActive
      )
    ) {
      this.updateError.set(
        'The selected category or unit is unavailable or inactive.'
      );
      return;
    }

    if (
      value.brandId !== null &&
      !this.brands().some(
        brand =>
          brand.id === value.brandId &&
          brand.isActive
      )
    ) {
      this.updateError.set(
        'The selected brand is unavailable or inactive.'
      );
      return;
    }

    const request: UpdateProductRequest = {
      name,
      description: value.description?.trim() || null,
      categoryId: value.categoryId,
      unitOfMeasureId: value.unitOfMeasureId,
      brandId: value.brandId,
      rowVersion: product.rowVersion
    };

    this.cancelUpdateRequest();
    const version = this.updateRequestVersion;

    this.updateError.set(null);
    this.isUpdating.set(true);

    this.updateSubscription = this.productService
      .updateProduct(companyId, product.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.updateRequestVersion) {
            this.isUpdating.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            version !== this.updateRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedProduct.set(updated);

          this.products.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.isEditOpen.set(false);
          this.editForm.reset();

          this.notificationService.success(
            `Product ${updated.code} updated successfully.`,
            { title: 'Product updated' }
          );

          this.loadProducts();
        },

        error: (error: HttpErrorResponse) => {

          if (
            version !== this.updateRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getErrorMessage(
            error,
            'Unable to update the product.'
          );

          this.updateError.set(message);

          this.notificationService.error(
            message,
            { title: 'Product update failed' }
          );
        }
      });
  }

  // =========================================================
  // Product Status
  // =========================================================

  changeProductStatus(isActive: boolean): void {

    const product = this.selectedProduct();
    const companyId = this.companyId();

    if (
      !product ||
      !this.isValidId(companyId) ||
      product.companyId !== companyId ||
      !product.rowVersion ||
      product.isActive === isActive ||
      !this.canView() ||
      this.isChangingStatus() ||
      this.isUpdating() ||
      this.isCreating() ||
      this.isEditOpen() ||
      this.isLoadingProductDetails() ||
      !(isActive ? this.canActivate() : this.canDeactivate())
    ) {
      return;
    }

    const request: ChangeProductStatusRequest = {
      isActive,
      rowVersion: product.rowVersion
    };

    this.cancelStatusRequest();
    const version = this.statusRequestVersion;

    this.statusError.set(null);
    this.isChangingStatus.set(true);

    this.statusSubscription = this.productService
      .changeProductStatus(companyId, product.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (version === this.statusRequestVersion) {
            this.isChangingStatus.set(false);
          }
        })
      )
      .subscribe({
        next: updated => {

          if (
            version !== this.statusRequestVersion ||
            this.companyId() !== companyId ||
            !this.canView()
          ) {
            return;
          }

          this.selectedProduct.set(updated);

          this.products.update(items =>
            items.map(item =>
              item.id === updated.id ? updated : item
            )
          );

          this.notificationService.success(
            `Product ${updated.code} ${
              isActive ? 'activated' : 'deactivated'
            } successfully.`,
            { title: 'Product status updated' }
          );

          this.loadProducts();
        },

        error: (error: HttpErrorResponse) => {

          if (
            version !== this.statusRequestVersion ||
            this.companyId() !== companyId
          ) {
            return;
          }

          const message = this.getErrorMessage(
            error,
            'Unable to change product status.'
          );

          this.statusError.set(message);

          this.notificationService.error(
            message,
            { title: 'Product status change failed' }
          );
        }
      });
  }

  // =========================================================
  // Workspace Reset
  // =========================================================

  private resetForCompanyChange(): void {

    this.cancelAllRequests();

    this.isLoadingProducts.set(false);
    this.isLoadingProductDetails.set(false);
    this.isLoadingReferenceData.set(false);

    this.isCreating.set(false);
    this.isUpdating.set(false);
    this.isChangingStatus.set(false);

    this.isCreateOpen.set(false);
    this.isEditOpen.set(false);

    this.createForm.reset();
    this.editForm.reset();

    this.createError.set(null);
    this.updateError.set(null);
    this.statusError.set(null);

    this.selectedProduct.set(null);
    this.productDetailsError.set(null);

    // Invalidate pending debounced search events.
    ++this.searchInputVersion;

    this.searchTerm.set('');
    this.searchCode.set('');
    this.searchName.set('');

    this.selectedIsActive.set(null);
    this.selectedCategoryId.set(null);
    this.selectedBrandId.set(null);

    this.includeInactive.set(false);
    this.sortBy.set('name');
    this.sortDirection.set('asc');

    this.pageNumber.set(1);
    this.pageSize.set(20);

    this.clearDirectory();

    this.categories.set([]);
    this.unitsOfMeasurement.set([]);
    this.brands.set([]);

    this.referenceDataError.set(null);
    this.referenceFailures = [];
    this.referenceRequestsRemaining = 0;

    this.directoryError.set(null);
    this.activeView.set('directory');
  }

  private clearDirectory(): void {

    this.products.set([]);
    this.totalCount.set(0);
    this.totalPages.set(0);
  }

  // =========================================================
  // Request Cancellation
  // =========================================================

  private cancelAllRequests(): void {

    this.cancelDirectoryRequest();
    this.cancelDetailsRequest();
    this.cancelCreateRequest();
    this.cancelUpdateRequest();
    this.cancelStatusRequest();
    this.cancelReferenceRequests();
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

  private cancelStatusRequest(): void {

    ++this.statusRequestVersion;
    this.statusSubscription?.unsubscribe();
    this.statusSubscription = null;
  }

  private cancelReferenceRequests(): void {

    ++this.referenceRequestVersion;

    this.categorySubscription?.unsubscribe();
    this.unitSubscription?.unsubscribe();
    this.brandSubscription?.unsubscribe();

    this.categorySubscription = null;
    this.unitSubscription = null;
    this.brandSubscription = null;

    this.referenceRequestsRemaining = 0;
  }

  // =========================================================
  // Utilities
  // =========================================================

  private isValidId(value: number | null): value is number {

    return (
      value !== null &&
      Number.isSafeInteger(value) &&
      value > 0
    );
  }

  private getErrorMessage(
    error: HttpErrorResponse,
    fallback: string
  ): string {

    if (error.status === 0) {
      return 'Unable to connect to the server. Check your connection.';
    }

    if (error.status === 400) {
      return 'Invalid request. Review the information and try again.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'You do not have permission to perform this action.';
    }

    if (error.status === 404) {
      return 'The requested company or product was not found.';
    }

    if (error.status === 409) {

      const message = error.error?.message;

      return typeof message === 'string' && message.trim()
        ? message
        : 'The record has changed or conflicts with another record. Refresh and try again.';
    }

    return fallback;
  }
}