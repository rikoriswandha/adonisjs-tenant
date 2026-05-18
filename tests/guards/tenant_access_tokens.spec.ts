import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import { Secret } from '@adonisjs/core/helpers'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import type { AccessTokensUserProviderContract } from '@adonisjs/auth/types/access_tokens'
import { TenantAwareAccessTokensUserProvider } from '../../src/guards/tenant_aware_access_tokens.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

function createMockToken(
  options: Partial<ConstructorParameters<typeof AccessToken>[0]> = {}
): AccessToken {
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
    ...options,
  })
}

test.group('TenantAwareAccessTokensUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function createMockProvider(
    returnsUser: boolean,
    returnsToken: boolean
  ): AccessTokensUserProviderContract<{ id: number; email: string }> {
    const user = { id: 1, email: 'user@example.com' }
    return {
      [S.PROVIDER_REAL_USER]: user,
      createUserForGuard: async (_u) => ({
        getId: () => _u.id,
        getOriginal: () => _u,
      }),
      createToken: async (_u, _abilities, _options) => createMockToken({ tokenableId: _u.id }),
      invalidateToken: async () => true,
      findById: async (_identifier) => {
        if (returnsUser) {
          return {
            getId: () => user.id,
            getOriginal: () => user,
          }
        }
        return null
      },
      verifyToken: async (_tokenValue) => {
        if (returnsToken) {
          return createMockToken()
        }
        return null
      },
    }
  }

  function createTenantProvider(userBelongsToTenant: boolean): {
    findById(t: TenantContext, id: string | number): Promise<{ id: number; email: string } | null>
    resolveTenant(): Promise<TenantContext | null>
  } {
    const user = { id: 1, email: 'user@example.com' }
    return {
      findById: async (_t, _id) => {
        if (userBelongsToTenant) return user
        return null
      },
      resolveTenant: async () => tenant,
    }
  }

  test('findById returns guardUser when user belongs to tenant', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById(1)

    assert.isNotNull(result)
    assert.equal(result!.getId(), 1)
    assert.deepEqual(result!.getOriginal(), { id: 1, email: 'user@example.com' })
  })

  test('findById returns null when tenant context is missing', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => null)

    const result = await wrapper.findById(1)
    assert.isNull(result)
  })

  test('findById returns null when user does not belong to tenant', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(false)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById(1)
    assert.isNull(result)
  })

  test('verifyToken returns token when token is valid and user belongs to tenant', async ({
    assert,
  }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyToken(new Secret('oat_test'))

    assert.isNotNull(result)
    assert.instanceOf(result, AccessToken)
  })

  test('verifyToken returns null when token is invalid', async ({ assert }) => {
    const provider = createMockProvider(true, false)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyToken(new Secret('oat_invalid'))
    assert.isNull(result)
  })

  test('verifyToken returns null when tenant context is missing', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => null)

    const result = await wrapper.verifyToken(new Secret('oat_test'))
    assert.isNull(result)
  })

  test('verifyToken returns null when user does not belong to tenant', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(false)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyToken(new Secret('oat_test'))
    assert.isNull(result)
  })

  test('createUserForGuard delegates to wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const user = { id: 2, email: 'other@example.com' }
    const guardUser = await wrapper.createUserForGuard(user)

    assert.equal(guardUser.getId(), 2)
    assert.equal(guardUser.getOriginal(), user)
  })

  test('createToken delegates to wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const user = { id: 1, email: 'user@example.com' }
    const token = await wrapper.createToken(user, ['read'], { name: 'test' })

    assert.instanceOf(token, AccessToken)
    assert.equal(token.tokenableId, 1)
  })

  test('invalidateToken delegates to wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(true, true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareAccessTokensUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.invalidateToken(new Secret('oat_test'))
    assert.isTrue(result)
  })
})
