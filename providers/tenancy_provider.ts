import type { ApplicationService } from '@adonisjs/core/types'
import { TenantService } from '../src/tenant_service.js'
import { extendAuthenticator } from '../src/extensions/authenticator.js'
import TenantMiddleware from '../src/middleware/tenant_middleware.js'
import { SubdomainResolver } from '../src/resolvers/subdomain_resolver.js'
import { HeaderResolver } from '../src/resolvers/header_resolver.js'
import { JwtResolver } from '../src/resolvers/jwt_resolver.js'
import { PathResolver } from '../src/resolvers/path_resolver.js'
import type { TenancyConfig, TenantResolverContract } from '../src/types.js'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    'tenant.service': typeof TenantService
  }
}

/**
 * Create a TenantResolverContract instance from a TenantConfig.
 * Maps resolver names to their implementations.
 */
function createResolver(
  resolverName: string,
  options?: Record<string, any>
): TenantResolverContract {
  switch (resolverName) {
    case 'subdomain':
      return new SubdomainResolver(options)
    case 'header':
      return new HeaderResolver(options)
    case 'jwt':
      return new JwtResolver(options)
    case 'path':
      return new PathResolver(options)
    default:
      throw new Error(
        `Unknown tenant resolver: "${resolverName}". Valid options: subdomain, header, jwt, path.`
      )
  }
}

/**
 * The TenancyProvider registers tenant-related services
 * with the IoC container and extends the authenticator
 * with tenant-aware capabilities.
 */
class TenancyProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register the TenantService as a singleton in the container.
   */
  register(): void {
    this.app.container.singleton('tenant.service', async () => {
      return TenantService
    })
  }

  /**
   * Boot the provider.
   *
   * - Reads tenancy config and creates resolver instances.
   * - Configures TenantMiddleware with the default resolver.
   * - Patches the AuthManager to create TenantAuthenticator instances.
   */
  async boot(): Promise<void> {
    const tenancyConfig = this.app.config.get<TenancyConfig | undefined>('tenancy')
    const defaultTenantName = tenancyConfig?.default

    if (typeof defaultTenantName !== 'string' || defaultTenantName.trim() === '') {
      throw new Error(
        'Invalid tenancy configuration: "default" must select a resolver configured in "tenants".'
      )
    }

    const defaultTenant = tenancyConfig?.tenants?.[defaultTenantName]
    if (!defaultTenant) {
      throw new Error(
        `Invalid tenancy configuration: default resolver "${defaultTenantName}" is not configured in "tenants".`
      )
    }

    const authManager = await this.app.container.make('auth.manager')
    extendAuthenticator(authManager)

    TenantMiddleware.configure({
      resolver: createResolver(defaultTenant.resolver, defaultTenant.options),
      failOnMissing: tenancyConfig.failOnMissing,
    })
  }
}

export { TenancyProvider }
export default TenancyProvider
