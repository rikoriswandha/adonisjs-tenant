/*
|--------------------------------------------------------------------------
| Path Tenant Resolver
|--------------------------------------------------------------------------
|
| Resolves the current tenant from the first segment of the URL path.
| For example, "/tenant-a/users" extracts "tenant-a" as the tenant slug.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { TenantContext, TenantResolverContract } from '../types.js'

/**
 * Configuration options for the path resolver.
 */
export type PathResolverOptions = {
  /**
   * A map of path segment → tenant context lookup.
   */
  tenants?: Record<string, Omit<TenantContext, 'slug'>>

  /**
   * A callback to look up a tenant by path segment.
   * Receives the first path segment and should return a tenant or null.
   */
  lookup?: (segment: string) => Promise<TenantContext | null> | TenantContext | null
}

/**
 * Resolves the current tenant from the first path segment of the URL.
 */
export class PathResolver implements TenantResolverContract {
  constructor(private options: PathResolverOptions = {}) {}

  async resolve(ctx: HttpContext): Promise<TenantContext | null> {
    const url = ctx.request.url()
    if (!url) return null

    const path = url.split('?')[0]
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return null

    const segment = segments[0]

    if (this.options.lookup) {
      return this.options.lookup(segment)
    }

    if (this.options.tenants && this.options.tenants[segment]) {
      const tenant = this.options.tenants[segment]
      return { ...tenant, slug: segment }
    }

    return null
  }
}
