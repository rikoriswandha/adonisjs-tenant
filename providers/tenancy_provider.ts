import type { ApplicationService } from '@adonisjs/core/types'
import { TenantService } from '../src/tenant_service.js'
import { extendAuthenticator } from '../src/extensions/authenticator.js'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    'tenant.service': TenantService
  }
}

/**
 * The TenancyProvider registers tenant-related services
 * with the IoC container and extends the authenticator
 * with tenant-aware capabilities.
 */
export class TenancyProvider {
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
   * - Patches the AuthManager to create TenantAuthenticator instances.
   * - Registers the 'tenant' middleware alias for use in route definitions.
   */
  async boot(): Promise<void> {
    const authManager = await this.app.container.make('auth.manager')
    extendAuthenticator(authManager)

    const router = await this.app.container.make('router')
    router.named({
      tenant: () =>
        import('../src/middleware/tenant_middleware.js').then((m) => ({
          default: m.TenantMiddleware,
        })),
    })
  }
}
