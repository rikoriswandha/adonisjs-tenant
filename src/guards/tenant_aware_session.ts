import { SessionGuard } from '@adonisjs/auth/session'
import { symbols } from '@adonisjs/auth'
import type { SessionUserProviderContract, SessionGuardUser } from '@adonisjs/auth/types/session'
import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { GuardConfigProvider, GuardFactory, GuardContract } from '@adonisjs/auth/types'
import type { HttpContext } from '@adonisjs/core/http'
import { getTenantContext } from '../tenant_context.js'
import type { TenantContext, TenantUserProviderContract } from '../types.js'
import { isConfigProvider } from '../utils/is_config_provider.js'

const S = symbols

export class TenantAwareSessionUserProvider<
  RealUser,
> implements SessionUserProviderContract<RealUser> {
  [S.PROVIDER_REAL_USER]!: RealUser

  constructor(
    private wrappedProvider: SessionUserProviderContract<RealUser>,
    private tenantUserProvider: TenantUserProviderContract<RealUser>,
    private getCurrentTenant: () => TenantContext | null = () => getTenantContext() ?? null
  ) {
    this[S.PROVIDER_REAL_USER] = wrappedProvider[S.PROVIDER_REAL_USER]
  }

  async findById(identifier: string | number | BigInt): Promise<SessionGuardUser<RealUser> | null> {
    const guardUser = await this.wrappedProvider.findById(identifier)
    if (!guardUser) return null

    const tenant = this.getCurrentTenant()
    if (!tenant) return null

    const userInTenant = await this.tenantUserProvider.findById(tenant, guardUser.getId())
    if (!userInTenant) return null

    return guardUser
  }

  async createUserForGuard(user: RealUser): Promise<SessionGuardUser<RealUser>> {
    return this.wrappedProvider.createUserForGuard(user)
  }
}

export function tenantAwareSessionGuard<RealUser>(config: {
  provider:
    | SessionUserProviderContract<RealUser>
    | ConfigProvider<SessionUserProviderContract<RealUser>>
  tenantProvider: TenantUserProviderContract<RealUser>
}): GuardConfigProvider<GuardFactory> {
  return {
    resolver: async (_name: string, app: ApplicationService) => {
      const rawProvider = isConfigProvider(config.provider)
        ? await config.provider.resolver(app)
        : config.provider

      const wrappedProvider = new TenantAwareSessionUserProvider(rawProvider, config.tenantProvider)

      const emitter = await app.container.make('emitter')

      return (ctx: HttpContext) => {
        return new SessionGuard(
          _name,
          ctx,
          { useRememberMeTokens: false },
          emitter as any,
          wrappedProvider as any
        ) as unknown as GuardContract<unknown>
      }
    },
  }
}
