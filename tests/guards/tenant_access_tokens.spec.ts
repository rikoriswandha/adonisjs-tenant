import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import { Secret } from '@adonisjs/core/helpers'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import type { AccessTokensUserProviderContract } from '@adonisjs/auth/types/access_tokens'
import {
  tenantAwareAccessTokensGuard,
  TenantAwareAccessTokensUserProvider,
  type TenantBoundAccessTokenVerifier,
} from '../../src/guards/tenant_aware_access_tokens.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

function createToken(): AccessToken {
  return new AccessToken({
    identifier: 1,
    tokenableId: 1,
    type: 'auth_token',
    hash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    expiresAt: null,
    name: null,
    abilities: [],
  })
}

test.group('TenantAwareAccessTokensUserProvider', () => {
  const tenantA: TenantContext = { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' }
  const tenantB: TenantContext = { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b' }

  function createProvider(): AccessTokensUserProviderContract<{ email: string }> {
    const user = { email: 'shared@example.com' }
    return {
      [S.PROVIDER_REAL_USER]: user,
      createUserForGuard: async (value) => ({
        getId: () => 1,
        getOriginal: () => value,
      }),
      createToken: async () => createToken(),
      invalidateToken: async () => true,
      findById: async () => ({
        getId: () => 1,
        getOriginal: () => user,
      }),
      verifyToken: async () => createToken(),
    }
  }

  test('rejects a tenant A token in tenant B even when the user resolver serves both tenants', async ({
    assert,
  }) => {
    let activeTenant: TenantContext | null = tenantA
    const tenantTokenProvider: TenantBoundAccessTokenVerifier = {
      verifyForCurrentTenant: async () => (activeTenant?.id === tenantA.id ? createToken() : null),
    }
    const wrapper = new TenantAwareAccessTokensUserProvider(
      createProvider(),
      tenantTokenProvider,
      () => activeTenant
    )

    assert.isNotNull(await wrapper.verifyToken(new Secret('oat_tenant_a')))

    activeTenant = tenantB
    assert.isNull(await wrapper.verifyToken(new Secret('oat_tenant_a')))
  })

  test('requires an active tenant before calling the tenant-bound verifier', async ({ assert }) => {
    let verifierCalled = false
    const tenantTokenProvider: TenantBoundAccessTokenVerifier = {
      verifyForCurrentTenant: async () => {
        verifierCalled = true
        return createToken()
      },
    }
    const wrapper = new TenantAwareAccessTokensUserProvider(
      createProvider(),
      tenantTokenProvider,
      () => null
    )

    assert.isNull(await wrapper.verifyToken(new Secret('oat_missing_tenant')))
    assert.isFalse(verifierCalled)
  })

  test('delegates user lookup and token lifecycle operations to the access-token user provider', async ({
    assert,
  }) => {
    const wrapper = new TenantAwareAccessTokensUserProvider(
      createProvider(),
      { verifyForCurrentTenant: async () => createToken() },
      () => tenantA
    )

    const foundUser = await wrapper.findById(1)
    assert.equal(foundUser?.getOriginal().email, 'shared@example.com')
    assert.instanceOf(await wrapper.createToken({ email: 'shared@example.com' }), AccessToken)
    assert.isTrue(await wrapper.invalidateToken(new Secret('oat_token')))
  })

  test('constructs the factory with an explicit tenant-bound verifier', async ({ assert }) => {
    const guardConfig = tenantAwareAccessTokensGuard({
      provider: createProvider(),
      tenantTokenProvider: { verifyForCurrentTenant: async () => createToken() },
    })
    const factory = await guardConfig.resolver('api', {
      container: { make: async () => ({}) },
    } as never)

    assert.isFunction(factory)
  })

  test('rejects a factory that omits the tenant-bound verifier', async ({ assert }) => {
    const guardConfig = tenantAwareAccessTokensGuard({
      provider: createProvider(),
      tenantTokenProvider: undefined as never,
    })

    await assert.rejects(
      () =>
        guardConfig.resolver('api', {
          container: { make: async () => ({}) },
        } as never),
      /require a tenantTokenProvider/
    )
  })
})
