import { test } from '@japa/runner'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { Database } from '@adonisjs/lucid/database'
import { Secret } from '@adonisjs/core/helpers'
import type { Hash } from '@adonisjs/core/hash'
import {
  withTenantAuthFinder,
  type TenantAuthFinderOptions,
} from '../../src/mixins/tenant_auth_finder.js'
import {
  getTenantContext,
  runWithTenant,
  TenantNotResolvedError,
} from '../../src/tenant_context.js'

const unusedHash = (() => {
  throw new Error('Hash is not used in mixin composition tests')
}) as () => Hash

test.group('withTenantAuthFinder', () => {
  test('mixin composes TenantScope and withAuthFinder', async ({ assert }) => {
    const hash = unusedHash

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string

      @column()
      declare tenantId: string
    }

    assert.isFunction(User.findForAuth)
    assert.isFunction(User.verifyCredentials)
    assert.isDefined(User.accessTokens)
  })

  test('preserves TenantScope inference only for statically direct options', ({ assert }) => {
    const directOptions = { uids: ['email'] } satisfies TenantAuthFinderOptions
    const membershipOptions = {
      membership: { pivotTable: 'tenant_user' },
    } satisfies TenantAuthFinderOptions
    const broadlyTypedDirectOptions: TenantAuthFinderOptions = { uids: ['email'] }
    const broadlyTypedMembershipOptions: TenantAuthFinderOptions = {
      membership: { pivotTable: 'tenant_user' },
    }

    class DirectUser extends withTenantAuthFinder(unusedHash, directOptions)(BaseModel) {}
    class MembershipUser extends withTenantAuthFinder(unusedHash, membershipOptions)(BaseModel) {}
    class BroadDirectUser extends withTenantAuthFinder(
      unusedHash,
      broadlyTypedDirectOptions
    )(BaseModel) {}
    class BroadMembershipUser extends withTenantAuthFinder(
      unusedHash,
      broadlyTypedMembershipOptions
    )(BaseModel) {}

    assert.isFunction(DirectUser.forTenant)
    // @ts-expect-error Membership users cannot use direct tenant scoping.
    void MembershipUser.forTenant
    // @ts-expect-error Runtime-optional membership cannot safely promise direct tenant scoping.
    void BroadDirectUser.forTenant
    // @ts-expect-error Runtime-optional membership cannot safely promise direct tenant scoping.
    void BroadMembershipUser.forTenant
  })

  test('findForAuth scopes to tenant when context is active', async ({ assert }) => {
    const hash = unusedHash

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string
    }

    await runWithTenant({ id: 't1', name: 'T1', slug: 't1' }, async () => {
      const ctx = getTenantContext()
      assert.equal(ctx?.id, 't1')
      assert.isFunction(User.findForAuth)
    })
  })

  test('findForAuth selects the matching tenant row for a shared UID', async ({ assert }) => {
    class User extends withTenantAuthFinder(unusedHash)(BaseModel) {
      static table = 'users'

      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string

      @column()
      declare tenant_id: string
    }

    const database = new Database(
      {
        connection: 'sqlite',
        connections: {
          sqlite: {
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
          },
        },
      },
      {
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
        fatal() {},
      } as never,
      {
        hasListeners() {
          return false
        },
        emit() {},
      } as never
    )

    try {
      const connection = database.connection()
      await connection.schema.createTable('users', (table) => {
        table.increments('id')
        table.string('email').notNullable()
        table.string('password').notNullable()
        table.string('tenant_id').notNullable()
      })
      await connection.table('users').multiInsert([
        { email: 'shared@example.com', password: 'hash-a', tenant_id: 'tenant-a' },
        { email: 'shared@example.com', password: 'hash-b', tenant_id: 'tenant-b' },
      ])
      User.useAdapter(database.modelAdapter())

      const userInTenantA = (await runWithTenant(
        { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
        () => User.findForAuth(['email'], 'shared@example.com')
      )) as InstanceType<typeof User> | null
      const userInTenantB = (await runWithTenant(
        { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b' },
        () => User.findForAuth(['email'], 'shared@example.com')
      )) as InstanceType<typeof User> | null
      const directlyQueriedInTenantA = await runWithTenant(
        { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
        () => User.query().where('email', 'shared@example.com').first()
      )

      assert.equal(userInTenantA?.tenant_id, 'tenant-a')
      assert.equal(userInTenantB?.tenant_id, 'tenant-b')
      assert.notEqual(userInTenantA?.id, userInTenantB?.id)
      assert.equal(directlyQueriedInTenantA?.tenant_id, 'tenant-a')
    } finally {
      await database.manager.closeAll()
    }
  })

  test('findForAuth authenticates global users through custom memberships without applying TenantScope', async ({
    assert,
  }) => {
    class User extends withTenantAuthFinder(unusedHash, {
      membership: {
        pivotTable: 'organisation_members',
        userForeignKey: 'principal_key',
        tenantForeignKey: 'organisation_key',
      },
    })(BaseModel) {
      static table = 'users'
      static primaryKey = 'uuid'

      @column({ isPrimary: true, columnName: 'user_uuid' })
      declare uuid: string

      @column({ columnName: 'login_email' })
      declare email: string

      @column()
      declare password: string
    }

    const database = new Database(
      {
        connection: 'sqlite',
        connections: {
          sqlite: {
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
          },
        },
      },
      {
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
        fatal() {},
      } as never,
      {
        hasListeners() {
          return false
        },
        emit() {},
      } as never
    )

    try {
      const connection = database.connection()
      await connection.schema.createTable('users', (table) => {
        table.string('user_uuid').primary()
        table.string('login_email').notNullable()
        table.string('password').notNullable()
      })
      await connection.schema.createTable('organisation_members', (table) => {
        table.increments('id')
        table.string('principal_key').notNullable()
        table.string('organisation_key').notNullable()
        table.string('login_email').notNullable()
      })
      await connection.table('users').insert({
        user_uuid: 'global-user',
        login_email: 'member@example.com',
        password: 'user-password',
      })
      await connection.table('organisation_members').multiInsert([
        {
          principal_key: 'global-user',
          organisation_key: 'tenant-a',
          login_email: 'pivot-a@example.com',
        },
        {
          principal_key: 'global-user',
          organisation_key: 'tenant-b',
          login_email: 'pivot-b@example.com',
        },
      ])
      User.useAdapter(database.modelAdapter())
      const globallyQueriedInTenantA = await runWithTenant(
        { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
        () => User.query().where('login_email', 'member@example.com').first()
      )

      const userInTenantA = (await runWithTenant(
        { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
        () => User.findForAuth(['email'], 'member@example.com')
      )) as InstanceType<typeof User> | null
      const userInTenantB = (await runWithTenant(
        { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b' },
        () => User.findForAuth(['email'], 'member@example.com')
      )) as InstanceType<typeof User> | null
      const userInTenantC = (await runWithTenant(
        { id: 'tenant-c', name: 'Tenant C', slug: 'tenant-c' },
        () => User.findForAuth(['email'], 'member@example.com')
      )) as InstanceType<typeof User> | null

      assert.equal(userInTenantA?.uuid, 'global-user')
      assert.equal(userInTenantB?.uuid, 'global-user')
      assert.equal(userInTenantA?.email, 'member@example.com')
      assert.equal(userInTenantB?.email, 'member@example.com')
      assert.equal(globallyQueriedInTenantA?.uuid, 'global-user')
      assert.isNull(userInTenantC)
    } finally {
      await database.manager.closeAll()
    }
  })

  test('findForAuth works without tenant context', async ({ assert }) => {
    const hash = unusedHash

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare email: string

      @column()
      declare password: string
    }

    assert.isFunction(User.findForAuth)
  })

  test('access tokens are bound to their creating tenant', async ({ assert }) => {
    const hash = unusedHash

    class User extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number
    }

    const logger = {
      trace() {},
      debug() {},
      info() {},
      warn() {},
      error() {},
      fatal() {},
    }
    const emitter = {
      hasListeners() {
        return false
      },
      emit() {},
    }
    const database = new Database(
      {
        connection: 'sqlite',
        connections: {
          sqlite: {
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
          },
        },
      },
      logger as never,
      emitter as never
    )

    try {
      const connection = database.connection()
      await connection.schema.createTable('auth_access_tokens', (table) => {
        table.increments('id')
        table.integer('tokenable_id').notNullable()
        table.string('type').notNullable()
        table.string('name').nullable()
        table.string('hash').notNullable()
        table.text('abilities').notNullable()
        table.string('tenant_id').notNullable().index()
        table.timestamp('created_at').notNullable()
        table.timestamp('updated_at').notNullable()
        table.timestamp('last_used_at').nullable()
        table.timestamp('expires_at').nullable()
      })
      User.useAdapter(database.modelAdapter())

      const user = new User()
      user.id = 1
      const tenantA = { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' }
      const tenantB = { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b' }
      const token = await runWithTenant(tenantA, () => User.accessTokens.create(user))

      const tokenRow = await connection
        .query()
        .from('auth_access_tokens')
        .where('id', token.identifier.toString())
        .first()
      assert.equal(tokenRow.tenant_id, tenantA.id)

      const tokenValue = new Secret(token.value!.release())
      const verifiedForTenantA = await runWithTenant(tenantA, () =>
        User.accessTokens.verifyForCurrentTenant(tokenValue)
      )
      assert.isNotNull(verifiedForTenantA)

      const verifiedForTenantB = await runWithTenant(tenantB, () =>
        User.accessTokens.verifyForCurrentTenant(tokenValue)
      )
      assert.isNull(verifiedForTenantB)
      await assert.rejects(() => User.accessTokens.create(user), TenantNotResolvedError)
    } finally {
      await database.manager.closeAll()
    }
  })

  test('accessTokens getter returns different instances for different models', async ({
    assert,
  }) => {
    const hash = () => ({ make: async (v: string) => v, verify: async () => true }) as any

    class User1 extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number
    }

    class User2 extends withTenantAuthFinder(hash)(BaseModel) {
      @column({ isPrimary: true })
      declare id: number
    }

    const tokens1 = User1.accessTokens
    const tokens2 = User2.accessTokens

    assert.isDefined(tokens1)
    assert.isDefined(tokens2)
    // Each model should get its own provider instance
    assert.notEqual(tokens1, tokens2)
  })
})
