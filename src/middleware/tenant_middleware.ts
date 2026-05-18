/*
|--------------------------------------------------------------------------
| Tenant Middleware
|--------------------------------------------------------------------------
|
| Resolves the current tenant from the incoming HTTP request using a
| configured resolver and sets the tenant context in AsyncLocalStorage
| for the duration of the request lifecycle.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { TenantResolverContract } from '../types.js'
import { runWithTenant } from '../tenant_context.js'

/**
 * Configuration options for the TenantMiddleware.
 */
export type TenantMiddlewareConfig = {
  /**
   * The resolver to use for extracting the tenant from the request.
   */
  resolver: TenantResolverContract

  /**
   * Whether to return a 404 response when no tenant is resolved.
   * Defaults to `true`.
   */
  failOnMissing?: boolean
}

/**
 * Middleware that resolves the current tenant from the HTTP request
 * and sets it as the AsyncLocalStorage tenant context.
 *
 * Sets `ctx.tenant` for convenience access within controllers.
 */
export class TenantMiddleware {
  constructor(private config: TenantMiddlewareConfig) {}

  async handle(ctx: HttpContext, next: () => Promise<void>): Promise<void> {
    const tenant = await this.config.resolver.resolve(ctx)

    if (!tenant) {
      if (this.config.failOnMissing !== false) {
        ctx.response.status(404).send('Tenant not found')
        return
      }

      await next()
      return
    }

    ctx.tenant = tenant
    await runWithTenant(tenant, next)
  }
}
