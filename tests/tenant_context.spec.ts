import { test } from '@japa/runner'
import { getTenantContext, getTenantContextOrFail, runWithTenant } from '../src/tenant_context.js'
import type { TenantContext } from '../src/types.js'

const acme: TenantContext = { id: 1, name: 'Acme Corp', slug: 'acme' }
const globex: TenantContext = { id: 2, name: 'Globex Inc', slug: 'globex' }

test.group('TenantContext', () => {
  test('getTenantContext returns undefined outside runWithTenant', ({ assert }) => {
    assert.isUndefined(getTenantContext())
  })

  test('getTenantContextOrFail throws when no tenant context set', ({ assert }) => {
    assert.throws(() => getTenantContextOrFail(), 'No tenant context available')
  })

  test('runWithTenant sets tenant context inside callback', async ({ assert }) => {
    await runWithTenant(acme, async () => {
      const ctx = getTenantContext()
      assert.equal(ctx, acme)
    })
  })

  test('runWithTenant restores undefined after callback completes', async ({ assert }) => {
    await runWithTenant(acme, async () => {})
    assert.isUndefined(getTenantContext())
  })

  test('normalizes synchronous callback throws into promise rejections', async ({ assert }) => {
    const result = runWithTenant(acme, () => {
      assert.equal(getTenantContext(), acme)
      throw new Error('tenant callback failed')
    })

    await assert.rejects(() => result, 'tenant callback failed')
    assert.isUndefined(getTenantContext())
  })

  test('nested runWithTenant calls use the inner context', async ({ assert }) => {
    await runWithTenant(acme, async () => {
      assert.equal(getTenantContext(), acme)

      await runWithTenant(globex, async () => {
        assert.equal(getTenantContext(), globex)
      })

      assert.equal(getTenantContext(), acme)
    })
  })

  test('concurrent runWithTenant calls have isolated contexts', async ({ assert }) => {
    const results: Array<{ id: string | number; name: string }> = []

    await Promise.all([
      runWithTenant(acme, async () => {
        await new Promise((r) => setImmediate(r))
        const ctx = getTenantContext()
        if (ctx) results.push({ id: ctx.id, name: ctx.name })
      }),
      runWithTenant(globex, async () => {
        await new Promise((r) => setImmediate(r))
        const ctx = getTenantContext()
        if (ctx) results.push({ id: ctx.id, name: ctx.name })
      }),
    ])

    assert.lengthOf(results, 2)
    assert.includeMembers(
      results.map((r) => r.name),
      ['Acme Corp', 'Globex Inc']
    )
  })

  test('nested async call chains preserve tenant context', async ({ assert }) => {
    await runWithTenant(acme, async () => {
      const result = await step1()
      assert.equal(result, 'acme')
    })
  })

  test('getTenantContextOrFail returns tenant when set', async ({ assert }) => {
    await runWithTenant(acme, async () => {
      const ctx = getTenantContextOrFail()
      assert.equal(ctx, acme)
    })
  })
})

async function step1(): Promise<string> {
  const ctx = getTenantContextOrFail()
  return step2(ctx.slug)
}

async function step2(slug: string): Promise<string> {
  return Promise.resolve(slug)
}
