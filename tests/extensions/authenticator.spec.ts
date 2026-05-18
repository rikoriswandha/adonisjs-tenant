import { test } from '@japa/runner'
import { symbols } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'
import type { GuardFactory, GuardContract } from '@adonisjs/auth/types'
import { TenantAuthenticator } from '../../src/extensions/authenticator.js'
import { runWithTenant } from '../../src/tenant_context.js'
import type { TenantContext } from '../../src/types.js'

const S = symbols

const tenantFixture: TenantContext = {
  id: 'tenant-1',
  name: 'Test Corp',
  slug: 'test-corp',
}

test.group('TenantAuthenticator', () => {
  test('tenant returns undefined when no tenant context is active', ({ assert }) => {
    const auth = new TenantAuthenticator({} as HttpContext, {
      default: 'web',
      guards: {
        web: (() => ({}) as any) as GuardFactory,
      },
    })

    assert.isUndefined(auth.tenant)
  })

  test('tenant returns tenant context when active', async ({ assert }) => {
    const auth = new TenantAuthenticator({} as HttpContext, {
      default: 'web',
      guards: {
        web: (() => ({}) as any) as GuardFactory,
      },
    })

    await runWithTenant(tenantFixture, async () => {
      assert.deepEqual(auth.tenant, tenantFixture)
    })
  })

  test('auth.user still works normally after authentication', async ({ assert }) => {
    const mockUser = { id: 1, email: 'user@example.com' }

    const mockGuard: GuardContract<typeof mockUser> = {
      driverName: 'session',
      isAuthenticated: true,
      authenticationAttempted: true,
      user: mockUser,
      getUserOrFail: () => mockUser,
      check: async () => true,
      authenticate: async () => mockUser,
      authenticateAsClient: async () => ({}),
      [S.GUARD_KNOWN_EVENTS]: undefined as unknown,
    }

    const auth = new TenantAuthenticator({} as HttpContext, {
      default: 'web',
      guards: {
        web: (() => mockGuard) as GuardFactory,
      },
    })

    const isAuthenticated = await auth.check()
    assert.isTrue(isAuthenticated)
    assert.deepEqual(auth.user, mockUser)
  })
})
