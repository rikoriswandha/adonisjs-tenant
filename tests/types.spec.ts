import { test } from '@japa/runner'
import type {
  TenantConfig,
  TenantContext,
  TenantResolverContract,
  TenantUserProviderContract,
  TenancyConfig,
} from '../src/types.ts'
import { defineTenancyConfig } from '../src/define_config.ts'
import type { TenantResolverContract as BarrelTenantResolverContract } from '../src/resolvers/index.ts'

import type { HttpContext } from '@adonisjs/core/http'

test.group('Types', () => {
  test('defineTenancyConfig returns the input shape', ({ assert }) => {
    const config = defineTenancyConfig({
      default: 'acme',
      failOnMissing: false,
      tenants: {
        acme: {
          resolver: 'subdomain',
          options: { levels: 1 },
        },
      },
    })

    assert.equal(config.default, 'acme')
    assert.equal(config.tenants.acme.resolver, 'subdomain')
    assert.equal(config.tenants.acme.options!.levels, 1)
    assert.isFalse(config.failOnMissing)
  })

  test('TenancyConfig permits runtime validation of incomplete configuration', ({ assert }) => {
    const config: TenancyConfig = { default: 'app' }

    assert.equal(config.default, 'app')
    assert.isUndefined(config.tenants)
  })

  test('defineTenancyConfig rejects an unknown default and mismatched resolver options', ({
    assert,
  }) => {
    defineTenancyConfig({
      // @ts-expect-error The default must name a configured tenant key.
      default: 'missing',
      tenants: { header: { resolver: 'header' } },
    })

    defineTenancyConfig({
      default: 'header',
      // @ts-expect-error Header resolvers do not accept subdomain options.
      tenants: { header: { resolver: 'header', options: { levels: 1 } } },
    })

    assert.isTrue(true)
  })

  test('TenantConfig union type resolves correctly', ({ assert }) => {
    const headerConfig: TenantConfig = {
      resolver: 'header',
      options: { header: 'X-Tenant' },
    }
    assert.equal(headerConfig.resolver, 'header')
    assert.equal(headerConfig.options!.header, 'X-Tenant')
  })

  test('TenantResolverContract structural typing', ({ assert }) => {
    const resolver: TenantResolverContract = {
      async resolve(_ctx: HttpContext): Promise<TenantContext | null> {
        return { id: 1, name: 'Acme', slug: 'acme' }
      },
    }
    const barrelResolver: BarrelTenantResolverContract = resolver
    assert.isFunction(barrelResolver.resolve)
  })
  test('TenantUserProviderContract accepts Adonis bigint identifiers', async ({ assert }) => {
    const provider: TenantUserProviderContract<{ id: BigInt }> = {
      async findById(_tenant, identifier) {
        return { id: identifier as BigInt }
      },
    }

    const user = await provider.findById({ id: 1, name: 'Acme', slug: 'acme' }, BigInt(1))
    assert.equal(user?.id, BigInt(1))
  })

  test('TenantContext shape is correct', ({ assert }) => {
    const tenant: TenantContext = { id: 'tenant-1', name: 'Test Corp', slug: 'test-corp' }
    assert.equal(tenant.id, 'tenant-1')
    assert.equal(tenant.name, 'Test Corp')
    assert.equal(tenant.slug, 'test-corp')
  })
})
