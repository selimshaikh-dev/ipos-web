import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';

import { HttpErrorResponse } from '@angular/common/http';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { Observable, Subscription } from 'rxjs';

import {
  ProductVariant,
  ProductVariantPagedResult
} from '../../models/product-variant.model';

import {
  ProductBarcode,
  ProductBarcodePagedResult
} from '../../models/product-barcode.model';

import {
  ProductVariantService
} from '../../service/product-variant.service';

import {
  ProductBarcodeService
} from '../../service/product-barcode.service';

import {
  EffectivePermissionService
} from '../../../../../../core/authorization/effective-permission.service';

import {
  PermissionCodes
} from '../../../../../../core/authorization/permission-registry';

import {
  NotificationService
} from '../../../../../../core/notifications/notification.service';

@Component({
  selector: 'app-product-sku-barcode-manager',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,

  template: `
    <section class="sku-manager">

      <!-- HEADER -->

      <header class="manager-header">

        <div>
          <span class="eyebrow">
            PRODUCT IDENTIFICATION
          </span>

          <h2>SKU &amp; Barcode Management</h2>

          <p>
            Manage product variants, pricing and barcode
            identification in one workspace.
          </p>
        </div>

        @if (hasContext() && canViewVariants()) {
          <button
            type="button"
            class="btn secondary"
            [disabled]="busy()"
            (click)="refresh()">
            Refresh
          </button>
        }

      </header>

      @if (!hasContext()) {

        <div class="empty-state">
          Select a company and product to manage SKUs.
        </div>

      } @else if (!canViewVariants()) {

        <div class="empty-state">
          You do not have permission to view product SKUs.
        </div>

      } @else {

        <!-- PRODUCT VARIANTS -->

        <div class="section-heading">

          <div>
            <h3>Product Variants</h3>

            <p>
              Each SKU represents a sellable variation
              of this product.
            </p>
          </div>

          @if (canCreateVariant()) {

            <button
              type="button"
              class="btn primary"
              [disabled]="busy()"
              (click)="startCreateVariant()">
              + Add SKU
            </button>

          }

        </div>

        <!-- SKU CREATE / EDIT -->

        @if (variantEditorOpen()) {

          <section class="editor-panel">

            <div class="editor-heading">

              <h3>
                {{ editingVariant()
                  ? 'Edit Product SKU'
                  : 'Create Product SKU' }}
              </h3>

              <button
                type="button"
                class="btn secondary"
                [disabled]="saving()"
                (click)="cancelVariantEditor()">
                Cancel
              </button>

            </div>

            <form
              [formGroup]="variantForm"
              (ngSubmit)="saveVariant()">

              <div class="form-grid">

                <div class="field">

                  @if (editingVariant()) {
                    <label for="ipos-sku-code">SKU *</label>
                    <input
                      id="ipos-sku-code"
                      type="text"
                      formControlName="sku"
                      placeholder="TEA-MASALA-200G"
                      maxlength="100"
                      autocomplete="off">
                  } @else {
                    <label>SKU Generation</label>
                    @if (canOverrideSku()) {
                      <div class="entry-methods" role="group" aria-label="SKU generation method">
                        <button type="button" class="entry-method"
                          [class.selected]="skuEntryMode() === 'auto'"
                          [attr.aria-pressed]="skuEntryMode() === 'auto'"
                          [disabled]="saving()"
                          (click)="selectSkuEntryMode('auto')">
                          Auto Generate
                        </button>
                        <button type="button" class="entry-method"
                          [class.selected]="skuEntryMode() === 'manual'"
                          [attr.aria-pressed]="skuEntryMode() === 'manual'"
                          [disabled]="saving()"
                          (click)="selectSkuEntryMode('manual')">
                          Manual SKU
                        </button>
                      </div>
                    }
                    @if (skuEntryMode() === 'manual' && canOverrideSku()) {
                      <label for="ipos-sku-code">Manual SKU *</label>
                      <input
                        id="ipos-sku-code"
                        type="text"
                        formControlName="sku"
                        placeholder="TEA-MASALA-200G"
                        maxlength="100"
                        autocomplete="off">
                    } @else {
                      <p class="field-hint">A unique company-scoped SKU will be generated automatically when saved.</p>
                    }
                  }

                </div>

                <div class="field">

                  <label for="ipos-sku-price">
                    Selling Price (BDT) *
                  </label>

                  <input
                    id="ipos-sku-price"
                    type="number"
                    formControlName="sellingPrice"
                    min="0"
                    step="0.01">

                </div>

                <div class="field">

                  <label for="ipos-sku-cost">
                    Cost Price (BDT)
                  </label>

                  <input
                    id="ipos-sku-cost"
                    type="number"
                    formControlName="costPrice"
                    min="0"
                    step="0.01"
                    placeholder="Optional">

                </div>

              </div>

              <p class="field-hint">
                Manual SKUs must be unique within the company.
                Prices must be zero or greater.
              </p>

              <div class="form-actions">

                <button
                  type="submit"
                  class="btn primary"
                  [disabled]="saving()">

                  @if (saving()) {
                    Saving...
                  } @else {
                    {{ editingVariant()
                      ? 'Update SKU'
                      : 'Create SKU' }}
                  }

                </button>

              </div>

            </form>

          </section>

        }

        <!-- SKU SEARCH -->

        <form
          class="search-row"
          (submit)="onSkuSearchSubmit(
            $event,
            skuSearchInput.value
          )">

          <input
            #skuSearchInput
            type="search"
            placeholder="Search by SKU"
            [value]="skuFilter()"
            [disabled]="busy()">

          <button
            type="submit"
            class="btn secondary"
            [disabled]="busy()">
            Search
          </button>

          <label class="checkbox-label">

            <input
              type="checkbox"
              [checked]="includeInactiveVariants()"
              [disabled]="busy()"
              (change)="toggleInactiveVariants(
                $any($event.target).checked
              )">

            Include inactive

          </label>

        </form>

        <!-- SKU TABLE -->

        @if (loadingVariants()) {

          <div class="empty-state">
            Loading product SKUs...
          </div>

        } @else if (variants().length === 0) {

          <div class="empty-state">
            No product SKUs found.
          </div>

        } @else {

          <div class="table-scroll">

            <table class="data-table">

              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Selling Price</th>
                  <th>Cost Price</th>
                  <th>Status</th>
                  <th class="actions-column">Actions</th>
                </tr>
              </thead>

              <tbody>

                @for (
                  variant of variants();
                  track variant.id
                ) {

                  <tr>

                    <td>
                      <span class="sku-code">
                        {{ variant.sku }}
                      </span>
                    </td>

                    <td>
                      {{ money(variant.sellingPrice) }}
                    </td>

                    <td>
                      {{ variant.costPrice === null
                        ? '—'
                        : money(variant.costPrice) }}
                    </td>

                    <td>

                      <span
                        class="status-pill"
                        [class.active]="variant.isActive"
                        [class.inactive]="!variant.isActive">

                        {{ variant.isActive
                          ? 'Active'
                          : 'Inactive' }}

                      </span>

                    </td>

                    <td>

                      <div class="row-actions">

                        @if (canViewBarcodes()) {

                          <button
                            type="button"
                            class="btn primary small barcode-action"
                            [disabled]="busy()"
                            (click)="openBarcodeModal(variant)">

                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.8"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true">

                              <path d="M3 5v14"/>
                              <path d="M7 5v14"/>
                              <path d="M10 5v14"/>
                              <path d="M14 5v14"/>
                              <path d="M17 5v14"/>
                              <path d="M21 5v14"/>

                            </svg>

                            Manage Barcodes

                          </button>

                        }

                        @if (canUpdateVariant()) {

                          <button
                            type="button"
                            class="btn secondary small"
                            [disabled]="busy()"
                            (click)="startEditVariant(variant)">
                            Edit
                          </button>

                        }

                        @if (
                          variant.isActive &&
                          canDeactivateVariant()
                        ) {

                          <button
                            type="button"
                            class="btn secondary small"
                            [disabled]="busy()"
                            (click)="changeVariantStatus(
                              variant,
                              false
                            )">
                            Deactivate
                          </button>

                        }

                        @if (
                          !variant.isActive &&
                          canActivateVariant()
                        ) {

                          <button
                            type="button"
                            class="btn secondary small"
                            [disabled]="busy()"
                            (click)="changeVariantStatus(
                              variant,
                              true
                            )">
                            Activate
                          </button>

                        }

                      </div>

                    </td>

                  </tr>

                }

              </tbody>

            </table>

          </div>

        }

        <!-- SKU PAGINATION -->

        <div class="pagination">

          <span>
            {{ variantTotal() }} SKU(s) ·
            Page {{ variantPage() }}
            of {{ variantPages() }}
          </span>

          <div class="pagination-actions">

            <button
              type="button"
              class="btn secondary small"
              [disabled]="busy() || variantPage() <= 1"
              (click)="previousVariantPage()">
              Previous
            </button>

            <button
              type="button"
              class="btn secondary small"
              [disabled]="busy() || variantPage() >= variantPages()"
              (click)="nextVariantPage()">
              Next
            </button>

          </div>

        </div>

      }

    </section>

    <!-- BARCODE WORKSPACE MODAL -->

    @if (barcodeModalOpen() && selectedVariant(); as variant) {

      <div
        class="modal-backdrop"
        (click)="requestCloseBarcodeModal()">

        <section
          #barcodeDialog
          class="barcode-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="barcode-modal-title"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="onModalKeydown($event)">

          <!-- MODAL HEADER -->

          <header class="modal-header">

            <div class="modal-title-group">

              <div class="modal-icon">

                <svg
                  width="23"
                  height="23"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true">

                  <path d="M3 5v14"/>
                  <path d="M7 5v14"/>
                  <path d="M10 5v14"/>
                  <path d="M14 5v14"/>
                  <path d="M17 5v14"/>
                  <path d="M21 5v14"/>

                </svg>

              </div>

              <div>

                <span class="eyebrow">
                  PRODUCT IDENTIFICATION
                </span>

                <h2 id="barcode-modal-title">
                  Barcode Management
                </h2>

                <p>
                  Manage barcode mappings for the
                  selected product SKU.
                </p>

              </div>

            </div>

            <button
              type="button"
              class="modal-close"
              aria-label="Close barcode management"
              (click)="requestCloseBarcodeModal()">

              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true">

                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>

              </svg>

            </button>

          </header>

          <!-- MODAL BODY -->

          <div class="modal-body">

            <!-- SELECTED SKU -->

            <section class="sku-summary">

              <div class="summary-main">

                <span class="summary-label">
                  SELECTED SKU
                </span>

                <strong class="summary-sku">
                  {{ variant.sku }}
                </strong>

                <span class="summary-caption">
                  All barcode operations will apply
                  to this SKU.
                </span>

              </div>

              <div class="summary-metrics">

                <div class="metric">

                  <span>Selling Price</span>

                  <strong>
                    {{ money(variant.sellingPrice) }}
                  </strong>

                </div>

                <div class="metric">

                  <span>Cost Price</span>

                  <strong>
                    {{ variant.costPrice === null
                      ? '—'
                      : money(variant.costPrice) }}
                  </strong>

                </div>

                <div class="metric">

                  <span>SKU Status</span>

                  <span
                    class="status-pill"
                    [class.active]="variant.isActive"
                    [class.inactive]="!variant.isActive">

                    {{ variant.isActive
                      ? 'Active'
                      : 'Inactive' }}

                  </span>

                </div>

              </div>

            </section>

            <!-- ADD BARCODE -->

            @if (canCreateBarcode() && variant.isActive) {

              <section class="modal-card">

                <div class="card-heading">

                  <div>

                    <h3>Add New Barcode</h3>

                    <p>
                      Scan an existing barcode, generate an internal barcode, or enter a code manually.
                    </p>

                  </div>

                </div>

                <div class="entry-methods" role="group" aria-label="Barcode entry method">
                  <button type="button" class="entry-method"
                    [class.selected]="barcodeEntryMode() === 'scan'"
                    [attr.aria-pressed]="barcodeEntryMode() === 'scan'"
                    [disabled]="busy()"
                    (click)="selectBarcodeEntryMode('scan')">
                    Scan barcode
                  </button>
                  <button type="button" class="entry-method"
                    [class.selected]="barcodeEntryMode() === 'generate'"
                    [attr.aria-pressed]="barcodeEntryMode() === 'generate'"
                    [disabled]="busy()"
                    (click)="selectBarcodeEntryMode('generate')">
                    Generate barcode
                  </button>
                  <button type="button" class="entry-method"
                    [class.selected]="barcodeEntryMode() === 'manual'"
                    [attr.aria-pressed]="barcodeEntryMode() === 'manual'"
                    [disabled]="busy()"
                    (click)="selectBarcodeEntryMode('manual')">
                    Type barcode manually
                  </button>
                </div>

                <p class="entry-help" id="ipos-barcode-help">
                  @if (barcodeEntryMode() === 'scan') {
                    Connect a USB/Bluetooth scanner, click the field below and scan the product.
                    Most keyboard-mode scanners enter the number automatically and send Enter to save.
                    If your scanner does not send Enter, click Add Barcode.
                  } @else if (barcodeEntryMode() === 'generate') {
                    Generate and register a unique internal barcode for this SKU.
                    No barcode input is required.
                  } @else {
                    Copy the barcode printed on the product or supplied by your vendor.
                  }
                </p>

                <form
                  [formGroup]="barcodeForm"
                  (ngSubmit)="barcodeEntryMode() !== 'generate' && createBarcode()">

                  <div class="barcode-form-grid">

                    @if (barcodeEntryMode() === 'generate') {
                      <div class="field">
                        <span class="field-hint">The server assigns the barcode when you select Generate &amp; Register.</span>
                      </div>
                    } @else {
                    <div class="field">

                      <label for="ipos-barcode-entry">
                        {{ barcodeEntryMode() === 'scan' ? 'Scan product barcode *' : 'Existing barcode number *' }}
                      </label>

                      <input
                        #barcodeInput
                        id="ipos-barcode-entry"
                        type="text"
                        formControlName="barcode"
                        [placeholder]="barcodeEntryMode() === 'scan' ? 'Click here, then scan barcode' : 'Enter code printed on product'"
                        maxlength="100"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        [readOnly]="busy()"
                        [attr.aria-invalid]="barcodeValidationAttempted() && barcodeForm.controls.barcode.invalid"
                        [attr.aria-describedby]="barcodeValidationAttempted() && barcodeForm.controls.barcode.invalid ? 'ipos-barcode-help ipos-barcode-error' : 'ipos-barcode-help'">

                      @if (barcodeValidationAttempted() && barcodeForm.controls.barcode.invalid) {
                        <span class="field-error" id="ipos-barcode-error">
                          Enter a barcode of up to 100 characters without spaces or control characters.
                        </span>
                      }
                    </div>
                    }

                    <label class="checkbox-label primary-check">

                      <input
                        type="checkbox"
                        formControlName="isPrimary"
                        (click)="busy() && $event.preventDefault()">

                      Use as default barcode for labels

                    </label>

                    <button
                      [type]="barcodeEntryMode() === 'generate' ? 'button' : 'submit'"
                      class="btn primary"
                      [disabled]="busy()"
                      (click)="barcodeEntryMode() === 'generate' ? createBarcode() : undefined">

                      @if (saving()) {
                        {{ barcodeEntryMode() === 'generate' ? 'Generating...' : 'Saving...' }}
                      } @else {
                        {{ barcodeEntryMode() === 'generate' ? 'Generate & Register' : '+ Add Barcode' }}
                      }

                    </button>

                  </div>

                </form>

                <p class="entry-footnote">
                  Default barcode: the preferred code for future label printing.
                  Other active barcodes can still identify the same SKU.
                  @if (barcodeTotal() === 0 && !loadingBarcodes() && !barcodeFilter()) {
                    The first barcode is selected as default automatically.
                  }
                </p>

              </section>

            } @else if (!variant.isActive) {

              <div class="info-note">
                This SKU is inactive. Activate the SKU
                before adding a new barcode.
              </div>

            }

            <!-- BARCODE DIRECTORY -->

            <section class="modal-card">

              <div class="card-heading">

                <div>

                  <h3>Existing Barcodes</h3>

                  <p>
                    View, search and manage the barcode
                    mappings of this SKU.
                  </p>

                </div>

                <span class="count-pill">
                  {{ barcodeTotal() }} Barcode(s)
                </span>

              </div>

              <form
                class="search-row"
                (submit)="onBarcodeSearchSubmit(
                  $event,
                  barcodeSearchInput.value
                )">

                <input
                  #barcodeSearchInput
                  type="search"
                  placeholder="Search by barcode number"
                  [value]="barcodeFilter()"
                  [disabled]="busy()">

                <button
                  type="submit"
                  class="btn secondary"
                  [disabled]="busy()">
                  Search
                </button>

                <label class="checkbox-label">

                  <input
                    type="checkbox"
                    [checked]="includeInactiveBarcodes()"
                    [disabled]="busy()"
                    (change)="toggleInactiveBarcodes(
                      $any($event.target).checked
                    )">

                  Include inactive

                </label>

              </form>

              @if (loadingBarcodes()) {

                <div class="empty-state">
                  Loading barcodes...
                </div>

              } @else if (barcodes().length === 0) {

                <div class="empty-state">

                  <div class="empty-icon">

                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      aria-hidden="true">

                      <path d="M3 5v14"/>
                      <path d="M7 5v14"/>
                      <path d="M10 5v14"/>
                      <path d="M14 5v14"/>
                      <path d="M17 5v14"/>
                      <path d="M21 5v14"/>

                    </svg>

                  </div>

                  <strong>
                    No barcodes found
                  </strong>

                  <p>
                    Add a barcode above to start
                    identifying this SKU by scanning.
                  </p>

                </div>

              } @else {

                <div class="table-scroll">

                  <table class="data-table">

                    <thead>

                      <tr>
                        <th>Barcode</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th class="actions-column">
                          Actions
                        </th>
                      </tr>

                    </thead>

                    <tbody>

                      @for (
                        barcode of barcodes();
                        track barcode.id
                      ) {

                        <tr>

                          <td>

                            <span class="barcode-value">
                              {{ barcode.barcode }}
                            </span>

                          </td>

                          <td>

                            @if (barcode.isPrimary) {

                              <span class="primary-pill">
                                Primary
                              </span>

                            } @else {

                              <span class="muted">
                                Additional
                              </span>

                            }

                          </td>

                          <td>

                            <span
                              class="status-pill"
                              [class.active]="barcode.isActive"
                              [class.inactive]="!barcode.isActive">

                              {{ barcode.isActive
                                ? 'Active'
                                : 'Inactive' }}

                            </span>

                          </td>

                          <td>

                            <div class="row-actions">

                              @if (
                                barcode.isActive &&
                                !barcode.isPrimary &&
                                canSetPrimaryBarcode()
                              ) {

                                <button
                                  type="button"
                                  class="btn secondary small"
                                  [disabled]="busy()"
                                  (click)="setPrimaryBarcode(barcode)">
                                  Make Default
                                </button>

                              }

                              @if (
                                barcode.isActive &&
                                canDeactivateBarcode()
                              ) {

                                <button
                                  type="button"
                                  class="btn secondary small"
                                  [disabled]="busy()"
                                  (click)="changeBarcodeStatus(
                                    barcode,
                                    false
                                  )">
                                  Deactivate
                                </button>

                              }

                              @if (
                                !barcode.isActive &&
                                canActivateBarcode()
                              ) {

                                <button
                                  type="button"
                                  class="btn secondary small"
                                  [disabled]="busy()"
                                  (click)="changeBarcodeStatus(
                                    barcode,
                                    true
                                  )">
                                  Activate
                                </button>

                              }

                            </div>

                          </td>

                        </tr>

                      }

                    </tbody>

                  </table>

                </div>

              }

              <!-- BARCODE PAGINATION -->

              <div class="pagination">

                <span>
                  {{ barcodeTotal() }} Barcode(s) ·
                  Page {{ barcodePage() }}
                  of {{ barcodePages() }}
                </span>

                <div class="pagination-actions">

                  <button
                    type="button"
                    class="btn secondary small"
                    [disabled]="busy() || barcodePage() <= 1"
                    (click)="previousBarcodePage()">
                    Previous
                  </button>

                  <button
                    type="button"
                    class="btn secondary small"
                    [disabled]="busy() || barcodePage() >= barcodePages()"
                    (click)="nextBarcodePage()">
                    Next
                  </button>

                </div>

              </div>

            </section>

          </div>

          <!-- MODAL FOOTER -->

          <footer class="modal-footer">

            <div class="footer-hint">
              Changes are saved to the selected company
              and SKU.
            </div>

            <div class="footer-actions">

              <button
                type="button"
                class="btn secondary"
                [disabled]="busy()"
                (click)="refreshBarcodes()">
                Refresh
              </button>

              <button
                type="button"
                class="btn primary"
                (click)="requestCloseBarcodeModal()">
                Close
              </button>

            </div>

          </footer>

        </section>

      </div>

    }

  `,

  styles: [`

    :host {
      display: block;
      width: 100%;
      min-width: 0;
      font-family: inherit;
      color: #101828;
    }

    * {
      box-sizing: border-box;
    }

    .sku-manager {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --border: #dce4ef;
      --muted: #667085;
      --surface: #ffffff;
      --surface-soft: #f8fbff;

      width: 100%;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }

    .manager-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 1px solid #dce4ef;
    }

    .manager-header h2 {
      margin: 8px 0;
      font-size: 17px;
      font-weight: 700;
    }

    .manager-header p,
    .section-heading p,
    .card-heading p {
      margin: 0;
      color: #667085;
      font-size: 12px;
      line-height: 1.7;
    }

    .eyebrow {
      color: #2563eb;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .7px;
    }

    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      margin: 22px 0 14px;
    }

    .section-heading h3 {
      margin: 0 0 5px;
      font-size: 14px;
      font-weight: 700;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 35px;
      padding: 8px 13px;
      border: 1px solid transparent;
      border-radius: 7px;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      cursor: pointer;
      transition:
        background-color 150ms ease,
        border-color 150ms ease,
        box-shadow 150ms ease;
    }

    .btn.primary {
      background: #2563eb;
      color: #ffffff;
    }

    .btn.primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn.secondary {
      border-color: #d4ddeb;
      background: #ffffff;
      color: #243247;
    }

    .btn.secondary:hover:not(:disabled) {
      background: #f4f7fb;
    }

    .btn.small {
      min-height: 30px;
      padding: 6px 10px;
      font-size: 10px;
    }

    .btn:disabled {
      opacity: .5;
      cursor: not-allowed;
    }

    .btn:focus-visible,
    input:focus-visible,
    .modal-close:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .barcode-action {
      min-width: 136px;
    }

    .editor-panel {
      margin: 14px 0;
      padding: 16px;
      border: 1px solid #d6e4ff;
      border-radius: 9px;
      background: #f8fbff;
    }

    .editor-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 15px;
    }

    .editor-heading h3 {
      margin: 0;
      font-size: 13px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 13px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
    }

    .field label {
      color: #344054;
      font-size: 11px;
      font-weight: 600;
    }

    .field input,
    .search-row > input {
      width: 100%;
      min-width: 0;
      min-height: 37px;
      padding: 8px 12px;
      border: 1px solid #d0d9e8;
      border-radius: 7px;
      background: #ffffff;
      color: #101828;
      font: inherit;
      font-size: 12px;
    }

    .field input:focus,
    .search-row > input:focus {
      border-color: #2563eb;
    }

    .field-hint {
      margin: 9px 0 0;
      color: #667085;
      font-size: 10px;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 14px;
    }

    .search-row {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 14px 0;
    }

    .search-row > input {
      flex: 1 1 auto;
    }

    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #344054;
      font-size: 11px;
      white-space: nowrap;
      cursor: pointer;
    }

    .checkbox-label input {
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: #2563eb;
    }

    .table-scroll {
      width: 100%;
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .data-table th {
      padding: 13px 12px;
      border-bottom: 1px solid #dce4ef;
      background: #f7f9fc;
      color: #475467;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .data-table td {
      padding: 12px;
      border-bottom: 1px solid #eef1f6;
      font-size: 11px;
      vertical-align: middle;
    }

    .actions-column {
      text-align: right;
    }

    .row-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 7px;
    }

    .sku-code {
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .status-pill,
    .primary-pill,
    .count-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
    }

    .status-pill.active {
      background: #ecfdf3;
      color: #067647;
    }

    .status-pill.inactive {
      background: #f2f4f7;
      color: #667085;
    }

    .primary-pill {
      background: #eff6ff;
      color: #1d4ed8;
    }

    .count-pill {
      background: #eff6ff;
      color: #1d4ed8;
      white-space: nowrap;
    }

    .muted {
      color: #667085;
    }

    .barcode-value {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
      color: #667085;
      font-size: 11px;
    }

    .pagination-actions {
      display: flex;
      gap: 8px;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
      min-height: 120px;
      padding: 30px 15px;
      color: #667085;
      font-size: 12px;
      text-align: center;
    }

    .empty-state strong {
      color: #344054;
      font-size: 13px;
    }

    .empty-state p {
      margin: 0;
      font-size: 11px;
    }

    .empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      margin-bottom: 5px;
      border-radius: 15px;
      background: #eff6ff;
      color: #2563eb;
    }

    /* MODAL BACKDROP */

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1050;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, .58);
      backdrop-filter: blur(3px);
    }

    /* WORKSPACE MODAL */

    .barcode-modal {
      display: flex;
      flex-direction: column;
      width: min(960px, 100%);
      max-height: calc(100dvh - 40px);
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
      box-shadow:
        0 24px 80px rgba(15, 23, 42, .24);
      outline: none;
    }

    /* MODAL HEADER */

    .modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex: 0 0 auto;
      gap: 16px;
      padding: 22px 25px;
      border-bottom: 1px solid #e5eaf2;
      background: #ffffff;
    }

    .modal-title-group {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      min-width: 0;
    }

    .modal-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 46px;
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: #eff6ff;
      color: #2563eb;
    }

    .modal-header h2 {
      margin: 5px 0 5px;
      font-size: 19px;
      font-weight: 750;
    }

    .modal-header p {
      margin: 0;
      color: #667085;
      font-size: 12px;
      line-height: 1.6;
    }

    .modal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 35px;
      width: 35px;
      height: 35px;
      border: 1px solid #e0e6ef;
      border-radius: 8px;
      background: #ffffff;
      color: #475467;
      cursor: pointer;
    }

    .modal-close:hover {
      background: #f8fafc;
    }

    /* MODAL BODY */

    .modal-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 22px 25px;
      background: #f8fafc;
    }

    /* SELECTED SKU SUMMARY */

    .sku-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 18px;
      padding: 18px;
      border: 1px solid #dce6f4;
      border-radius: 10px;
      background: #ffffff;
    }

    .summary-main {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .summary-label {
      color: #667085;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .5px;
    }

    .summary-sku {
      color: #1d4ed8;
      font-size: 16px;
      font-weight: 750;
      overflow-wrap: anywhere;
    }

    .summary-caption {
      color: #667085;
      font-size: 11px;
    }

    .summary-metrics {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 100px;
      padding: 10px 13px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .metric > span:first-child {
      color: #667085;
      font-size: 10px;
    }

    .metric strong {
      color: #101828;
      font-size: 12px;
    }

    /* MODAL CARDS */

    .modal-card {
      margin-bottom: 18px;
      padding: 19px;
      border: 1px solid #e0e7f0;
      border-radius: 10px;
      background: #ffffff;
    }

    .card-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 17px;
    }

    .card-heading h3 {
      margin: 0 0 5px;
      color: #101828;
      font-size: 14px;
      font-weight: 700;
    }

    .barcode-form-grid {
      display: grid;
      grid-template-columns:
        minmax(0, 1fr)
        auto
        auto;
      align-items: end;
      gap: 14px;
    }

    .entry-methods {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .entry-method {
      padding: 9px 14px;
      border: 1px solid #d4ddeb;
      border-radius: 8px;
      background: #fff;
      color: #344054;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .entry-method.selected {
      border-color: #2563eb;
      background: #eff6ff;
      color: #1d4ed8;
    }

    .entry-method:disabled {
      opacity: .5;
      cursor: not-allowed;
    }

    .entry-method:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .entry-help,
    .entry-footnote {
      margin: 0 0 14px;
      color: #475467;
      font-size: 11px;
      line-height: 1.7;
    }

    .entry-footnote {
      margin: 12px 0 0;
      color: #667085;
    }

    .field-error {
      color: #b42318;
      font-size: 11px;
      line-height: 1.5;
    }

    .primary-check {
      min-height: 37px;
    }

    .info-note {
      margin-bottom: 18px;
      padding: 14px 16px;
      border: 1px solid #fedf89;
      border-radius: 9px;
      background: #fffaeb;
      color: #92400e;
      font-size: 12px;
    }

    /* MODAL FOOTER */

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 0 0 auto;
      gap: 16px;
      padding: 15px 25px;
      border-top: 1px solid #e5eaf2;
      background: #ffffff;
    }

    .footer-hint {
      color: #667085;
      font-size: 11px;
      line-height: 1.5;
    }

    .footer-actions {
      display: flex;
      gap: 9px;
    }

    /* RESPONSIVE */

    @media (max-width: 900px) {

      .form-grid {
        grid-template-columns: 1fr;
      }

      .barcode-form-grid {
        grid-template-columns: 1fr;
        align-items: stretch;
      }

      .primary-check {
        min-height: auto;
      }

      .data-table {
        min-width: 690px;
      }

    }

    @media (max-width: 640px) {

      .sku-manager {
        padding: 14px;
      }

      .manager-header {
        align-items: flex-start;
      }

      .search-row {
        flex-wrap: wrap;
      }

      .search-row > input {
        flex-basis: 100%;
      }

      .modal-backdrop {
        padding: 0;
      }

      .barcode-modal {
        width: 100%;
        height: 100dvh;
        max-height: 100dvh;
        border: 0;
        border-radius: 0;
      }

      .modal-header {
        padding: 16px;
      }

      .modal-header h2 {
        font-size: 16px;
      }

      .modal-icon {
        flex-basis: 40px;
        width: 40px;
        height: 40px;
      }

      .modal-body {
        padding: 14px;
      }

      .modal-card {
        padding: 14px;
      }

      .sku-summary {
        align-items: stretch;
      }

      .summary-metrics {
        width: 100%;
      }

      .metric {
        flex: 1 1 90px;
      }

      .modal-footer {
        align-items: stretch;
        flex-direction: column;
        padding: 12px 16px;
      }

      .footer-actions {
        justify-content: flex-end;
      }

    }

  `]
})
export class ProductSkuBarcodeManager {

