import { test } from '@japa/runner'
import { AppFactory } from '@adonisjs/core/factories/app'
import type { ApplicationService, ContainerBindings } from '@adonisjs/core/types'
import TenancyProvider, {
  TenancyProvider as NamedTenancyProvider,
} from '../providers/tenancy_provider.js'
import { TenantService } from '../src/tenant_service.js'
import TenantMiddleware from '../src/middleware/tenant_middleware.js'
import { extendAuthenticator } from '../src/extensions/authenticator.js'

function makeAuthManager() {
  return {
    config: { default: 'web', guards: {} },
    createAuthenticator: (ctx: unknown) => ctx,
  }
}

function makeProviderApp(tenancy: unknown) {
  const requestedBindings: string[] = []
  const authManager = makeAuthManager()
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
        return tenancy
      },
    },
  } as unknown as ApplicationService

  return { app, authManager, requestedBindings }
}

test.group('TenancyProvider', () => {
  test('default-exports the provider class for AdonisJS lazy loading', ({ assert }) => {
    assert.strictEqual(TenancyProvider, NamedTenancyProvider)
  })

  test('register binds tenant.service as singleton', async ({ assert }) => {
    let bindingKey = ''
    let bindingFactory: () => unknown = () => undefined
    const app = {
      container: {
        singleton(key: string, factory: () => unknown) {
          bindingKey = key
          bindingFactory = factory
        },
      },
    } as unknown as ApplicationService

    new TenancyProvider(app).register()

    assert.equal(bindingKey, 'tenant.service')
    const resolved = await bindingFactory()
    const typedTenantService: ContainerBindings['tenant.service'] = TenantService
    assert.strictEqual(resolved, typedTenantService)
  })

  test('rejects a missing default resolver before requesting Auth', async ({ assert }) => {
    const { app, requestedBindings } = makeProviderApp({ tenants: {} })

    await assert.rejects(
      () => new TenancyProvider(app).boot(),
      /"default" must select a resolver configured in "tenants"/
    )

    assert.deepEqual(requestedBindings, [])
  })

  test('rejects a default resolver that is not configured before requesting Auth', async ({
    assert,
  }) => {
    const { app, requestedBindings } = makeProviderApp({
      default: 'header',
      tenants: {
        subdomain: { resolver: 'subdomain', options: {} },
      },
    })

    await assert.rejects(
      () => new TenancyProvider(app).boot(),
      /default resolver "header" is not configured in "tenants"/
    )

    assert.deepEqual(requestedBindings, [])
  })

  test('boots selected resolver config and lets missing tenants continue when failOnMissing is false', async ({
    assert,
  }) => {
    const { app, requestedBindings } = makeProviderApp({
      default: 'header',
      failOnMissing: false,
      tenants: {
        header: {
          resolver: 'header',
          options: {
            header: 'X-Tenant-ID',
            tenants: {
              acme: { id: 1, name: 'Acme' },
            },
          },
        },
      },
    })

    await new TenancyProvider(app).boot()

    let continued = false
    const missingTenantContext = {
      request: { header: () => undefined },
    }
    await new TenantMiddleware().handle(missingTenantContext as never, async () => {
      continued = true
    })

    const resolvedTenantContext: {
      request: { header: (name: string) => 'acme' | undefined }
      tenant?: { id: number; name: string; slug: string }
    } = {
      request: { header: (name: string) => (name === 'X-Tenant-ID' ? 'acme' : undefined) },
    }
    await new TenantMiddleware().handle(resolvedTenantContext as never, async () => {})

    assert.deepEqual(requestedBindings, ['auth.manager'])
    assert.isTrue(continued)
    assert.deepEqual(resolvedTenantContext.tenant, { id: 1, name: 'Acme', slug: 'acme' })
  })

  test('boots through the AdonisJS lazy provider lifecycle', async ({ assert }) => {
    const app = new AppFactory().create(new URL('../', import.meta.url), (id) => import(id))
    app.useConfig({
      tenancy: {
        default: 'header',
        tenants: {
          header: { resolver: 'header', options: { tenants: {} } },
        },
      },
    })
    app.rcContents({
      providers: [() => import('../providers/tenancy_provider.js')],
    })
    await app.init()
    app.container.singleton('auth.manager', () => makeAuthManager())

    try {
      await app.boot()
      const service = await app.container.make('tenant.service')
      assert.strictEqual(service, TenantService)
    } finally {
      await app.terminate()
    }
  })
})

test.group('extendAuthenticator', () => {
  test('replaces the manager authenticator factory with a tenant-aware implementation', ({
    assert,
  }) => {
    const manager = makeAuthManager()
    const original = manager.createAuthenticator

    extendAuthenticator(manager as never)

    assert.notStrictEqual(manager.createAuthenticator, original)
    assert.instanceOf(manager.createAuthenticator({}), Object)
  })
})
