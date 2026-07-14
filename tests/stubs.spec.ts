import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { migrationStubs } from '../stubs/main.js'

test.group('Stubs', () => {
  test('tenant_user migration stub exists and contains valid migration syntax', ({ assert }) => {
    const content = readFileSync(migrationStubs.tenantUser, 'utf-8')

    assert.isTrue(content.includes("import { BaseSchema } from '@adonisjs/lucid/schema'"))
    assert.isTrue(content.includes("protected tableName = 'tenant_user'"))
    assert.isTrue(content.includes('this.schema.createTable(this.tableName, (table) =>'))
    assert.isTrue(content.includes("table.increments('id').primary()"))
    assert.isTrue(content.includes(".integer('tenant_id')"))
    assert.isTrue(content.includes(".integer('user_id')"))
    assert.isTrue(content.includes("table.string('role').nullable()"))
    assert.isTrue(content.includes("table.unique(['tenant_id', 'user_id'])"))
    assert.isTrue(content.includes("table.index(['tenant_id'])"))
    assert.isTrue(content.includes("table.index(['user_id'])"))
    assert.isTrue(content.includes('references'))
    assert.isTrue(content.includes('onDelete'))

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
    assert.isTrue(content.includes("table.string('tenant_id').notNullable().index()"))

    assert.isTrue(content.includes('async up()'))
    assert.isTrue(content.includes('async down()'))
    assert.isTrue(content.includes('this.schema.alterTable(this.tableName, (table) =>'))
    assert.isTrue(content.includes("table.dropColumn('tenant_id')"))
  })
})
