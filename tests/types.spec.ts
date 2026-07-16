import { test } from '@japa/runner'
import type {
  TenantConfig,
  TenantContext,
  TenantResolverContract,
  TenantUserProviderContract,
  TenancyConfig,
} from '../src/types.ts'
import { defineTenancyConfig } from '../src/define_config.ts'
import { configProvider } from '@adonisjs/core'
import type { TenantResolverContract as BarrelTenantResolverContract } from '../src/resolvers/index.ts'

import type { HttpContext } from '@adonisjs/core/http'
import { symbols } from '@adonisjs/auth'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import type { AccessTokensUserProviderContract } from '@adonisjs/auth/types/access_tokens'
import type { BasicAuthUserProviderContract } from '@adonisjs/auth/types/basic_auth'
import type { SessionUserProviderContract } from '@adonisjs/auth/types/session'
import {
  defineTenantAuthConfig,
  tenantAwareAccessTokensGuard,
  tenantAwareBasicAuthGuard,
  tenantAwareSessionGuard,
} from '../src/guards/define_config.ts'
import type { TenantBoundAccessTokenVerifier } from '../src/guards/tenant_aware_access_tokens.ts'

const S = symbols

test.group('Types', () => {
  test('defineTenancyConfig returns the input shape', ({ assert }) => {
    const config = defineTenancyConfig({
      default: 'acme',
      failOnMissing: false,
      tenants: {
        acme: {
          resolver: 'subdomain',
          options: { levels: 1 },
        },
      },
    })

    assert.equal(config.default, 'acme')
    assert.equal(config.tenants.acme.resolver, 'subdomain')
    assert.equal(config.tenants.acme.options!.levels, 1)
    assert.isFalse(config.failOnMissing)
  })

  test('TenancyConfig permits runtime validation of incomplete configuration', ({ assert }) => {
    const config: TenancyConfig = { default: 'app' }

    assert.equal(config.default, 'app')
    assert.isUndefined(config.tenants)
  })

  test('defineTenancyConfig rejects an unknown default and mismatched resolver options', ({
    assert,
  }) => {
    defineTenancyConfig({
      // @ts-expect-error The default must name a configured tenant key.
      default: 'missing',
      tenants: { header: { resolver: 'header' } },
    })

    defineTenancyConfig({
      default: 'header',
      // @ts-expect-error Header resolvers do not accept subdomain options.
      tenants: { header: { resolver: 'header', options: { levels: 1 } } },
    })

    assert.isTrue(true)
  })

  test('TenantConfig union type resolves correctly', ({ assert }) => {
    const headerConfig: TenantConfig = {
      resolver: 'header',
      options: { header: 'X-Tenant' },
    }
    assert.equal(headerConfig.resolver, 'header')
    assert.equal(headerConfig.options!.header, 'X-Tenant')
  })

  test('TenantResolverContract structural typing', ({ assert }) => {
    const resolver: TenantResolverContract = {
      async resolve(_ctx: HttpContext): Promise<TenantContext | null> {
        return { id: 1, name: 'Acme', slug: 'acme' }
      },
    }
    const barrelResolver: BarrelTenantResolverContract = resolver
    assert.isFunction(barrelResolver.resolve)
  })
  test('TenantUserProviderContract accepts Adonis bigint identifiers', async ({ assert }) => {
    const provider: TenantUserProviderContract<{ id: BigInt }> = {
      async findById(_tenant, identifier) {
        return { id: identifier as BigInt }
      },
    }

    const user = await provider.findById({ id: 1, name: 'Acme', slug: 'acme' }, BigInt(1))
    assert.equal(user?.id, BigInt(1))
  })

  test('TenantContext shape is correct', ({ assert }) => {
    const tenant: TenantContext = { id: 'tenant-1', name: 'Test Corp', slug: 'test-corp' }
    assert.equal(tenant.id, 'tenant-1')
    assert.equal(tenant.name, 'Test Corp')
    assert.equal(tenant.slug, 'test-corp')
  })
  test('tenant guard factories retain concrete user and guard APIs', async ({ assert }) => {
    type User = { email: string }
    const user = { email: 'user@example.com' }
    const guardUser = (original: User) => ({
      getId: () => 1,
      getOriginal: () => original,
    })
    const tenantProvider: TenantUserProviderContract<User> = {
      findById: async () => user,
    }
    const sessionProvider: SessionUserProviderContract<User> = {
      [S.PROVIDER_REAL_USER]: user,
      findById: async () => guardUser(user),
      createUserForGuard: async (value) => guardUser(value),
    }
    const tokenProvider: AccessTokensUserProviderContract<User> = {
      [S.PROVIDER_REAL_USER]: user,
      createUserForGuard: async (value) => guardUser(value),
      createToken: async () => undefined as never,
      invalidateToken: async () => true,
      findById: async () => guardUser(user),
      verifyToken: async () => null,
    }
    const basicProvider: BasicAuthUserProviderContract<User> = {
      [S.PROVIDER_REAL_USER]: user,
      verifyCredentials: async () => guardUser(user),
      createUserForGuard: async (value) => guardUser(value),
    }
    const tenantTokenProvider: TenantBoundAccessTokenVerifier = {
      verifyForCurrentTenant: async () => null,
    }
    const app = {
      container: {
        make: async () => ({ emit: () => undefined }),
      },
    }

    const authConfigProvider = defineTenantAuthConfig({
      default: 'web',
      guards: {
        web: tenantAwareSessionGuard({
          provider: sessionProvider,
          tenantProvider,
        }),
        api: tenantAwareAccessTokensGuard({
          provider: tokenProvider,
          tenantTokenProvider,
        }),
        basic: tenantAwareBasicAuthGuard({
          provider: basicProvider,
          tenantProvider,
        }),
      },
    })
    const resolvedByAuthProvider = await configProvider.resolve(app as never, authConfigProvider)
    assert.isNotNull(resolvedByAuthProvider)
    const authConfig = await authConfigProvider.resolver(app as never)

    const sessionGuard = authConfig.guards.web({} as HttpContext)
    const sessionUser: User | undefined = sessionGuard.user
    const sessionLogin: (value: User, remember?: boolean) => Promise<void> = sessionGuard.login
    const sessionLogout: () => Promise<void> = sessionGuard.logout

    const tokenGuard = authConfig.guards.api({} as HttpContext)
    const tokenUser: (User & { currentAccessToken: AccessToken }) | undefined = tokenGuard.user
    const tokenCreate: (
      value: User,
      abilities?: string[],
      options?: { name?: string; expiresIn?: string | number }
    ) => Promise<AccessToken> = tokenGuard.createToken
    const tokenInvalidate: () => Promise<boolean> = tokenGuard.invalidateToken

    const basicGuard = authConfig.guards.basic({} as HttpContext)
    const basicUser: User | undefined = basicGuard.user

    void [
      sessionUser,
      sessionLogin,
      sessionLogout,
      tokenUser,
      tokenCreate,
      tokenInvalidate,
      basicUser,
    ]
    assert.isTrue(true)
  })
})
