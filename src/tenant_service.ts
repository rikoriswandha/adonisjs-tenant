import type { TenantContext } from './types.js'
import { getTenantContext, getTenantContextOrFail, runWithTenant } from './tenant_context.js'

/**
 * Static API for accessing the current tenant context.
 * Works in any execution context (HTTP, CLI, jobs, queues).
 *
 * Thin wrapper over TenantContext AsyncLocalStorage operations.
 * Does NOT perform database queries or tenant resolution.
 */
export class TenantService {
  /**
   * Get the current tenant context, or undefined if not in a tenant-scoped execution.
   */
  static get(): TenantContext | undefined {
    return getTenantContext()
  }

  /**
   * Get the current tenant context or throw TenantNotResolvedError.
   */
  static require(): TenantContext {
    return getTenantContextOrFail()
  }

  /**
   * Execute a callback within a tenant-scoped context.
   */
  static async run<T>(tenant: TenantContext, callback: () => Promise<T>): Promise<T> {
    return runWithTenant(tenant, callback)
  }

  /**
   * Check whether a tenant context is active in the current execution scope.
   */
  static isActive(): boolean {
    return getTenantContext() !== undefined
  }

  /**
   * Get the current tenant's identifier, or undefined if no tenant is active.
   */
  static currentId(): string | number | undefined {
    return getTenantContext()?.id
  }
}