  // ========================================================
  // DEPENDENCIES
  // ========================================================

  private readonly variantService =
    inject(ProductVariantService);

  private readonly barcodeService =
    inject(ProductBarcodeService);

  private readonly permissionService =
    inject(EffectivePermissionService);

  private readonly notificationService =
    inject(NotificationService);

  private readonly fb =
    inject(FormBuilder);

  private readonly destroyRef =
    inject(DestroyRef);

  // ========================================================
  // MODAL REFERENCES
  // ========================================================

  @ViewChild('barcodeDialog')
  private barcodeDialog?: ElementRef<HTMLElement>;

  @ViewChild('barcodeInput')
  private barcodeInput?: ElementRef<HTMLInputElement>;

  private previousFocusedElement: HTMLElement | null = null;

  // ========================================================
  // INPUT CONTEXT
  // ========================================================

  private currentCompanyId: number | null = null;
  private currentProductId: number | null = null;

  private contextVersion = 0;
  private variantRequestVersion = 0;
  private barcodeRequestVersion = 0;

  private variantSubscription?: Subscription;
  private barcodeSubscription?: Subscription;
  private mutationSubscription?: Subscription;

  @Input()
  set companyId(value: number | null) {
    this.updateContext(value, this.currentProductId);
  }

  @Input()
  set productId(value: number | null) {
    this.updateContext(this.currentCompanyId, value);
  }

