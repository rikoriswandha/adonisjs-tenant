import { test } from '@japa/runner'
import { RuntimeException } from '@adonisjs/core/exceptions'
import { Database } from '@adonisjs/lucid/database'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { TenantUserProvider } from '../src/user_providers/tenant_user_provider.js'

test.group('TenantUserProvider', () => {
  test('preserves hydrated user fields while enforcing tenant membership', async ({ assert }) => {
    class User extends BaseModel {
      static table = 'users'
      static primaryKey = 'uuid'

      @column({ isPrimary: true, columnName: 'user_uuid' })
      declare uuid: string

      @column()
      declare email: string
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
      { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} } as never,
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
        table.string('email').notNullable()
      })
      await connection.schema.createTable('organisation_members', (table) => {
        table.string('tenant_id').notNullable()
        table.string('user_id').notNullable()
        table.string('user_uuid').notNullable()
        table.string('email').notNullable()
      })
      await connection.table('users').multiInsert([
        { user_uuid: 'shared-user', email: 'shared@example.com' },
        { user_uuid: 'tenant-b-user', email: 'b@example.com' },
      ])
      await connection.table('organisation_members').multiInsert([
        {
          tenant_id: 'tenant-a',
          user_id: 'shared-user',
          user_uuid: 'pivot-shared-user',
          email: 'pivot-shared@example.com',
        },
        {
          tenant_id: 'tenant-b',
          user_id: 'shared-user',
          user_uuid: 'pivot-shared-user',
          email: 'pivot-shared@example.com',
        },
        {
          tenant_id: 'tenant-b',
          user_id: 'tenant-b-user',
          user_uuid: 'pivot-tenant-b-user',
          email: 'pivot-tenant-b@example.com',
        },
      ])
      User.useAdapter(database.modelAdapter())

      const provider = new TenantUserProvider(User, 'organisation_members')
      const tenantA = { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' }
      const tenantB = { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b' }

      const sharedInA = await provider.findById(tenantA, 'shared-user')
      const sharedInB = await provider.findById(tenantB, 'shared-user')
      const tenantBOnlyInA = await provider.findById(tenantA, 'tenant-b-user')

      assert.equal(sharedInA?.uuid, 'shared-user')
      assert.equal(sharedInB?.uuid, 'shared-user')
      assert.equal(sharedInA?.email, 'shared@example.com')
      assert.isNull(tenantBOnlyInA)
      await assert.rejects(() => provider.getUserFor(tenantA, 'tenant-b-user'), RuntimeException)
    } finally {
      await database.manager.closeAll()
    }
  })
})
