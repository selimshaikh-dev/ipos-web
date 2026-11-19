
/**
 * iPOS Enterprise Authorization
 *
 * Central permission identifiers and route access metadata.
 *
 * Permission identifiers must match the backend
 * PermissionCodes catalog exactly.
 *
 * This registry does not grant access.
 * Backend authorization remains authoritative.
 */

// =========================================================
// 01. Centralized Permission Codes
// =========================================================

export const PermissionCodes = {

  // Company Management
  companies: {
    view: 'company.view',
    update: 'company.update',
    settingsManage: 'company.settings.manage'
  },

  // Branch Management
  branches: {
    view: 'branch.view',
    create: 'branch.create',
    update: 'branch.update',
    activate: 'branch.activate',
    deactivate: 'branch.deactivate'
  },

  // Warehouse Management
  warehouses: {
    view: 'warehouse.view',
    create: 'warehouse.create',
    update: 'warehouse.update',
    activate: 'warehouse.activate',
    deactivate: 'warehouse.deactivate'
  },

  // POS Counter Management
  posCounters: {
    view: 'poscounter.view',
    create: 'poscounter.create',
    update: 'poscounter.update',
    activate: 'poscounter.activate',
    deactivate: 'poscounter.deactivate'
  },

  // Unit of Measurement Management
  unitsOfMeasurement: {
    view: 'uom.view',
    create: 'uom.create',
    update: 'uom.update',
    activate: 'uom.activate',
    deactivate: 'uom.deactivate'
  },

  // Product Category Management
  productCategories: {
    view: 'product.category.view',
    create: 'product.category.create',
    update: 'product.category.update',
    activate: 'product.category.activate',
    deactivate: 'product.category.deactivate'
  },

  // Product Brand Management
  productBrands: {
    view: 'product.brand.view',
    create: 'product.brand.create',
    update: 'product.brand.update',
    activate: 'product.brand.activate',
    deactivate: 'product.brand.deactivate'
  },

  // User Management
  users: {
    view: 'user.view',
    create: 'user.create',
    update: 'user.update',
    activate: 'user.activate',
    deactivate: 'user.deactivate'
  },

  // Role Management
  roles: {
    view: 'role.view',
    create: 'role.create',
    update: 'role.update',
    activate: 'role.activate',
    deactivate: 'role.deactivate',
    assign: 'role.assign',
    revoke: 'role.revoke',
    permissionsManage: 'role.permissions.manage'
  },

  // Organization Access Management
  organizationAccess: {
    view: 'organization.access.view',
    companyGrant: 'organization.company.access.grant',
    companyRevoke: 'organization.company.access.revoke',
    branchGrant: 'organization.branch.access.grant',
    branchRevoke: 'organization.branch.access.revoke'
  },

  // Audit Management
  audit: {
    view: 'audit.view',
    export: 'audit.export'
  },

  // Security Management
  security: {
    sessionsView: 'security.sessions.view',
    sessionsRevoke: 'security.sessions.revoke'
  }

} as const;

// =========================================================
// 02. Permission Types
// =========================================================

type PermissionGroups = typeof PermissionCodes;

/**
 * Creates a strongly typed union of all permission
 * codes declared in the centralized registry.
 *
 * Example:
 * 'company.view' | 'branch.view' | 'role.view' | ...
 */
export type PermissionCode = {
  [K in keyof PermissionGroups]:
    PermissionGroups[K][keyof PermissionGroups[K]]
}[keyof PermissionGroups];

/**
 * Company:
 * Permission is evaluated within the active company.
 *
 * Branch:
 * Permission is evaluated within the active company
 * and the selected authorized branch.
 */
export type PermissionScope = 'company' | 'branch';

/**
 * Permission requirement for an application route.
 */
export interface PermissionRequirement {
  readonly code: PermissionCode;
  readonly scope: PermissionScope;
}

// =========================================================
// 03. Centralized Route Permission Registry
// =========================================================

/**
 * Maps implemented company and branch routes to
 * their required permission codes.
 *
 * Platform administration authorization remains
 * separate from company-scoped permissions.
 *
 * Routes without a registered permission must be
 * handled explicitly by the authorization layer.
 * An absent mapping must never imply permission.
 */
export const RoutePermissionRegistry: Readonly<
  Record<string, PermissionRequirement>
> = {

  // Organization / Branch Management
  '/settings/organization/branch-management': {
    code: PermissionCodes.branches.view,
    scope: 'company'
  },

  // Organization / Warehouse Management
  '/settings/organization/warehouse-management': {
    code: PermissionCodes.warehouses.view,
    scope: 'branch'
  },

  // Organization / POS Counter Management
  '/settings/organization/pos-counter-management': {
    code: PermissionCodes.posCounters.view,
    scope: 'branch'
  },

  // Catalog / Unit of Measurement Management
  '/settings/catalog/units-of-measurement': {
    code: PermissionCodes.unitsOfMeasurement.view,
    scope: 'company'
  },

  // Catalog / Product Category Management
  '/settings/catalog/product-categories': {
    code: PermissionCodes.productCategories.view,
    scope: 'company'
  },

  // Catalog / Product Brand Management
  '/settings/catalog/product-brands': {
    code: PermissionCodes.productBrands.view,
    scope: 'company'
  },

  // Users & Access Control / User Management
  '/settings/users-access-control/user-management': {
    code: PermissionCodes.users.view,
    scope: 'company'
  },

  // Users & Access Control / Role Management
  '/settings/users-access-control/role-management': {
    code: PermissionCodes.roles.view,
    scope: 'company'
  },

  // Users & Access Control / Company / Branch Access
  '/settings/users-access-control/company-branch-access': {
    code: PermissionCodes.organizationAccess.view,
    scope: 'company'
  }

};

// =========================================================
// 04. Route Permission Lookup
// =========================================================

/**
 * Returns the permission requirement associated
 * with a registered application route.
 *
 * Query strings, fragments and trailing slashes
 * are removed before matching.
 *
 * Returns null when no mapping exists.
 *
 * IMPORTANT:
 * A null result does not authorize access.
 * The calling guard must apply an explicit policy.
 */
export function getRoutePermission(
  route: string
): PermissionRequirement | null {

  const normalizedRoute =
    route
      .split(/[?#]/, 1)[0]
      .replace(/\/+$/, '') || '/';

  return RoutePermissionRegistry[normalizedRoute] ?? null;
}