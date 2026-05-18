import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import type { BasicAuthUserProviderContract } from '@adonisjs/auth/types/basic_auth'
import type { HttpContext } from '@adonisjs/core/http'
import { TenantAwareBasicAuthUserProvider } from '../../src/guards/tenant_aware_basic_auth.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

test.group('TenantAwareBasicAuthUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function createMockProvider(
    returnsUser: boolean
  ): BasicAuthUserProviderContract<{ id: number; email: string }> {
    if (returnsUser) {
      return {
        [S.PROVIDER_REAL_USER]: { id: 1, email: 'user@example.com' },
        verifyCredentials: async (_uid, _password) => ({
          getId: () => 1,
          getOriginal: () => ({ id: 1, email: 'user@example.com' }),
        }),
        createUserForGuard: async (user) => ({
          getId: () => user.id,
          getOriginal: () => user,
        }),
      }
    }

    return {
      [S.PROVIDER_REAL_USER]: { id: 1, email: 'user@example.com' },
      verifyCredentials: async () => null,
      createUserForGuard: async (user) => ({
        getId: () => user.id,
        getOriginal: () => user,
      }),
    }
  }

  function createTenantProvider(userBelongsToTenant: boolean): {
    findById(t: TenantContext, id: string | number): Promise<{ id: number; email: string } | null>
    resolveTenant(ctx: HttpContext): Promise<TenantContext | null>
  } {
    return {
      findById: async (_t, _id) => {
        if (userBelongsToTenant) {
          return { id: 1, email: 'user@example.com' }
        }
        return null
      },
      resolveTenant: async () => null,
    }
  }

  test('verifyCredentials returns guardUser when credentials valid and user in tenant', async ({
    assert,
  }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyCredentials('user@example.com', 'password')

    assert.isNotNull(result)
    assert.equal(result!.getId(), 1)
    assert.deepEqual(result!.getOriginal(), { id: 1, email: 'user@example.com' })
  })

  test('verifyCredentials returns null when credentials are invalid', async ({ assert }) => {
    const provider = createMockProvider(false)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyCredentials('wrong@example.com', 'wrong')

    assert.isNull(result)
  })

  test('verifyCredentials returns null when tenant context is missing', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider, () => null)

    const result = await wrapper.verifyCredentials('user@example.com', 'password')

    assert.isNull(result)
  })

  test('verifyCredentials returns null when user does not belong to tenant', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(false)

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.verifyCredentials('user@example.com', 'password')

    assert.isNull(result)
  })

  test('createUserForGuard delegates to wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider, () => tenant)

    const user = { id: 2, email: 'other@example.com' }
    const guardUser = await wrapper.createUserForGuard(user)

    assert.equal(guardUser.getId(), 2)
    assert.equal(guardUser.getOriginal(), user)
  })
})
