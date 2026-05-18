import type { HttpContext } from '@adonisjs/core/http'
import type { GuardContract } from '@adonisjs/auth/types'

/**
 * Represents the current tenant context resolved from an incoming HTTP request.
 */
export type TenantContext = {
  id: string | number
  name: string
  slug: string
}

/**
 * Contract for resolving the current tenant from an HTTP request.
 * Implementations can resolve the tenant from subdomain, header, JWT, path, etc.
 */
export interface TenantResolverContract {
  resolve(ctx: HttpContext): Promise<TenantContext | null>
}

/**
 * Configuration for a tenant resolver strategy.
 */
export type TenantConfig = {
  resolver: 'subdomain' | 'header' | 'jwt' | 'path'
  options?: Record<string, any>
}

/**
 * Tenant-aware user provider contract.
 * Extends the user provider pattern with tenant scoping.
 */
export interface TenantUserProviderContract<RealUser> {
  /**
   * Resolve the tenant context for a given HTTP request.
   */
  resolveTenant(ctx: HttpContext): Promise<TenantContext | null>

  /**
   * Find a user by their identifier scoped to the current tenant.
   */
  findById(tenant: TenantContext, identifier: string | number): Promise<RealUser | null>
}

/**
 * Factory type for creating tenant-aware guards.
 * Follows the same pattern as GuardFactory but receives tenant context.
 */
export type TenantGuardFactory = (ctx: HttpContext, tenant: TenantContext) => GuardContract<unknown>

/**
 * Root configuration shape for the tenancy package.
 */
export type TenancyConfig = {
  default: string
  tenants?: Record<string, TenantConfig>
}