  // ========================================================
  // STATE
  // ========================================================

  readonly hasContext = signal(false);

  readonly variants = signal<ProductVariant[]>([]);
  readonly barcodes = signal<ProductBarcode[]>([]);

  readonly loadingVariants = signal(false);
  readonly loadingBarcodes = signal(false);
  readonly saving = signal(false);

  readonly busy = computed(() =>
    this.loadingVariants() ||
    this.loadingBarcodes() ||
    this.saving()
  );

  readonly selectedVariant =
    signal<ProductVariant | null>(null);

  readonly editingVariant =
    signal<ProductVariant | null>(null);

  readonly variantEditorOpen = signal(false);
  readonly barcodeModalOpen = signal(false);

  readonly barcodeEntryMode = signal<'scan' | 'generate' | 'manual'>('scan');
  readonly barcodeValidationAttempted = signal(false);
  readonly skuEntryMode = signal<'auto' | 'manual'>('auto');

  readonly skuFilter = signal('');
  readonly barcodeFilter = signal('');

  readonly includeInactiveVariants = signal(false);
  readonly includeInactiveBarcodes = signal(false);

  readonly variantPage = signal(1);
  readonly variantPages = signal(1);
  readonly variantTotal = signal(0);

  readonly barcodePage = signal(1);
  readonly barcodePages = signal(1);
  readonly barcodeTotal = signal(0);

