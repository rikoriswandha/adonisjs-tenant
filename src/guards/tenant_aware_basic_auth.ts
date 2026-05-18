import { BasicAuthGuard } from '@adonisjs/auth/basic_auth'
import { symbols } from '@adonisjs/auth'
import type {
  BasicAuthUserProviderContract,
  BasicAuthGuardUser,
} from '@adonisjs/auth/types/basic_auth'
import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { GuardConfigProvider, GuardFactory, GuardContract } from '@adonisjs/auth/types'
import { HttpContext } from '@adonisjs/core/http'
import type { TenantUserProvider } from '../user_providers/tenant_user_provider.js'
import type { TenantContext } from '../types.js'
import { isConfigProvider } from '../utils/is_config_provider.js'

const S = symbols

export class TenantAwareBasicAuthUserProvider<
  RealUser,
> implements BasicAuthUserProviderContract<RealUser> {
  [S.PROVIDER_REAL_USER]!: RealUser

  constructor(
    private wrappedProvider: BasicAuthUserProviderContract<RealUser>,
    private tenantUserProvider: {
      findById(tenant: TenantContext, id: string | number): Promise<RealUser | null>
    },
    private getCurrentTenant: () => TenantContext | null = () => {
      const ctx = HttpContext.get()
      if (!ctx) return null
      return ctx.tenant ?? null
    }
  ) {
    this[S.PROVIDER_REAL_USER] = wrappedProvider[S.PROVIDER_REAL_USER]
  }

  async verifyCredentials(
    uid: string,
    password: string
  ): Promise<BasicAuthGuardUser<RealUser> | null> {
    const guardUser = await this.wrappedProvider.verifyCredentials(uid, password)
    if (!guardUser) return null

    const tenant = this.getCurrentTenant()
    if (!tenant) return null

    const realUser = guardUser.getOriginal()
    const userInTenant = await this.tenantUserProvider.findById(
      tenant,
      (realUser as any).id as string | number
    )
    if (!userInTenant) return null

    return guardUser
  }

  async createUserForGuard(user: RealUser): Promise<BasicAuthGuardUser<RealUser>> {
    return this.wrappedProvider.createUserForGuard(user)
  }
}

export function tenantAwareBasicAuthGuard(config: {
  provider:
    | BasicAuthUserProviderContract<unknown>
    | ConfigProvider<BasicAuthUserProviderContract<unknown>>
  tenantProvider: TenantUserProvider<any>
}): GuardConfigProvider<GuardFactory> {
  return {
    resolver: async (_name: string, app: ApplicationService) => {
      const rawProvider = isConfigProvider(config.provider)
        ? await config.provider.resolver(app)
        : config.provider

      const wrappedProvider = new TenantAwareBasicAuthUserProvider(rawProvider, {
        findById: (tenant, id) => config.tenantProvider.findById(tenant, id),
      })

      const emitter = await app.container.make('emitter')

      return (ctx: HttpContext) => {
        return new BasicAuthGuard(
          _name,
          ctx,
          emitter as any,
          wrappedProvider
        ) as unknown as GuardContract<unknown>
      }
    },
  }
}
