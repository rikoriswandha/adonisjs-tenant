/*
|--------------------------------------------------------------------------
| Package entrypoint
|--------------------------------------------------------------------------
|
| Export values from the package entrypoint as you see fit.
|
*/

export { configure } from './configure.ts'
export { stubsRoot } from './stubs/main.ts'

// ─── Core service ───────────────────────────────────────────────
export { TenantService } from './src/tenant_service.js'

// ─── Tenant context ─────────────────────────────────────────────
export {
  getTenantContext,
  getTenantContextOrFail,
  runWithTenant,
  TenantNotResolvedError,
} from './src/tenant_context.js'

// ─── Types ──────────────────────────────────────────────────────
export type {
  TenantContext,
  TenantConfig,
  TenancyConfig,
  TenantResolverContract,
  TenantUserProviderContract,
  TenantGuardFactory,
} from './src/types.js'

// ─── Config ─────────────────────────────────────────────────────
export { defineTenancyConfig } from './src/define_config.js'

// ─── Middleware ──────────────────────────────────────────────────
export { TenantMiddleware } from './src/middleware/tenant_middleware.js'
export type { TenantMiddlewareConfig } from './src/middleware/tenant_middleware.js'

// ─── Mixins ─────────────────────────────────────────────────────
export { TenantScope } from './src/mixins/tenant_scope.js'
export type { TenantScopedModelContract } from './src/mixins/tenant_scope.js'

// ─── Guards ─────────────────────────────────────────────────────
export {
  defineTenantAuthConfig,
  tenantGuards,
  tenantAwareSessionGuard,
  tenantAwareAccessTokensGuard,
  tenantAwareBasicAuthGuard,
} from './src/guards/define_config.js'

// ─── Extensions ─────────────────────────────────────────────────
export { extendAuthenticator, TenantAuthenticator } from './src/extensions/authenticator.js'

// ─── User providers ─────────────────────────────────────────────
export { TenantUserProvider } from './src/user_providers/tenant_user_provider.js'

// ─── Resolvers ──────────────────────────────────────────────────
export { SubdomainResolver } from './src/resolvers/subdomain_resolver.js'
export type { SubdomainResolverOptions } from './src/resolvers/subdomain_resolver.js'

export { HeaderResolver } from './src/resolvers/header_resolver.js'
export type { HeaderResolverOptions } from './src/resolvers/header_resolver.js'

export { JwtResolver } from './src/resolvers/jwt_resolver.js'
export type { JwtResolverOptions } from './src/resolvers/jwt_resolver.js'

export { PathResolver } from './src/resolvers/path_resolver.js'
export type { PathResolverOptions } from './src/resolvers/path_resolver.js'
