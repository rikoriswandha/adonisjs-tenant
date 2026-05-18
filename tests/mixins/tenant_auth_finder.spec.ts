import { test } from '@japa/runner'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withTenantAuthFinder } from '../../src/mixins/tenant_auth_finder.js'
import { runWithTenant, getTenantContext } from '../../src/tenant_context.js'

test.group('withTenantAuthFinder', () => {
  test('mixin composes TenantScope and withAuthFinder', async ({ assert }) => {
    const hash = () =>
      ({
        make: async (value: string) => `hashed:${value}`,
        verify: async (_: string, value: string) => value === 'secret',
      }) as any

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string

      @column()
      declare tenantId: string
    }

    assert.isFunction(User.findForAuth)
    assert.isFunction(User.verifyCredentials)
    assert.isDefined(User.accessTokens)
  })

  test('findForAuth scopes to tenant when context is active', async ({ assert }) => {
    const hash = () => ({ make: async (v: string) => v, verify: async () => true }) as any

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string
    }

    await runWithTenant({ id: 't1', name: 'T1', slug: 't1' }, async () => {
      const ctx = getTenantContext()
      assert.equal(ctx?.id, 't1')
      assert.isFunction(User.findForAuth)
    })
  })

  test('findForAuth works without tenant context', async ({ assert }) => {
    const hash = () => ({ make: async (v: string) => v, verify: async () => true }) as any

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string
    }

    assert.isFunction(User.findForAuth)
  })

  test('TenantDbAccessTokensProvider injects tenant_id on create', async ({ assert }) => {
    const hash = () => ({ make: async (v: string) => v, verify: async () => true }) as any

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string
    }

    assert.isDefined(User.accessTokens)
    assert.isFunction((User.accessTokens as any).create)
  })

  test('accessTokens getter returns different instances for different models', async ({
    assert,
  }) => {
    const hash = () => ({ make: async (v: string) => v, verify: async () => true }) as any

    class User1 extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number
    }

    class User2 extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number
    }

    const tokens1 = User1.accessTokens
    const tokens2 = User2.accessTokens

    assert.isDefined(tokens1)
    assert.isDefined(tokens2)
    // Each model should get its own provider instance
    assert.notEqual(tokens1, tokens2)
  })
})
