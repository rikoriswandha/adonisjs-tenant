import { AccessTokensGuard } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { symbols } from '@adonisjs/auth'
import type {
  AccessTokensUserProviderContract,
  AccessTokensGuardUser,
} from '@adonisjs/auth/types/access_tokens'
import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { GuardConfigProvider, GuardFactory, GuardContract } from '@adonisjs/auth/types'
import { HttpContext } from '@adonisjs/core/http'
import type { Secret } from '@adonisjs/core/helpers'
import type { TenantContext } from '../types.js'

const S = symbols

export class TenantAwareAccessTokensUserProvider<
  RealUser,
> implements AccessTokensUserProviderContract<RealUser> {
  [S.PROVIDER_REAL_USER]!: RealUser

  constructor(
    private wrappedProvider: AccessTokensUserProviderContract<RealUser>,
    private tenantProvider: {
      findById(tenant: TenantContext, id: string | number): Promise<RealUser | null>
      resolveTenant(ctx: HttpContext): Promise<TenantContext | null>
    },
    private getCurrentTenant: () => TenantContext | null = () => {
      const ctx = HttpContext.get()
      if (!ctx) return null
      return (ctx as any).tenant ?? null
    }
  ) {
    this[S.PROVIDER_REAL_USER] = wrappedProvider[S.PROVIDER_REAL_USER]
  }

  async createUserForGuard(user: RealUser): Promise<AccessTokensGuardUser<RealUser>> {
    return this.wrappedProvider.createUserForGuard(user)
  }

  async createToken(
    user: RealUser,
    abilities?: string[],
    options?: { name?: string; expiresIn?: string | number }
  ): Promise<AccessToken> {
    return this.wrappedProvider.createToken(user, abilities, options)
  }

  async invalidateToken(tokenValue: Secret<string>): Promise<boolean> {
    return this.wrappedProvider.invalidateToken(tokenValue)
  }

  async findById(
    identifier: string | number | BigInt
  ): Promise<AccessTokensGuardUser<RealUser> | null> {
    const tenant = this.getCurrentTenant()
    if (!tenant) return null

    const user = await this.tenantProvider.findById(tenant, identifier as string | number)
    if (!user) return null

    return this.wrappedProvider.createUserForGuard(user)
  }

  async verifyToken(tokenValue: Secret<string>): Promise<AccessToken | null> {
    const token = await this.wrappedProvider.verifyToken(tokenValue)
    if (!token) return null

    const tenant = this.getCurrentTenant()
    if (!tenant) return null

    const user = await this.tenantProvider.findById(tenant, token.tokenableId as string | number)
    if (!user) return null

    return token
  }
}

function isConfigProvider<T>(value: T | ConfigProvider<T>): value is ConfigProvider<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resolver' in value &&
    typeof (value as ConfigProvider<T>).resolver === 'function'
  )
}

export function tenantAwareAccessTokensGuard(config: {
  provider:
    | AccessTokensUserProviderContract<unknown>
    | ConfigProvider<AccessTokensUserProviderContract<unknown>>
  tenantProvider: {
    findById(tenant: TenantContext, id: string | number | BigInt): Promise<unknown | null>
    resolveTenant(ctx: HttpContext): Promise<TenantContext | null>
  }
}): GuardConfigProvider<GuardFactory> {
  return {
    resolver: async (_name: string, app: ApplicationService) => {
      const rawProvider = isConfigProvider(config.provider)
        ? await config.provider.resolver(app)
        : config.provider

      const wrappedProvider = new TenantAwareAccessTokensUserProvider(
        rawProvider as AccessTokensUserProviderContract<unknown>,
        config.tenantProvider as {
          findById(tenant: TenantContext, id: string | number): Promise<unknown | null>
          resolveTenant(ctx: HttpContext): Promise<TenantContext | null>
        }
      )

      const emitter = await app.container.make('emitter')

      return (ctx: HttpContext) => {
        const guard = new AccessTokensGuard(_name, ctx, emitter as any, wrappedProvider)
        return guard as unknown as GuardContract<unknown>
      }
    },
  }
}
