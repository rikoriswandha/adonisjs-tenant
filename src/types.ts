import type { HttpContext } from '@adonisjs/core/http'
import type { GuardContract } from '@adonisjs/auth/types'
import type { HeaderResolverOptions } from './resolvers/header_resolver.js'
import type { JwtResolverOptions } from './resolvers/jwt_resolver.js'
import type { PathResolverOptions } from './resolvers/path_resolver.js'
import type { SubdomainResolverOptions } from './resolvers/subdomain_resolver.js'

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
 * Configuration for a built-in tenant resolver strategy.
 *
 * The resolver discriminator determines the options object accepted for that
 * strategy.
 */
export type TenantConfig =
  | { resolver: 'subdomain'; options?: SubdomainResolverOptions }
  | { resolver: 'header'; options?: HeaderResolverOptions }
  | { resolver: 'jwt'; options?: JwtResolverOptions }
  | { resolver: 'path'; options?: PathResolverOptions }

/**
 * Tenant-aware user provider contract.
 * Extends the user provider pattern with tenant scoping.
 */
export interface TenantUserProviderContract<RealUser> {
  /**
   * Find a user by their identifier scoped to the current tenant.
   */
  findById(tenant: TenantContext, identifier: string | number | BigInt): Promise<RealUser | null>
}

/**
 * Factory type for creating tenant-aware guards.
 * Follows the same pattern as GuardFactory but receives tenant context.
 */
export type TenantGuardFactory = (ctx: HttpContext, tenant: TenantContext) => GuardContract<unknown>

/**
 * Runtime configuration shape read by the tenancy provider.
 *
 * Invalid or incomplete runtime configuration is rejected during provider boot.
 * Use {@link defineTenancyConfig} for compile-time validation in config files.
 */
export type TenancyConfig = {
  default: string
  tenants?: Record<string, TenantConfig>
  failOnMissing?: boolean
}
