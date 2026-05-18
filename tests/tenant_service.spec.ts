import { test } from '@japa/runner'
import { TenantService } from '../src/tenant_service.ts'
import { getTenantContext, runWithTenant } from '../src/tenant_context.ts'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { TenantContext } from '../src/types.ts'

const tenantFixture: TenantContext = {
  id: 'tenant-1',
  name: 'Test Corp',
  slug: 'test-corp',
}

test.group('TenantService', () => {
  test('get returns undefined when no tenant is active', ({ assert }) => {
    assert.isUndefined(TenantService.get())
  })

  test('get returns tenant context when active', async ({ assert }) => {
    await runWithTenant(tenantFixture, async () => {
      const result = TenantService.get()
      assert.deepEqual(result, tenantFixture)
    })
  })

  test('require throws RuntimeException when no tenant is active', ({ assert }) => {
    assert.throws(() => TenantService.require(), RuntimeException)
  })

  test('require returns tenant context when active', async ({ assert }) => {
    await runWithTenant(tenantFixture, async () => {
      const result = TenantService.require()
      assert.deepEqual(result, tenantFixture)
    })
  })

  test('run executes callback within tenant context', async ({ assert }) => {
    let capturedTenant: TenantContext | undefined
    await TenantService.run(tenantFixture, async () => {
      capturedTenant = getTenantContext()
    })
    assert.deepEqual(capturedTenant, tenantFixture)
  })

  test('run returns the callback result', async ({ assert }) => {
    const result = await TenantService.run(tenantFixture, async () => 'done')
    assert.equal(result, 'done')
  })

  test('run executes sync callback within tenant context', async ({ assert }) => {
    const result = await TenantService.run(tenantFixture, () => {
      const ctx = getTenantContext()
      return ctx?.id
    })
    assert.equal(result, tenantFixture.id)
  })

  test('isActive returns false outside tenant context', ({ assert }) => {
    assert.isFalse(TenantService.isActive())
  })

  test('isActive returns true inside tenant context', async ({ assert }) => {
    await runWithTenant(tenantFixture, async () => {
      assert.isTrue(TenantService.isActive())
    })
  })

  test('currentId returns undefined outside tenant context', ({ assert }) => {
    assert.isUndefined(TenantService.currentId())
  })

  test('currentId returns tenant id inside tenant context', async ({ assert }) => {
    await runWithTenant(tenantFixture, async () => {
      assert.equal(TenantService.currentId(), tenantFixture.id)
    })
  })
})
