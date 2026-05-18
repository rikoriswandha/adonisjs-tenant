import { test } from '@japa/runner'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { TenantUserProvider } from '../src/user_providers/tenant_user_provider.js'
import type { TenantContext } from '../src/types.js'

test.group('TenantUserProvider', () => {
  const tenant: TenantContext = { id: 'tenant-1', name: 'Acme', slug: 'acme' }

  function mockQueryBuilder(returnValue: object | null) {
    return {
      innerJoin: (_table: string, _col1: string, _col2: string) => ({
        where: (_key: string, _value: unknown) => ({
          where: (_key2: string, _value2: unknown) => ({
            first: async () => returnValue,
          }),
        }),
      }),
    }
  }

  function mockUserModel(returnValue: object | null): LucidModel {
    return {
      table: 'users',
      query: () => mockQueryBuilder(returnValue),
    } as unknown as LucidModel
  }

  test('findById returns user when user belongs to tenant', async ({ assert }) => {
    const fakeUser = { id: 1, email: 'user@example.com' }
    const provider = new TenantUserProvider(mockUserModel(fakeUser))

    const result = await provider.findById(tenant, 1)

    assert.isNotNull(result)
    assert.equal((result as any)!.id, 1)
    assert.equal((result as any)!.email, 'user@example.com')
  })

  test('findById returns null when user does not belong to tenant', async ({ assert }) => {
    const provider = new TenantUserProvider(mockUserModel(null))

    const result = await provider.findById(tenant, 999)

    assert.isNull(result)
  })

  test('getUserFor returns user when user belongs to tenant', async ({ assert }) => {
    const fakeUser = { id: 1, email: 'user@example.com' }
    const provider = new TenantUserProvider(mockUserModel(fakeUser))

    const result = await provider.getUserFor(tenant, 1)

    assert.equal((result as any).id, 1)
    assert.equal((result as any).email, 'user@example.com')
  })

  test('getUserFor throws RuntimeException when user not found', async ({ assert }) => {
    const provider = new TenantUserProvider(mockUserModel(null))

    await assert.rejects(() => provider.getUserFor(tenant, 999), RuntimeException)
  })

  test('resolveTenant returns null by default', async ({ assert }) => {
    const provider = new TenantUserProvider(mockUserModel(null))
    const ctx = {} as HttpContext

    const result = await provider.resolveTenant(ctx)

    assert.isNull(result)
  })

  test('uses custom pivot table name', async ({ assert }) => {
    const fakeUser = { id: 1, email: 'user@example.com' }
    let capturedPivotTable = ''

    const customQueryBuilder = {
      innerJoin: (table: string, _col1: string, _col2: string) => {
        capturedPivotTable = table
        return {
          where: (_key: string, _value: unknown) => ({
            where: (_key2: string, _value2: unknown) => ({
              first: async () => fakeUser,
            }),
          }),
        }
      },
    }

    const customModel = {
      table: 'users',
      query: () => customQueryBuilder,
    } as unknown as LucidModel

    const provider = new TenantUserProvider(customModel, 'organisations')
    await provider.findById(tenant, 1)

    assert.equal(capturedPivotTable, 'organisations')
  })
})
