/*
|--------------------------------------------------------------------------
| Subdomain Tenant Resolver
|--------------------------------------------------------------------------
|
| Resolves the current tenant from the request subdomain.
| For example, "tenant-a.example.com" extracts "tenant-a" as the subdomain
| and looks it up in a configured tenant mapping.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { TenantContext, TenantResolverContract } from '../types.js'

/**
 * Configuration options for the subdomain resolver.
 */
export type SubdomainResolverOptions = {
  /**
   * A map of subdomain → tenant context lookup.
   * The resolver extracts the subdomain from the hostname and
   * looks it up in this map.
   */
  tenants?: Record<string, Omit<TenantContext, 'slug'>>

  /**
   * A callback to look up a tenant by subdomain.
   * Receives the extracted subdomain and should return a tenant or null.
   */
  lookup?: (subdomain: string) => Promise<TenantContext | null> | TenantContext | null

  /**
   * Number of subdomain levels to extract (default: 1).
   * For "tenant-a.example.com", level 1 extracts "tenant-a".
   */
  levels?: number
}

/**
 * Resolves the current tenant by extracting the subdomain
 * from the request hostname.
 */
export class SubdomainResolver implements TenantResolverContract {
  constructor(private options: SubdomainResolverOptions = {}) {
    const levels = options.levels
    if (levels !== undefined && (!Number.isInteger(levels) || levels < 1)) {
      throw new Error('Subdomain resolver levels must be a positive integer')
    }
  }

  async resolve(ctx: HttpContext): Promise<TenantContext | null> {
    const hostname = ctx.request.hostname()
    if (!hostname) return null

    const levels = this.options.levels ?? 1
    const parts = hostname.split('.')

    // The documented heuristic reserves the final two labels as the apex
    // domain. A hostname without an additional label has no subdomain.
    if (parts.length < levels + 2) return null

    const subdomain = parts.slice(0, levels).join('.')

    if (this.options.lookup) {
      return this.options.lookup(subdomain)
    }

    if (this.options.tenants && this.options.tenants[subdomain]) {
      const tenant = this.options.tenants[subdomain]
      return { ...tenant, slug: subdomain }
    }

    return null
  }
}
