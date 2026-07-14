import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'
import TenancyProvider, {
  TenancyProvider as NamedTenancyProvider,
} from '../providers/tenancy_provider.js'
import { TenantService } from '../src/tenant_service.js'
import { extendAuthenticator } from '../src/extensions/authenticator.js'
import type { ApplicationService, ContainerBindings } from '@adonisjs/core/types'

test.group('TenancyProvider', () => {
  test('default-exports the provider class for AdonisJS lazy loading', ({ assert }) => {
    assert.isFunction(TenancyProvider)
    assert.strictEqual(TenancyProvider, NamedTenancyProvider)
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
    const typedTenantService: ContainerBindings['tenant.service'] = TenantService
    assert.strictEqual(resolved, typedTenantService)
  })

  test('boots without registering a redundant router middleware alias', async ({ assert }) => {
    const requestedBindings: string[] = []
    const authManager = {
      config: { default: 'web', guards: {} },
      createAuthenticator: (ctx: unknown) => ctx,
    }
    const app = {
      container: {
        singleton() {},
        async make(binding: string) {
          requestedBindings.push(binding)
          if (binding === 'auth.manager') {
            return authManager
          }
          throw new Error(`Unexpected container binding: ${binding}`)
        },
      },
      config: {
        get() {
          return { default: '' }
        },
      },
    } as unknown as ApplicationService

    await new TenancyProvider(app).boot()

    assert.deepEqual(requestedBindings, ['auth.manager'])
  })

  test('boots through AdonisJS provider lifecycle using the lazy default export', async ({
    assert,
  }) => {
    const app = new AppFactory().create(new URL('../', import.meta.url), (id) => import(id))
    app.useConfig({ tenancy: { default: '' } })
    app.rcContents({
      providers: [
        // Dynamic import intentionally exercises AdonisJS's lazy provider module contract.
        () => import('../providers/tenancy_provider.js'),
      ],
    })
    await app.init()
    app.container.singleton('auth.manager', () => ({
      config: { default: 'web', guards: {} },
      createAuthenticator: (ctx: unknown) => ctx,
    }))

    try {
      await app.boot()
      const service = await app.container.make('tenant.service')
      assert.strictEqual(service, TenantService)
    } finally {
      await app.terminate()
    }
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
