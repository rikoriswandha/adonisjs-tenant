import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import type { BasicAuthUserProviderContract } from '@adonisjs/auth/types/basic_auth'
import type { HttpContext } from '@adonisjs/core/http'
import {
  tenantAwareBasicAuthGuard,
  TenantAwareBasicAuthUserProvider,
} from '../../src/guards/tenant_aware_basic_auth.js'
import type { TenantContext } from '../../src/types.js'
import { runWithTenant } from '../../src/tenant_context.js'

const S = symbols

test.group('TenantAwareBasicAuthUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function createMockProvider(
    returnsUser: boolean
  ): BasicAuthUserProviderContract<{ email: string }> {
    if (returnsUser) {
      return {
        [S.PROVIDER_REAL_USER]: { email: 'user@example.com' },
        verifyCredentials: async (_uid, _password) => ({
          getId: () => 'custom-primary-key',
          getOriginal: () => ({ email: 'user@example.com' }),
        }),
        createUserForGuard: async (user) => ({
          getId: () => 'custom-primary-key',
          getOriginal: () => user,
        }),
      }
    }

    return {
      [S.PROVIDER_REAL_USER]: { email: 'user@example.com' },
      verifyCredentials: async () => null,
      createUserForGuard: async (user) => ({
        getId: () => 'custom-primary-key',
        getOriginal: () => user,
      }),
    }
  }

  function createTenantProvider(userBelongsToTenant: boolean): {
    findById(t: TenantContext, id: string | number | BigInt): Promise<{ email: string } | null>
    resolveTenant(ctx: HttpContext): Promise<TenantContext | null>
  } {
    return {
      findById: async (_t, id) => {
        if (userBelongsToTenant && id === 'custom-primary-key') {
          return { email: 'user@example.com' }
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
    assert.equal(result!.getId(), 'custom-primary-key')
    assert.deepEqual(result!.getOriginal(), { email: 'user@example.com' })
  })

  test('uses the package tenant context by default', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)
    const findById = tenantProvider.findById
    let receivedTenant: TenantContext | undefined

    tenantProvider.findById = async (currentTenant, id) => {
      receivedTenant = currentTenant
      return findById(currentTenant, id)
    }

    const wrapper = new TenantAwareBasicAuthUserProvider(provider, tenantProvider)
    const result = await runWithTenant(tenant, () =>
      wrapper.verifyCredentials('user@example.com', 'password')
    )

    assert.isNotNull(result)
    assert.equal(receivedTenant, tenant)
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

    const user = { email: 'other@example.com' }
    const guardUser = await wrapper.createUserForGuard(user)

    assert.equal(guardUser.getId(), 'custom-primary-key')
    assert.equal(guardUser.getOriginal(), user)
  })

  test('constructs the factory with a structural tenant provider', async ({ assert }) => {
    const guardConfig = tenantAwareBasicAuthGuard({
      provider: createMockProvider(true),
      tenantProvider: createTenantProvider(true),
    })
    const factory = await guardConfig.resolver('basic', {
      container: { make: async () => ({}) },
    } as never)

    assert.isFunction(factory)
  })
})
