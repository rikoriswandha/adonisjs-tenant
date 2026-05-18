import { test } from '@japa/runner'
import type {
  TenancyConfig,
  TenantConfig,
  TenantContext,
  TenantResolverContract,
} from '../src/types.ts'
import { defineTenancyConfig } from '../src/define_config.ts'
import type { HttpContext } from '@adonisjs/core/http'

test.group('Types', () => {
  test('defineTenancyConfig returns the input shape', ({ assert }) => {
    const config = defineTenancyConfig({
      default: 'app',
      tenants: {
        acme: {
          resolver: 'subdomain',
          options: { domain: 'acme.example.com' },
        },
      },
    })

    assert.equal(config.default, 'app')
    assert.equal(config.tenants!.acme.resolver, 'subdomain')
    assert.equal(config.tenants!.acme.options!.domain, 'acme.example.com')
  })

  test('defineTenancyConfig works with minimal config', ({ assert }) => {
    const config = defineTenancyConfig({ default: 'app' }) as TenancyConfig

    assert.equal(config.default, 'app')
    assert.isUndefined(config.tenants)
  })

  test('TenantConfig union type resolves correctly', ({ assert }) => {
    const headerConfig: TenantConfig = {
      resolver: 'header',
      options: { headerName: 'X-Tenant' },
    }
    assert.equal(headerConfig.resolver, 'header')
    assert.equal(headerConfig.options!.headerName, 'X-Tenant')
  })

  test('TenantResolverContract structural typing', ({ assert }) => {
    const resolver: TenantResolverContract = {
      async resolve(_ctx: HttpContext): Promise<TenantContext | null> {
        return { id: 1, name: 'Acme', slug: 'acme' }
      },
    }
    assert.isFunction(resolver.resolve)
  })

  test('TenantContext shape is correct', ({ assert }) => {
    const tenant: TenantContext = { id: 'tenant-1', name: 'Test Corp', slug: 'test-corp' }
    assert.equal(tenant.id, 'tenant-1')
    assert.equal(tenant.name, 'Test Corp')
    assert.equal(tenant.slug, 'test-corp')
  })
})
