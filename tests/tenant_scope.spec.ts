import { test } from '@japa/runner'
import { column } from '@adonisjs/lucid/orm'
import { BaseModel } from '@adonisjs/lucid/orm'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type {
  AdapterContract,
  LucidModel,
  LucidRow,
  ModelAdapterOptions,
  ModelQueryBuilderContract,
} from '@adonisjs/lucid/types/model'
import { TenantScope } from '../src/mixins/tenant_scope.js'
import { getTenantContext, runWithTenant } from '../src/tenant_context.js'

class PostModel extends TenantScope(BaseModel) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
}

class PostA extends TenantScope(BaseModel) {
  @column({ isPrimary: true })
  declare id: number
}

class PostB extends TenantScope(BaseModel) {
  @column({ isPrimary: true })
  declare id: number
}

type WhereEntry = [string, unknown]
type FakeUpdate = ((values: Record<string, unknown>) => Promise<number[]>) & {
  merge(values: Record<string, unknown>): Promise<number[]>
  raw(value: string): Promise<number[]>
}
type FakeQuery = {
  sideloaded: Record<string, unknown>
  wheres: WhereEntry[]
  updateCalls: number
  where(key: string, value: unknown): FakeQuery
  sideload(values: Record<string, unknown>, merge?: boolean): FakeQuery
  update: FakeUpdate
  delete(): Promise<number>
  del(): Promise<number>
  increment(column: string, value: number): Promise<number>
  decrement(column: string, value: number): Promise<number>
  clone(): FakeQuery
  exec(): unknown[]
}

function fakeUpdate(): FakeUpdate {
  const update = function (this: FakeQuery, _values: Record<string, unknown>) {
    this.updateCalls += 1
    return Promise.resolve([1])
  } as FakeUpdate
  update.merge = function (this: FakeQuery, _values: Record<string, unknown>) {
    this.updateCalls += 1
    return Promise.resolve([1])
  }
  update.raw = function (this: FakeQuery, _value: string) {
    this.updateCalls += 1
    return Promise.resolve([1])
  }
  return update
}

function makeFakeQuery(skipScope = false): FakeQuery {
  const sideloaded = skipScope ? { $adonisjs_tenant_skipScope: true } : {}

  return {
    sideloaded,
    wheres: [] as WhereEntry[],
    updateCalls: 0,
    where(key: string, value: unknown) {
      this.wheres.push([key, value])
      return this
    },
    sideload(values: Record<string, unknown>, merge = false) {
      this.sideloaded = merge ? { ...this.sideloaded, ...values } : values
      return this
    },
    exec() {
      return []
    },
    update: fakeUpdate(),
    delete: () => Promise.resolve(1),
    del: () => Promise.resolve(1),
    increment: (_column: string, _value: number) => Promise.resolve(1),
    decrement: (_column: string, _value: number) => Promise.resolve(1),
    clone() {
      const cloned = makeFakeQuery()
      cloned.sideloaded = { ...this.sideloaded }
      cloned.wheres = [...this.wheres]
      cloned.updateCalls = this.updateCalls
      return cloned
    },
  }
}

function useFakeAdapter(optionsSeen?: ModelAdapterOptions[]) {
  const queries: FakeQuery[] = []
  const adapter: AdapterContract = {
    modelClient() {
      throw new Error('modelClient should not be used')
    },
    modelConstructorClient() {
      throw new Error('modelConstructorClient should not be used')
    },
    async delete() {},
    async refresh() {},
    async insert() {},
    async update() {},
    query(_modelConstructor: LucidModel, options?: ModelAdapterOptions) {
      if (optionsSeen) {
        optionsSeen.push(options ?? {})
      }
      const query = makeFakeQuery()
      queries.push(query)
      return query as unknown as ModelQueryBuilderContract<LucidModel, LucidRow>
    },
  }

  PostModel.useAdapter(adapter)
  return queries
}

