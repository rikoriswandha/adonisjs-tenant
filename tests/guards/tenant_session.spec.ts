import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import type { SessionUserProviderContract } from '@adonisjs/auth/types/session'
import type { HttpContext } from '@adonisjs/core/http'
import { TenantAwareSessionUserProvider } from '../../src/guards/tenant_aware_session.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

test.group('TenantAwareSessionUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function createMockProvider(
    returnsUser: boolean
  ): SessionUserProviderContract<{ id: number; email: string }> {
    if (returnsUser) {
      return {
        [S.PROVIDER_REAL_USER]: { id: 1, email: 'user@example.com' },
        findById: async (_identifier) => ({
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
      findById: async () => null,
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

  test('findById returns guardUser when user belongs to tenant', async ({ assert }) => {
    const provider = createMockProvider(true)
    const tenantProvider = createTenantProvider(true)

    const wrapper = new TenantAwareSessionUserProvider(provider, tenantProvider, () => tenant)

    const result = await wrapper.findById(1)

    assert.isNotNull(result)
    assert.equal(result!.getId(), 1)
    assert.deepEqual(result!.getOriginal(), { id: 1, email: 'user@example.com' })
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

    const user = { id: 2, email: 'other@example.com' }
    const guardUser = await wrapper.createUserForGuard(user)

    assert.equal(guardUser.getId(), 2)
    assert.equal(guardUser.getOriginal(), user)
  })
})
