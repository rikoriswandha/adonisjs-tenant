import { test } from '@japa/runner'
import { TenancyProvider } from '../providers/tenancy_provider.js'
import { TenantService } from '../src/tenant_service.js'
import { extendAuthenticator } from '../src/extensions/authenticator.js'
import type { ApplicationService } from '@adonisjs/core/types'

test.group('TenancyProvider', () => {
  test('export provider class', ({ assert }) => {
    assert.isFunction(TenancyProvider)
  })

  test('provider has register and boot methods', ({ assert }) => {
    const app = { container: { singleton: () => {} } } as unknown as ApplicationService
    const provider = new TenancyProvider(app)
    assert.isFunction(provider.register)
    assert.isFunction(provider.boot)
    assert.lengthOf(Object.keys(provider), 1)
  })

  test('register binds tenant.service as singleton', async ({ assert }) => {
    let bindingKey = ''
    let bindingFactory: () => any = () => {}

    const app = {
      container: {
        singleton(key: string, factory: () => any) {
          bindingKey = key
          bindingFactory = factory
        },
      },
    } as unknown as ApplicationService

    const provider = new TenancyProvider(app)
    provider.register()

    assert.equal(bindingKey, 'tenant.service')
    const resolved = await bindingFactory()
    assert.strictEqual(resolved, TenantService)
  })
})

test.group('TenantService container binding', () => {
  test('resolved service equals TenantService class', async ({ assert }) => {
    let bindingFactory: () => any = () => {}

    const app = {
      container: {
        singleton(_key: string, factory: () => any) {
          bindingFactory = factory
        },
      },
    } as unknown as ApplicationService

    const provider = new TenancyProvider(app)
    provider.register()

    const resolved = await bindingFactory()
    assert.strictEqual(resolved, TenantService)
    assert.isFunction(resolved.get)
    assert.isFunction(resolved.require)
    assert.isFunction(resolved.run)
    assert.isFunction(resolved.isActive)
    assert.isFunction(resolved.currentId)
  })
})

test.group('extendAuthenticator', () => {
  test('extendAuthenticator is a function', ({ assert }) => {
    assert.isFunction(extendAuthenticator)
  })

  test('extendAuthenticator patches createAuthenticator on manager', ({ assert }) => {
    const manager = {
      config: { default: 'web', guards: {} },
      createAuthenticator: (ctx: any) => ctx,
    }

    const original = manager.createAuthenticator
    extendAuthenticator(manager as any)

    assert.notStrictEqual(manager.createAuthenticator, original)
    assert.isFunction(manager.createAuthenticator)
  })
})
