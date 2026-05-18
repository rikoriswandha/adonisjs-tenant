/*
|--------------------------------------------------------------------------
| Header Tenant Resolver
|--------------------------------------------------------------------------
|
| Resolves the current tenant from an HTTP header (default: X-Tenant-ID).
| The header value is used as the tenant id, name, and slug.
|
*/

import type { HttpContext } from '@adonisjs/http-server'
import type { TenantContext, TenantResolverContract } from '../types.js'

/**
 * Configuration options for the header resolver.
 */
export type HeaderResolverOptions = {
  /**
   * The header name to read the tenant identifier from (default: X-Tenant-ID).
   */
  header?: string
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

    return {
      id: headerValue,
      name: headerValue,
      slug: headerValue,
    }
  }
}
