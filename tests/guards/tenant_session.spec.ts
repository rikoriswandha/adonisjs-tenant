import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import type { SessionUserProviderContract } from '@adonisjs/auth/types/session'
import type { HttpContext } from '@adonisjs/core/http'
import {
  tenantAwareSessionGuard,
  TenantAwareSessionUserProvider,
} from '../../src/guards/tenant_aware_session.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

test.group('TenantAwareSessionUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function createMockProvider(
    returnsUser: boolean
  ): SessionUserProviderContract<{ email: string }> {
    if (returnsUser) {
      return {
        [S.PROVIDER_REAL_USER]: { email: 'user@example.com' },
        findById: async (_identifier) => ({
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
      findById: async () => null,
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

  test('findById returns guardUser when user belongs to tenant', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById('custom-primary-key')

    assert.isNotNull(result)
    assert.equal(result!.getId(), 'custom-primary-key')
    assert.deepEqual(result!.getOriginal(), { email: 'user@example.com' })
  })

  test('findById returns null when user not found by wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(false)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById(1)

    assert.isNull(result)
  })

  test('findById returns null when tenant context is missing', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => null)

    const result = await wrapper.findById(1)

    assert.isNull(result)
  })

  test('findById returns null when user does not belong to tenant', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(false)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById(1)

    assert.isNull(result)
  })

  test('createUserForGuard delegates to wrapped provider', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => tenant)

    const user = { email: 'other@example.com' }
    const guardUser = await wrapper.createUserForGuard(user)

    assert.equal(guardUser.getId(), 'custom-primary-key')
    assert.equal(guardUser.getOriginal(), user)
  })

  test('constructs the factory with a structural tenant provider', async ({ assert }) => {
    const guardConfig = tenantAwareSessionGuard({
      provider: createMockProvider(true),
      tenantProvider: createTenantProvider(true),
    })
    const factory = await guardConfig.resolver('web', {
      container: { make: async () => ({}) },
    } as never)

    assert.isFunction(factory)
  })
})
