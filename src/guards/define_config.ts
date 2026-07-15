import { tenantAwareSessionGuard } from './tenant_aware_session.js'
import { tenantAwareAccessTokensGuard } from './tenant_aware_access_tokens.js'
import { tenantAwareBasicAuthGuard } from './tenant_aware_basic_auth.js'

export { tenantAwareSessionGuard, tenantAwareAccessTokensGuard, tenantAwareBasicAuthGuard }

/**
 * Convenience object grouping all three tenant-aware guard factories.
 *
 * @example
 * ```ts
 * import { tenantGuards } from '@rikology/adonisjs-tenant/guards'
 *
 * const authConfig = defineTenantAuthConfig({
 *   default: 'web',
 *   guards: {
 *     web: tenantGuards.session({ provider, tenantProvider }),
 *   },
 * })
 * ```
 */
export const tenantGuards = {
  session: tenantAwareSessionGuard,
  accessTokens: tenantAwareAccessTokensGuard,
  basicAuth: tenantAwareBasicAuthGuard,
}

/**
 * Define tenant-aware auth configuration with full type inference.
 *
 * Pass your auth config object through this function to get type-safe
 * guard definitions using tenant-aware guard factories.
 *
 * @example
 * ```ts
 * import { defineTenantAuthConfig } from '@rikology/adonisjs-tenant/guards'
 *
 * const authConfig = defineTenantAuthConfig({
 *   default: 'web',
 *   guards: {
 *     web: () => app.container.make('myTenantAwareGuard'),
 *   },
 * })
 * ```
 */
export function defineTenantAuthConfig<UserConfig>(config: UserConfig): UserConfig {
  return config
}
