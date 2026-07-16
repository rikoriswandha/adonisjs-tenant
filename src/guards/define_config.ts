import { defineConfig as defineAuthConfig } from '@adonisjs/auth'
import type { GuardConfigProvider, GuardFactory } from '@adonisjs/auth/types'
import type { ConfigProvider } from '@adonisjs/core/types'
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

export type ResolvedTenantAuthConfig<
  KnownGuards extends Record<string, GuardFactory | GuardConfigProvider<GuardFactory>>,
> = {
  default: keyof KnownGuards
  guards: {
    [GuardName in keyof KnownGuards]: KnownGuards[GuardName] extends GuardConfigProvider<
      infer Factory
    >
      ? Factory
      : KnownGuards[GuardName]
  }
}

/**
 * Define tenant-aware auth configuration with Auth's config provider while
 * retaining the concrete guard types inferred from `tenantGuards`.
 */
export function defineTenantAuthConfig<
  KnownGuards extends Record<string, GuardFactory | GuardConfigProvider<GuardFactory>>,
>(config: {
  default: keyof KnownGuards
  guards: KnownGuards
}): ConfigProvider<ResolvedTenantAuthConfig<KnownGuards>> {
  return defineAuthConfig(config)
}
