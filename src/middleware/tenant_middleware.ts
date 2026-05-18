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
 * Static configuration store for TenantMiddleware.
 * Set via {@link TenantMiddleware.configure} during application boot.
 */
let middlewareConfig: TenantMiddlewareConfig | null = null

/**
 * Middleware that resolves the current tenant from the HTTP request
 * and sets it as the AsyncLocalStorage tenant context.
 *
 * Sets `ctx.tenant` for convenience access within controllers.
 *
 * Before use, call {@link TenantMiddleware.configure} to set the resolver.
 * The provider does this automatically during boot.
 */
export class TenantMiddleware {
  /**
   * Configure the middleware with a resolver and options.
   * Called by TenancyProvider during boot.
   */
  static configure(config: TenantMiddlewareConfig): void {
    middlewareConfig = config
  }

  async handle(ctx: HttpContext, next: () => Promise<void>): Promise<void> {
    if (!middlewareConfig) {
      throw new Error(
        'TenantMiddleware not configured. Ensure TenancyProvider has booted or call TenantMiddleware.configure().'
      )
    }

    const tenant = await middlewareConfig.resolver.resolve(ctx)

    if (!tenant) {
      if (middlewareConfig.failOnMissing !== false) {
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