  private readonly pageSize = 10;

  // ========================================================
  // PERMISSIONS
  // ========================================================

  readonly canViewVariants = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.view
    )
  );

  readonly canCreateVariant = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.create
    )
  );

  readonly canOverrideSku = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.manualSkuOverride
    )
  );

  readonly canUpdateVariant = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.update
    )
  );

  readonly canActivateVariant = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.activate
    )
  );

  readonly canDeactivateVariant = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productVariants.deactivate
    )
  );

  readonly canViewBarcodes = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBarcodes.view
    )
  );

  readonly canCreateBarcode = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBarcodes.create
    )
  );

  readonly canSetPrimaryBarcode = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBarcodes.setPrimary
    )
  );

  readonly canActivateBarcode = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBarcodes.activate
    )
  );

  readonly canDeactivateBarcode = computed(() =>
    this.permissionService.hasCompanyPermission(
      PermissionCodes.productBarcodes.deactivate
    )
  );

  // ========================================================
  // FORMS
  // ========================================================

  readonly variantForm = this.fb.group({

    sku: this.fb.nonNullable.control('', [
      Validators.maxLength(100)
    ]),

    sellingPrice: this.fb.nonNullable.control(0, [
      Validators.required,
      Validators.min(0)
    ]),

    costPrice: this.fb.control<number | null>(null, [
      Validators.min(0)
    ])

  });

  readonly barcodeForm = this.fb.group({

    barcode: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(100),
      Validators.pattern(/^[^\s\x00-\x1f\x7f-\x9f]+$/)
    ]),

    isPrimary: this.fb.nonNullable.control(false)

  });

  // ========================================================
  // LIFECYCLE
  // ========================================================

  constructor() {

    this.destroyRef.onDestroy(() => {
      this.cancelRequests();
      this.restoreModalFocus();
    });

  }

  // ========================================================
  // GLOBAL TOAST
  // ========================================================

  private notifySuccess(
    message: string,
    title = 'Operation Successful'
  ): void {

    this.notificationService.success(message, {
      title
    });

  }

  private notifyError(
    message: string,
    title = 'Operation Failed'
  ): void {

    this.notificationService.error(message, {
      title
    });

  }

  // ========================================================
  // CONTEXT MANAGEMENT
  // ========================================================

  private updateContext(
    companyId: number | null,
    productId: number | null
  ): void {

    if (
      this.currentCompanyId === companyId &&
      this.currentProductId === productId
    ) {
      return;
    }

    this.cancelRequests();

    ++this.contextVersion;

    this.currentCompanyId = companyId;
    this.currentProductId = productId;

    this.hasContext.set(
      this.isValidId(companyId) &&
      this.isValidId(productId)
    );

    this.variants.set([]);
    this.barcodes.set([]);

    this.selectedVariant.set(null);
    this.editingVariant.set(null);

    this.variantEditorOpen.set(false);
    this.barcodeModalOpen.set(false);
    this.skuEntryMode.set('auto');

    this.restoreModalFocus();

    this.variantForm.reset({
      sku: '',
      sellingPrice: 0,
      costPrice: null
    });

    this.barcodeValidationAttempted.set(false);

    this.barcodeForm.reset({
      barcode: '',
      isPrimary: false
    });

    this.skuFilter.set('');
    this.barcodeFilter.set('');

    this.includeInactiveVariants.set(false);
    this.includeInactiveBarcodes.set(false);

    this.variantPage.set(1);
    this.variantPages.set(1);
    this.variantTotal.set(0);

    this.barcodePage.set(1);
    this.barcodePages.set(1);
    this.barcodeTotal.set(0);

    this.loadingVariants.set(false);
    this.loadingBarcodes.set(false);
    this.saving.set(false);

    if (
      this.hasContext() &&
      this.canViewVariants()
    ) {
      this.loadVariants();
    }

  }

  private cancelRequests(): void {

    ++this.variantRequestVersion;
    ++this.barcodeRequestVersion;

    this.variantSubscription?.unsubscribe();
    this.barcodeSubscription?.unsubscribe();
    this.mutationSubscription?.unsubscribe();

    this.variantSubscription = undefined;
    this.barcodeSubscription = undefined;
    this.mutationSubscription = undefined;

  }

  private isValidId(
    value: number | null
  ): value is number {

    return (
      value !== null &&
      Number.isSafeInteger(value) &&
      value > 0
    );

  }

  // ========================================================
  // REFRESH
  // ========================================================

  refresh(): void {

    if (
      !this.hasContext() ||
      this.busy()
    ) {
      return;
    }

    this.loadVariants();

  }

  refreshBarcodes(): void {

    if (
      !this.barcodeModalOpen() ||
      !this.selectedVariant() ||
      this.busy()
    ) {
      return;
    }

    this.loadBarcodes();

  }

  // ========================================================
  // LOAD VARIANTS
  // ========================================================

  private loadVariants(): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      !this.canViewVariants()
    ) {
      return;
    }

    ++this.variantRequestVersion;

    const version = this.variantRequestVersion;
    const context = this.contextVersion;

    this.variantSubscription?.unsubscribe();

    this.loadingVariants.set(true);

    this.variantSubscription = this.variantService
      .getVariants(companyId, productId, {

        sku: this.skuFilter() || undefined,

        includeInactive:
          this.includeInactiveVariants(),

        sortBy: 'sku',
        sortDirection: 'asc',

        pageNumber: this.variantPage(),
        pageSize: this.pageSize

      })
      .subscribe({

        next: (result: ProductVariantPagedResult) => {

          if (
            context !== this.contextVersion ||
            version !== this.variantRequestVersion
          ) {
            return;
          }

          this.variants.set(result.items);
          this.variantTotal.set(result.totalCount);

          this.variantPages.set(
            Math.max(1, result.totalPages)
          );

          this.variantPage.set(result.pageNumber);

          const selected = this.selectedVariant();

          if (selected) {

            const updated = result.items.find(
              item => item.id === selected.id
            );

            if (updated) {
              this.selectedVariant.set(updated);
            }

          }

          this.loadingVariants.set(false);

        },

        error: (error: HttpErrorResponse) => {

          if (
            context !== this.contextVersion ||
            version !== this.variantRequestVersion
          ) {
            return;
          }

          this.loadingVariants.set(false);

          this.notifyError(
            this.errorMessage(error),
            'Unable to Load SKUs'
          );

        }

      });

  }

  // ========================================================
  // SKU SEARCH / PAGINATION
  // ========================================================

  onSkuSearchSubmit(
    event: Event,
    value: string
  ): void {

    event.preventDefault();

    if (this.busy()) {
      return;
    }

    this.skuFilter.set(value.trim());
    this.variantPage.set(1);

    this.loadVariants();

  }

  toggleInactiveVariants(value: boolean): void {

    if (this.busy()) {
      return;
    }

    this.includeInactiveVariants.set(value);
    this.variantPage.set(1);

    this.loadVariants();

  }

  previousVariantPage(): void {

    if (
      this.busy() ||
      this.variantPage() <= 1
    ) {
      return;
    }

    this.variantPage.update(page => page - 1);
    this.loadVariants();

  }

  nextVariantPage(): void {

    if (
      this.busy() ||
      this.variantPage() >= this.variantPages()
    ) {
      return;
    }

    this.variantPage.update(page => page + 1);
    this.loadVariants();

  }

  // ========================================================
  // CREATE / EDIT SKU
  // ========================================================

  selectSkuEntryMode(mode: 'auto' | 'manual'): void {

    if (
      this.saving() ||
      this.editingVariant() ||
      !this.variantEditorOpen() ||
      (mode === 'manual' && !this.canOverrideSku())
    ) {
      return;
    }

    this.skuEntryMode.set(mode);
    this.variantForm.controls.sku.setValue('');
    this.variantForm.controls.sku.markAsUntouched();

  }

  startCreateVariant(): void {

    if (
      !this.canCreateVariant() ||
      !this.hasContext() ||
      this.busy()
    ) {
      return;
    }

    this.editingVariant.set(null);
    this.skuEntryMode.set('auto');

    this.variantForm.reset({
      sku: '',
      sellingPrice: 0,
      costPrice: null
    });

    this.variantEditorOpen.set(true);

  }

  startEditVariant(variant: ProductVariant): void {

    if (
      !this.canUpdateVariant() ||
      this.busy()
    ) {
      return;
    }

    this.editingVariant.set(variant);
    this.skuEntryMode.set('auto');

    this.variantForm.reset({
      sku: variant.sku,
      sellingPrice: variant.sellingPrice,
      costPrice: variant.costPrice
    });

    this.variantEditorOpen.set(true);

  }

  cancelVariantEditor(): void {

    if (this.saving()) {
      return;
    }

    this.variantEditorOpen.set(false);
    this.editingVariant.set(null);
    this.skuEntryMode.set('auto');

    this.variantForm.reset({
      sku: '',
      sellingPrice: 0,
      costPrice: null
    });

  }

  saveVariant(): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      this.busy()
    ) {
      return;
    }

    const editing = this.editingVariant();

    if (
      editing
        ? !this.canUpdateVariant()
        : !this.canCreateVariant()
    ) {
      return;
    }

    const manualSku = !editing && this.skuEntryMode() === 'manual';

    if (manualSku && !this.canOverrideSku()) {
      this.notifyError(
        'You do not have permission to specify a manual SKU.',
        'Permission Denied'
      );
      return;
    }

    if (this.variantForm.invalid) {

      this.variantForm.markAllAsTouched();

      this.notifyError(
        'Enter valid SKU and pricing information.',
        'Validation Failed'
      );

      return;
    }

    const value = this.variantForm.getRawValue();

    const sku = value.sku.trim();
    const requiresSku = !!editing || manualSku;
    const sellingPrice = Number(value.sellingPrice);

    const rawCost = value.costPrice;

    const costPrice =
      rawCost === null ||
      rawCost === undefined ||
      String(rawCost).trim() === ''
        ? null
        : Number(rawCost);

    if (
      (requiresSku && !sku) ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0 ||
      (
        costPrice !== null &&
        (
          !Number.isFinite(costPrice) ||
          costPrice < 0
        )
      )
    ) {

      this.notifyError(
        'Please provide a valid SKU when required and valid prices.',
        'Validation Failed'
      );

      return;
    }

    const request$: Observable<ProductVariant> = editing

      ? this.variantService.updateVariant(
          companyId,
          productId,
          editing.id,
          {
            sku,
            sellingPrice,
            costPrice,
            rowVersion: editing.rowVersion
          }
        )

      : this.variantService.createVariant(
          companyId,
          productId,
          {
            sku: manualSku ? sku : null,
            sellingPrice,
            costPrice,
            attributes: [],
            barcodes: []
          }
        );

    const context = this.contextVersion;

    this.saving.set(true);

    this.mutationSubscription = request$.subscribe({

      next: () => {

        if (context !== this.contextVersion) {
          return;
        }

        this.saving.set(false);

        this.variantEditorOpen.set(false);
        this.editingVariant.set(null);
        this.skuEntryMode.set('auto');

        this.notifySuccess(
          editing
            ? 'SKU updated successfully.'
            : 'SKU created successfully.',
          editing ? 'SKU Updated' : 'SKU Created'
        );

        this.loadVariants();

      },

      error: (error: HttpErrorResponse) => {

        if (context !== this.contextVersion) {
          return;
        }

        this.saving.set(false);

        this.notifyError(
          this.errorMessage(error),
          editing
            ? 'SKU Update Failed'
            : 'SKU Creation Failed'
        );

      }

    });

  }

  // ========================================================
  // SKU STATUS
  // ========================================================

  changeVariantStatus(
    variant: ProductVariant,
    isActive: boolean
  ): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      this.busy() ||
      variant.isActive === isActive ||
      !(
        isActive
          ? this.canActivateVariant()
          : this.canDeactivateVariant()
      )
    ) {
      return;
    }

    const context = this.contextVersion;

    this.saving.set(true);

    this.mutationSubscription = this.variantService
      .changeVariantStatus(
        companyId,
        productId,
        variant.id,
        {
          isActive,
          rowVersion: variant.rowVersion
        }
      )
      .subscribe({

        next: updated => {

          if (context !== this.contextVersion) {
            return;
          }

          this.saving.set(false);

          if (
            this.selectedVariant()?.id === updated.id
          ) {
            this.selectedVariant.set(updated);
          }

          this.notifySuccess(
            isActive
              ? 'SKU activated successfully.'
              : 'SKU deactivated successfully.',
            'SKU Status Updated'
          );

          this.loadVariants();

        },

        error: (error: HttpErrorResponse) => {

          if (context !== this.contextVersion) {
            return;
          }

          this.saving.set(false);

          this.notifyError(
            this.errorMessage(error),
            'SKU Status Change Failed'
          );

        }

      });

  }

  // ========================================================
  // BARCODE ENTRY METHOD
  // ========================================================

  selectBarcodeEntryMode(mode: 'scan' | 'generate' | 'manual'): void {
    if (this.busy()) {
      return;
    }

    if (this.barcodeEntryMode() !== mode) {
      this.barcodeValidationAttempted.set(false);
    }

    this.barcodeEntryMode.set(mode);

    if (mode === 'generate') {
      return;
    }

    requestAnimationFrame(() => {
      if (this.barcodeModalOpen()) {
        this.barcodeInput?.nativeElement.focus();
      }
    });
  }

  // ========================================================
  // OPEN BARCODE MODAL
  // ========================================================

  openBarcodeModal(variant: ProductVariant): void {

    if (
      !this.hasContext() ||
      !this.canViewBarcodes() ||
      this.busy()
    ) {
      return;
    }

    this.selectedVariant.set(variant);

    this.barcodeFilter.set('');
    this.includeInactiveBarcodes.set(false);

    this.barcodePage.set(1);
    this.barcodePages.set(1);
    this.barcodeTotal.set(0);

    this.barcodes.set([]);
    this.barcodeEntryMode.set('scan');

    this.barcodeValidationAttempted.set(false);

    this.barcodeForm.reset({
      barcode: '',
      isPrimary: false
    });

    this.barcodeForm.markAsPristine();

    this.previousFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    this.barcodeModalOpen.set(true);

    this.loadBarcodes();

    // Focus is applied after Angular renders the modal.
    requestAnimationFrame(() => {

      if (!this.barcodeModalOpen()) {
        return;
      }

      const target =
        this.barcodeInput?.nativeElement ??
        this.barcodeDialog?.nativeElement;

      target?.focus();

    });

  }

  // ========================================================
  // MODAL KEYBOARD HANDLING
  // FIXES THE PREVIOUS TS2345 ERROR
  // ========================================================

  onModalKeydown(event: KeyboardEvent): void {

    if (event.key === 'Escape') {

      event.preventDefault();
      event.stopPropagation();

      this.requestCloseBarcodeModal();
      return;

    }

    if (event.key === 'Tab') {
      this.trapModalFocus(event);
    }

  }

  // ========================================================
  // CLOSE BARCODE MODAL
  // ========================================================

  requestCloseBarcodeModal(): void {

    if (!this.barcodeModalOpen()) {
      return;
    }

    if (this.saving()) {

      this.notifyError(
        'Please wait until the current operation finishes.',
        'Operation In Progress'
      );

      return;
    }

    if (this.barcodeForm.dirty) {

      const discard = window.confirm(
        'You have unsaved barcode information. Close without saving?'
      );

      if (!discard) {
        return;
      }

    }

    this.closeBarcodeModal();

  }

  private closeBarcodeModal(): void {

    ++this.barcodeRequestVersion;

    this.barcodeSubscription?.unsubscribe();
    this.barcodeSubscription = undefined;

    this.loadingBarcodes.set(false);

    this.barcodeModalOpen.set(false);

    this.selectedVariant.set(null);
    this.barcodes.set([]);

    this.barcodeFilter.set('');

    this.barcodePage.set(1);
    this.barcodePages.set(1);
    this.barcodeTotal.set(0);

    this.barcodeValidationAttempted.set(false);

    this.barcodeForm.reset({
      barcode: '',
      isPrimary: false
    });

    this.barcodeForm.markAsPristine();

    this.restoreModalFocus();

  }

  private restoreModalFocus(): void {

    const target = this.previousFocusedElement;

    this.previousFocusedElement = null;

    if (target?.isConnected) {
      target.focus();
    }

  }

  // ========================================================
  // MODAL KEYBOARD ACCESSIBILITY
  // ========================================================

  trapModalFocus(event: KeyboardEvent): void {

    const dialog = this.barcodeDialog?.nativeElement;

    if (!dialog) {
      return;
    }

    const elements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])'
      )
    ).filter(element =>
      element.getClientRects().length > 0
    );

    if (elements.length === 0) {

      event.preventDefault();
      dialog.focus();
      return;

    }

    const first = elements[0];
    const last = elements[elements.length - 1];

    const active = document.activeElement;

    if (event.shiftKey && active === first) {

      event.preventDefault();
      last.focus();

    } else if (!event.shiftKey && active === last) {

      event.preventDefault();
      first.focus();

    } else if (!dialog.contains(active)) {

      event.preventDefault();

      if (event.shiftKey) {
        last.focus();
      } else {
        first.focus();
      }

    }

  }

  // ========================================================
  // LOAD BARCODES
  // ========================================================

  private loadBarcodes(): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;
    const variant = this.selectedVariant();

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      !variant ||
      !this.canViewBarcodes() ||
      !this.barcodeModalOpen()
    ) {
      return;
    }

    ++this.barcodeRequestVersion;

    const version = this.barcodeRequestVersion;
    const context = this.contextVersion;
    const variantId = variant.id;

    this.barcodeSubscription?.unsubscribe();

    this.loadingBarcodes.set(true);

    this.barcodeSubscription = this.barcodeService
      .getBarcodes(
        companyId,
        productId,
        variantId,
        {

          barcode: this.barcodeFilter() || undefined,

          includeInactive:
            this.includeInactiveBarcodes(),

          sortBy: 'primary',
          sortDirection: 'asc',

          pageNumber: this.barcodePage(),
          pageSize: this.pageSize

        }
      )
      .subscribe({

        next: (result: ProductBarcodePagedResult) => {

          if (
            context !== this.contextVersion ||
            version !== this.barcodeRequestVersion ||
            this.selectedVariant()?.id !== variantId ||
            !this.barcodeModalOpen()
          ) {
            return;
          }

          this.barcodes.set(result.items);
          this.barcodeTotal.set(result.totalCount);

          this.barcodePages.set(
            Math.max(1, result.totalPages)
          );

          this.barcodePage.set(result.pageNumber);

          // Default the first barcode to primary only when the unfiltered
          // directory is empty. Server remains authoritative for uniqueness.
          if (
            !this.barcodeFilter() &&
            !this.includeInactiveBarcodes() &&
            result.totalCount === 0 &&
            !this.barcodeForm.controls.isPrimary.dirty
          ) {
            this.barcodeForm.controls.isPrimary.setValue(true);
          }

          this.loadingBarcodes.set(false);

        },

        error: (error: HttpErrorResponse) => {

          if (
            context !== this.contextVersion ||
            version !== this.barcodeRequestVersion
          ) {
            return;
          }

          this.loadingBarcodes.set(false);

          this.notifyError(
            this.errorMessage(error),
            'Unable to Load Barcodes'
          );

        }

      });

  }

  // ========================================================
  // BARCODE SEARCH / PAGINATION
  // ========================================================

  onBarcodeSearchSubmit(
    event: Event,
    value: string
  ): void {

    event.preventDefault();

    if (this.busy()) {
      return;
    }

    this.barcodeFilter.set(value.trim());
    this.barcodePage.set(1);

    this.loadBarcodes();

  }

  toggleInactiveBarcodes(value: boolean): void {

    if (this.busy()) {
      return;
    }

    this.includeInactiveBarcodes.set(value);
    this.barcodePage.set(1);

    this.loadBarcodes();

  }

  previousBarcodePage(): void {

    if (
      this.busy() ||
      this.barcodePage() <= 1
    ) {
      return;
    }

    this.barcodePage.update(page => page - 1);

    this.loadBarcodes();

  }

  nextBarcodePage(): void {

    if (
      this.busy() ||
      this.barcodePage() >= this.barcodePages()
    ) {
      return;
    }

    this.barcodePage.update(page => page + 1);

    this.loadBarcodes();

  }

  // ========================================================
  // CREATE BARCODE
  // ========================================================

  createBarcode(): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;
    const variant = this.selectedVariant();

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      !variant ||
      !variant.isActive ||
      !this.canCreateBarcode() ||
      !this.barcodeModalOpen() ||
      this.busy()
    ) {
      return;
    }

    const generate = this.barcodeEntryMode() === 'generate';
    const value = this.barcodeForm.getRawValue();
    const barcode = value.barcode.trim();

    if (!generate) {
      this.barcodeForm.controls.barcode.setValue(barcode);

      if (this.barcodeForm.invalid) {
        this.barcodeValidationAttempted.set(true);
        this.barcodeForm.markAllAsTouched();
        this.notifyError('Enter a valid barcode.', 'Validation Failed');
        return;
      }

      if (this.barcodes().some(item =>
        item.barcode.toLowerCase() === barcode.toLowerCase()
      )) {
        this.notifyError(
          'This barcode is already listed for this SKU.',
          'Duplicate Barcode'
        );
        return;
      }
    }

    const context = this.contextVersion;
    const variantId = variant.id;

    this.saving.set(true);

    const request = generate
      ? this.barcodeService.generateBarcode(companyId, productId, variantId, {
          isPrimary: value.isPrimary
        })
      : this.barcodeService.createBarcode(companyId, productId, variantId, {
          barcode,
          isPrimary: value.isPrimary
        });

    this.mutationSubscription = request
      .subscribe({

        next: (created: ProductBarcode) => {

          if (
            context !== this.contextVersion ||
            this.selectedVariant()?.id !== variantId
          ) {
            return;
          }

          this.saving.set(false);

          this.barcodeValidationAttempted.set(false);

          this.barcodeForm.reset({
            barcode: '',
            isPrimary: false
          });

          this.barcodeForm.markAsPristine();

          this.notifySuccess(
            generate ? `Barcode ${created.barcode} generated and registered successfully.` : 'Barcode added successfully.',
            generate ? 'Barcode Generated' : 'Barcode Created'
          );

          this.barcodeFilter.set('');
          this.barcodePage.set(1);
          this.loadBarcodes();

          this.barcodeInput?.nativeElement.focus();

        },

        error: (error: HttpErrorResponse) => {

          if (context !== this.contextVersion) {
            return;
          }

          this.saving.set(false);

          this.notifyError(
            generate && (error.status === 0 || error.status >= 500)
              ? 'Registration could not be confirmed. Refresh the barcode directory before generating again.'
              : this.errorMessage(error),
            generate ? 'Barcode Generation Failed' : 'Barcode Creation Failed'
          );

        }

      });

  }

  // ========================================================
  // SET PRIMARY BARCODE
  // ========================================================

  setPrimaryBarcode(barcode: ProductBarcode): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;
    const variant = this.selectedVariant();

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      !variant ||
      !barcode.isActive ||
      barcode.isPrimary ||
      !this.canSetPrimaryBarcode() ||
      this.busy()
    ) {
      return;
    }

    const context = this.contextVersion;
    const variantId = variant.id;

    this.saving.set(true);

    this.mutationSubscription = this.barcodeService
      .setPrimaryBarcode(
        companyId,
        productId,
        variantId,
        barcode.id,
        {
          rowVersion: barcode.rowVersion
        }
      )
      .subscribe({

        next: () => {

          if (
            context !== this.contextVersion ||
            this.selectedVariant()?.id !== variantId
          ) {
            return;
          }

          this.saving.set(false);

          this.notifySuccess(
            'Primary barcode updated successfully.',
            'Primary Barcode Updated'
          );

          this.loadBarcodes();

        },

        error: (error: HttpErrorResponse) => {

          if (context !== this.contextVersion) {
            return;
          }

          this.saving.set(false);

          this.notifyError(
            this.errorMessage(error),
            'Primary Barcode Update Failed'
          );

        }

      });

  }

  // ========================================================
  // BARCODE STATUS
  // ========================================================

  changeBarcodeStatus(
    barcode: ProductBarcode,
    isActive: boolean
  ): void {

    const companyId = this.currentCompanyId;
    const productId = this.currentProductId;
    const variant = this.selectedVariant();

    if (
      !this.isValidId(companyId) ||
      !this.isValidId(productId) ||
      !variant ||
      barcode.isActive === isActive ||
      this.busy() ||
      !(
        isActive
          ? this.canActivateBarcode()
          : this.canDeactivateBarcode()
      )
    ) {
      return;
    }

    const context = this.contextVersion;
    const variantId = variant.id;

    this.saving.set(true);

    const request$ = isActive

      ? this.barcodeService.activateBarcode(
          companyId,
          productId,
          variantId,
          barcode.id,
          {
            rowVersion: barcode.rowVersion
          }
        )

      : this.barcodeService.deactivateBarcode(
          companyId,
          productId,
          variantId,
          barcode.id,
          {
            rowVersion: barcode.rowVersion
          }
        );

    this.mutationSubscription = request$.subscribe({

      next: () => {

        if (
          context !== this.contextVersion ||
          this.selectedVariant()?.id !== variantId
        ) {
          return;
        }

        this.saving.set(false);

        this.notifySuccess(
          isActive
            ? 'Barcode activated successfully.'
            : 'Barcode deactivated successfully.',
          'Barcode Status Updated'
        );

        this.loadBarcodes();

      },

      error: (error: HttpErrorResponse) => {

        if (context !== this.contextVersion) {
          return;
        }

        this.saving.set(false);

        this.notifyError(
          this.errorMessage(error),
          'Barcode Status Change Failed'
        );

      }

    });

  }

  // ========================================================
  // MONEY FORMAT
  // ========================================================

  money(value: number): string {

    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);

  }

  // ========================================================
  // API ERROR HANDLING
  // ========================================================

  private errorMessage(
    error: HttpErrorResponse
  ): string {

    const serverMessage = error.error?.message;

    if (
      typeof serverMessage === 'string' &&
      serverMessage.trim()
    ) {
      return serverMessage;
    }

    if (error.status === 0) {
      return 'Cannot connect to the server. Check your connection.';
    }

    if (error.status === 400) {
      return 'Invalid information. Review the form and try again.';
    }

    if (
      error.status === 401 ||
      error.status === 403
    ) {
      return 'You do not have permission to perform this action.';
    }

    if (error.status === 404) {
      return 'The requested product, SKU or barcode was not found.';
    }

    if (
      error.status === 409 ||
      error.status === 412
    ) {
      return 'The record has changed or conflicts with another record. Refresh the data and try again.';
    }

    return 'The operation could not be completed. Please try again.';

  }

}