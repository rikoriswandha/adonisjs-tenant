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
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { Secret } from '@adonisjs/core/helpers'
import type { TenantContext } from '../types.js'
import { isConfigProvider } from '../utils/is_config_provider.js'

const S = symbols

/**
 * Verifies access tokens against the active tenant.
 *
 * {@link TenantDbAccessTokensProvider} implements this contract. A regular
 * Adonis access-token provider does not, so it cannot accidentally make
 * membership checks stand in for token-to-tenant binding.
 */
export interface TenantBoundAccessTokenVerifier {
  verifyForCurrentTenant(tokenValue: Secret<string>): Promise<AccessToken | null>
}

export class TenantAwareAccessTokensUserProvider<
  RealUser,
> implements AccessTokensUserProviderContract<RealUser> {
  [S.PROVIDER_REAL_USER]!: RealUser

  constructor(
    private wrappedProvider: AccessTokensUserProviderContract<RealUser>,
    private tenantTokenProvider: TenantBoundAccessTokenVerifier,
    private getCurrentTenant: () => TenantContext | null = () => {
      const ctx = HttpContext.get()
      if (!ctx) return null
      return ctx.tenant ?? null
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
    return this.wrappedProvider.findById(identifier)
  }

  async verifyToken(tokenValue: Secret<string>): Promise<AccessToken | null> {
    if (!this.getCurrentTenant()) return null

    return this.tenantTokenProvider.verifyForCurrentTenant(tokenValue)
  }
}

export function tenantAwareAccessTokensGuard<RealUser>(config: {
  provider:
    | AccessTokensUserProviderContract<RealUser>
    | ConfigProvider<AccessTokensUserProviderContract<RealUser>>
  tenantTokenProvider:
    | TenantBoundAccessTokenVerifier
    | ConfigProvider<TenantBoundAccessTokenVerifier>
}): GuardConfigProvider<GuardFactory> {
  return {
    resolver: async (_name: string, app: ApplicationService) => {
      const rawProvider = isConfigProvider(config.provider)
        ? await config.provider.resolver(app)
        : config.provider

      const tenantTokenProvider = isConfigProvider(config.tenantTokenProvider)
        ? await config.tenantTokenProvider.resolver(app)
        : config.tenantTokenProvider
      if (typeof tenantTokenProvider?.verifyForCurrentTenant !== 'function') {
        throw new RuntimeException(
          'Tenant-aware access-token guards require a tenantTokenProvider with verifyForCurrentTenant'
        )
      }
      const wrappedProvider = new TenantAwareAccessTokensUserProvider(
        rawProvider,
        tenantTokenProvider
      )

      const emitter = await app.container.make('emitter')

      return (ctx: HttpContext) => {
        const guard = new AccessTokensGuard(_name, ctx, emitter as any, wrappedProvider)
        return guard as unknown as GuardContract<unknown>
      }
    },
  }
}
