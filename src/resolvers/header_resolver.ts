/*
|--------------------------------------------------------------------------
| Header Tenant Resolver
|--------------------------------------------------------------------------
|
| Resolves a tenant only through a configured, trusted lookup or map.
| A request header is an identifier, never authorization.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { TenantContext, TenantResolverContract } from '../types.js'

/**
 * Configuration options for the header resolver.
 */
export type HeaderResolverOptions = {
  /**
   * The header name to read the tenant identifier from (default: X-Tenant-ID).
   */
  header?: string

  /**
   * A map of header value → tenant context lookup.
   */
  tenants?: Record<string, Omit<TenantContext, 'slug'>>

  /**
   * A trusted callback to look up and validate a tenant by header value.
   * Receives untrusted client input and must return a tenant or null.
   */
  lookup?: (headerValue: string) => Promise<TenantContext | null> | TenantContext | null
}

/**
 * Resolves the current tenant from an HTTP request header.
 */
export class HeaderResolver implements TenantResolverContract {
  constructor(private options: HeaderResolverOptions = {}) {}

  async resolve(ctx: HttpContext): Promise<TenantContext | null> {
    const headerName = this.options.header ?? 'X-Tenant-ID'
    const headerValue = ctx.request.header(headerName)

    if (!headerValue) return null

    if (this.options.lookup) {
      return this.options.lookup(headerValue)
    }

    if (this.options.tenants) {
      const tenant = this.options.tenants[headerValue]
      if (tenant) {
        return { ...tenant, slug: headerValue }
      }
      return null
    }

    return null
  }
}