test.group('TenantScope', () => {
  test('mixin registers tenant_id column', ({ assert }) => {
    PostModel.boot()
    assert.isTrue(PostModel.$hasColumn('tenant_id'))
  })

  test('mixin adds withoutTenantScope static method', ({ assert }) => {
    assert.property(PostModel, 'withoutTenantScope')
    assert.isFunction(PostModel.withoutTenantScope)
  })

  test('mixin adds forTenant static method', ({ assert }) => {
    assert.property(PostModel, 'forTenant')
    assert.isFunction(PostModel.forTenant)
  })

  test('find hook applies tenant scope via hook runner', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery()

    await runWithTenant(
      { id: 'ctx-tenant-1', name: 'Test Tenant', slug: 'test-tenant' },
      async () => {
        await PostModel.$hooks.runner('before:find').run(query)
      }
    )

    assert.deepEqual(query.wheres, [['tenant_id', 'ctx-tenant-1']])
  })

  test('find hook skips tenant scope with skip flag', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery(true)

    await runWithTenant(
      { id: 'ctx-tenant-1', name: 'Test Tenant', slug: 'test-tenant' },
      async () => {
        await PostModel.$hooks.runner('before:find').run(query)
      }
    )

    assert.isEmpty(query.wheres)
  })

  test('fetch hook applies tenant scope via hook runner', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery()

    await runWithTenant({ id: 'tenant-abc', name: 'Test', slug: 'test' }, async () => {
      await PostModel.$hooks.runner('before:fetch').run(query)
    })

    assert.deepEqual(query.wheres, [['tenant_id', 'tenant-abc']])
  })

  test('no scope applied when no tenant context', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery()

    const ctx = getTenantContext()
    assert.isUndefined(ctx)

    await PostModel.$hooks.runner('before:find').run(query)

    assert.isEmpty(query.wheres)
  })

  test('multiple models can use the mixin independently', ({ assert }) => {
    PostA.boot()
    PostB.boot()

    assert.isTrue(PostA.$hasColumn('tenant_id'))
    assert.isTrue(PostB.$hasColumn('tenant_id'))
    assert.isFunction(PostA.withoutTenantScope)
    assert.isFunction(PostB.withoutTenantScope)
    assert.isFunction(PostA.forTenant)
    assert.isFunction(PostB.forTenant)
  })

  test('paginate hook scopes both query and countQuery', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery()
    const countQuery = makeFakeQuery()

    await runWithTenant({ id: 'tenant-p', name: 'Paginate', slug: 'paginate' }, async () => {
      await PostModel.$hooks.runner('before:paginate').run([countQuery, query])
    })

    assert.deepEqual(query.wheres, [['tenant_id', 'tenant-p']])
    assert.deepEqual(countQuery.wheres, [['tenant_id', 'tenant-p']])
  })

  test('paginate hook skips scope with skip flag', async ({ assert }) => {
    PostModel.boot()
    const query = makeFakeQuery(true)
    const countQuery = makeFakeQuery(true)

    await runWithTenant({ id: 'tenant-p', name: 'Paginate', slug: 'paginate' }, async () => {
      await PostModel.$hooks.runner('before:paginate').run([countQuery, query])
    })

    assert.isEmpty(query.wheres)
    assert.isEmpty(countQuery.wheres)
  })

  test('query forwards adapter options and scopes update mutations', async ({ assert }) => {
    const seenOptions: ModelAdapterOptions[] = []
    const queries = useFakeAdapter(seenOptions)
    const options = { connection: 'tenant-db' }

    await runWithTenant({ id: 'tenant-u', name: 'Update', slug: 'update' }, async () => {
      await PostModel.query(options).update({ title: 'scoped' })
    })

    assert.strictEqual(seenOptions[0], options)
    assert.deepEqual(queries[0].wheres, [['tenant_id', 'tenant-u']])
    assert.equal(queries[0].updateCalls, 1)
  })

  test('query proxy scopes delete, del, increment, decrement, update.merge, and update.raw', async ({
    assert,
  }) => {
    const queries = useFakeAdapter()

    await runWithTenant({ id: 'tenant-m', name: 'Mutate', slug: 'mutate' }, async () => {
      await PostModel.query().delete()
      await PostModel.query().del()
      await PostModel.query().increment('views', 1)
      await PostModel.query().decrement('stock', 1)
      await (PostModel.query().update as unknown as FakeUpdate).merge({ title: 'merged' })
      await (PostModel.query().update as unknown as FakeUpdate).raw('title = title')
    })

    assert.deepEqual(
      queries.map((query) => query.wheres),
      [
        [['tenant_id', 'tenant-m']],
        [['tenant_id', 'tenant-m']],
        [['tenant_id', 'tenant-m']],
        [['tenant_id', 'tenant-m']],
        [['tenant_id', 'tenant-m']],
        [['tenant_id', 'tenant-m']],
      ]
    )
    assert.equal(queries[4].updateCalls, 1)
    assert.equal(queries[5].updateCalls, 1)
  })

  test('query proxy keeps mutation scope after clone', async ({ assert }) => {
    useFakeAdapter()

    await runWithTenant({ id: 'tenant-c', name: 'Clone', slug: 'clone' }, async () => {
      const cloned = PostModel.query().clone() as unknown as FakeQuery
      await cloned.delete()
      assert.deepEqual(cloned.wheres, [['tenant_id', 'tenant-c']])
    })
  })

  test('withoutTenantScope bypasses mutation scoping', async ({ assert }) => {
    useFakeAdapter()

    await runWithTenant({ id: 'tenant-bypass', name: 'Bypass', slug: 'bypass' }, async () => {
      const query = PostModel.withoutTenantScope() as unknown as FakeQuery
      await query.update({ title: 'unscoped' })
      assert.isTrue(query.sideloaded.$adonisjs_tenant_skipScope)
      assert.isEmpty(query.wheres)
    })
  })

  test('forTenant uses explicit tenant and bypasses current context hook', async ({ assert }) => {
    useFakeAdapter()

    await runWithTenant({ id: 'tenant-current', name: 'Current', slug: 'current' }, async () => {
      const query = PostModel.forTenant('tenant-target') as unknown as FakeQuery
      await query.delete()
      assert.isTrue(query.sideloaded.$adonisjs_tenant_skipScope)
      assert.deepEqual(query.wheres, [['tenant_id', 'tenant-target']])
    })
  })

  test('save hook sets missing tenant_id from context', async ({ assert }) => {
    PostModel.boot()
    const instance = new PostModel()
    instance.title = 'Autofill Tenant'

    await runWithTenant({ id: 'tenant-auto', name: 'Auto', slug: 'auto' }, async () => {
      await PostModel.$hooks.runner('before:save').run(instance)
    })

    assert.equal(instance.tenant_id, 'tenant-auto')
  })

  test('save hook rejects cross-tenant write when tenant_id differs', async ({ assert }) => {
    PostModel.boot()
    const instance = new PostModel()
    instance.title = 'Cross Tenant'
    instance.tenant_id = 'tenant-x'

    let thrown: unknown
    try {
      await runWithTenant({ id: 'tenant-y', name: 'Other', slug: 'other' }, async () => {
        await PostModel.$hooks.runner('before:save').run(instance)
      })
    } catch (error) {
      thrown = error
    }

    assert.instanceOf(thrown, RuntimeException)
    assert.equal((thrown as RuntimeException).code, 'E_CROSS_TENANT_WRITE')
  })

  test('save hook allows matching tenant_id across string and number IDs', async ({ assert }) => {
    PostModel.boot()
    const instance = new PostModel()
    instance.title = 'Normalized Tenant'
    instance.tenant_id = 1

    await runWithTenant({ id: '1', name: 'One', slug: 'one' }, async () => {
      await PostModel.$hooks.runner('before:save').run(instance)
    })

    assert.equal(instance.tenant_id, 1)
  })

  test('save hook allows explicit bypass through instance API', async ({ assert }) => {
    PostModel.boot()
    const instance = new PostModel()
    instance.title = 'Bypass Tenant'
    instance.tenant_id = 'tenant-a'
    instance.bypassTenantWriteCheck()

    await runWithTenant({ id: 'tenant-b', name: 'Other Tenant', slug: 'other' }, async () => {
      await PostModel.$hooks.runner('before:save').run(instance)
    })

    assert.equal(instance.tenant_id, 'tenant-a')
  })
})
