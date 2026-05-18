import { Authenticator } from '@adonisjs/auth'
import type { AuthManager } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'
import type { GuardFactory } from '@adonisjs/auth/types'
import { TenantService } from '../tenant_service.js'
import type { TenantContext } from '../types.js'

/**
 * Tenant-aware authenticator that extends the default Authenticator
 * with a convenience getter for the current tenant context.
 */
export class TenantAuthenticator<
  KnownGuards extends Record<string, GuardFactory>,
> extends Authenticator<KnownGuards> {
  constructor(ctx: HttpContext, config: { default: keyof KnownGuards; guards: KnownGuards }) {
    super(ctx, config)
  }

  /**
   * Get the current tenant context, if available.
   * Returns undefined when no tenant is active in the current execution scope.
   */
  get tenant(): TenantContext | undefined {
    return TenantService.get()
  }
}

/**
 * Replace the default Authenticator on an AuthManager with TenantAuthenticator.
 *
 * Call this during boot to make `auth.tenant` available on all authenticator
 * instances created by the manager.
 *
 * @example
 * ```ts
 * import { extendAuthenticator } from 'adonisjs-tenant/extensions/authenticator'
 *
 * export const authService = extendAuthenticator(authManager)
 * ```
 */
export function extendAuthenticator<KnownGuards extends Record<string, GuardFactory>>(
  authManager: AuthManager<KnownGuards>
): void {
  authManager.createAuthenticator = ((ctx: HttpContext) => {
    return new TenantAuthenticator(ctx, authManager.config as any)
  }) as typeof authManager.createAuthenticator
}
