import { test } from '@japa/runner'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  TenantDatabaseExecutor,
  type TenantDatabaseClient,
} from '../src/tenant_database_executor.js'
import { runWithTenant, TenantNotResolvedError } from '../src/tenant_context.js'
import type { TenantContext } from '../src/types.js'

type RawCall = [sql: string, bindings: unknown[] | undefined]

type FakeDatabase = {
  client: TenantDatabaseClient
  transaction: TransactionClientContract
  rawCalls: RawCall[]
  transactionCalls: number
  commits: number
  rollbacks: number
}

function makeFakeDatabase(): FakeDatabase {
  const rawCalls: RawCall[] = []
  let transactionCalls = 0
  let commits = 0
  let rollbacks = 0

  const transaction = {
    rawQuery(sql: string, bindings?: unknown[]) {
      rawCalls.push([sql, bindings])
      return Promise.resolve({})
    },
    async commit() {
      commits += 1
    },
    async rollback() {
      rollbacks += 1
    },
  } as unknown as TransactionClientContract

  const client: TenantDatabaseClient = {
    async transaction<T>(callback: (trx: TransactionClientContract) => Promise<T>): Promise<T> {
      transactionCalls += 1

      try {
        const result = await callback(transaction)
        await transaction.commit()
        return result
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    },
  }

  return {
    client,
    transaction,
    rawCalls,
    get transactionCalls() {
      return transactionCalls
    },
    get commits() {
      return commits
    },
    get rollbacks() {
      return rollbacks
    },
  }
}

test.group('TenantDatabaseExecutor', () => {
  test('fails before creating a transaction when no tenant context is active', async ({
    assert,
  }) => {
    const database = makeFakeDatabase()
    const executor = new TenantDatabaseExecutor(database.client)

    await assert.rejects(() => executor.run(async () => 'unreachable'), TenantNotResolvedError)

    assert.equal(database.transactionCalls, 0)
  })

  test('binds the active tenant ID and passes the transaction and tenant to the callback', async ({
    assert,
  }) => {
    const database = makeFakeDatabase()
    const executor = new TenantDatabaseExecutor(database.client)
    const tenant = { id: "tenant-'quoted", name: 'Quoted Tenant', slug: 'quoted-tenant' }
    let callbackTenant: TenantContext | undefined
    let callbackTransaction: TransactionClientContract | undefined

    await runWithTenant(tenant, async () => {
      await executor.run((receivedTenant, receivedTransaction) => {
        callbackTenant = receivedTenant
        callbackTransaction = receivedTransaction
      })
    })

    assert.deepEqual(database.rawCalls, [
      ["SELECT set_config('app.tenant_id', ?, true)", [String(tenant.id)]],
    ])
    assert.equal(database.transactionCalls, 1)
    assert.strictEqual(callbackTenant, tenant)
    assert.strictEqual(callbackTransaction, database.transaction)
  })

  test('propagates callback return values through the transaction', async ({ assert }) => {
    const database = makeFakeDatabase()
    const executor = new TenantDatabaseExecutor(database.client)
    const result = { created: 1 }

    const actual = await runWithTenant(
      { id: 'tenant-result', name: 'Result Tenant', slug: 'result-tenant' },
      () => executor.run(async () => result)
    )

    assert.strictEqual(actual, result)
    assert.equal(database.commits, 1)
  })

  test('propagates callback errors to the transaction for rollback', async ({ assert }) => {
    const database = makeFakeDatabase()
    const executor = new TenantDatabaseExecutor(database.client)
    const expected = new Error('write failed')
    let thrown: unknown

    try {
      await runWithTenant({ id: 'tenant-error', name: 'Error Tenant', slug: 'error-tenant' }, () =>
        executor.run(async () => {
          throw expected
        })
      )
    } catch (error) {
      thrown = error
    }

    assert.strictEqual(thrown, expected)
    assert.equal(database.rollbacks, 1)
    assert.equal(database.commits, 0)
  })
})
