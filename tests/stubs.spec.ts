import { AppFactory } from '@adonisjs/core/factories/app'
import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { migrationStubs, stubsRoot } from '../stubs/main.js'

test.group('Stubs', () => {
  test('tenant_user migration stub supports typed composite foreign keys', async ({ assert }) => {
    const content = readFileSync(migrationStubs.tenantUser, 'utf-8')

    assert.isTrue(content.includes("import { BaseSchema } from '@adonisjs/lucid/schema'"))
    assert.isTrue(content.includes("protected tableName = 'tenant_user'"))
    assert.isTrue(content.includes('this.schema.createTable(this.tableName, (table) =>'))
    assert.isTrue(content.includes('table.{{ tenantIdColumn }}'))
    assert.isTrue(content.includes('table.{{ userIdColumn }}'))
    assert.isTrue(content.includes(".references('id')"))
    assert.isTrue(content.includes(".inTable('tenants')"))
    assert.isTrue(content.includes(".inTable('users')"))
    assert.isTrue(content.includes("table.primary(['tenant_id', 'user_id'])"))
    assert.isFalse(content.includes("table.increments('id').primary()"))
    assert.isFalse(content.includes("table.unique(['tenant_id', 'user_id'])"))
    assert.isTrue(content.includes("table.string('role').nullable()"))
    assert.isFalse(content.includes("table.index(['tenant_id'])"))
    assert.isTrue(content.includes("table.index(['user_id'])"))
    assert.isTrue(content.includes('onDelete'))

    const app = new AppFactory().create(new URL('./', import.meta.url))
    await app.init()

    try {
      const stubs = await app.stubs.create()
      const built = await stubs.build('migrations/tenant_user.stub', { source: stubsRoot })
      const uuid = await built.prepare({
        migration: {
          folder: 'database/migrations',
          fileName: 'create_tenant_user_table.ts',
        },
        tenantIdColumn: "uuid('tenant_id')",
        userIdColumn: "uuid('user_id')",
      })
      const integer = await built.prepare({
        migration: {
          folder: 'database/migrations',
          fileName: 'create_tenant_user_table.ts',
        },
        tenantIdColumn: "integer('tenant_id').unsigned()",
        userIdColumn: "integer('user_id').unsigned()",
      })

      assert.include(uuid.contents, "table.uuid('tenant_id')")
      assert.include(uuid.contents, "table.uuid('user_id')")
      assert.include(integer.contents, "table.integer('tenant_id').unsigned()")
      assert.include(integer.contents, "table.integer('user_id').unsigned()")
    } finally {
      await app.terminate()
    }

    assert.isTrue(content.includes('async up()'))
    assert.isTrue(content.includes('async down()'))
    assert.isTrue(content.includes('this.schema.dropTable(this.tableName)'))
  })

  test('add_tenant_id_to_access_tokens migration stub exists and contains valid migration syntax', ({
    assert,
  }) => {
    const content = readFileSync(migrationStubs.addTenantIdToAccessTokens, 'utf-8')

    assert.isTrue(content.includes("import { BaseSchema } from '@adonisjs/lucid/schema'"))
    assert.isTrue(content.includes("protected tableName = 'auth_access_tokens'"))
    assert.isTrue(content.includes('this.schema.alterTable(this.tableName, (table) =>'))
    assert.isTrue(content.includes("table.string('tenant_id').nullable().index()"))
    assert.isFalse(content.includes("table.string('tenant_id').notNullable().index()"))
    assert.isTrue(content.includes('Backfill them deliberately before'))
    assert.isTrue(content.includes('separate NOT NULL constraint migration'))

    assert.isTrue(content.includes('async up()'))
    assert.isTrue(content.includes('async down()'))
    assert.isTrue(content.includes('this.schema.alterTable(this.tableName, (table) =>'))
    assert.isTrue(content.includes("table.dropColumn('tenant_id')"))
  })
})
