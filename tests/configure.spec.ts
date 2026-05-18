import { test } from '@japa/runner'
import { readFileSync, existsSync } from 'node:fs'
import { stubsRoot } from '../stubs/main.js'
import { join } from 'node:path'

test.group('Configure hook', () => {
  test('configure is exported from index and is a function', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isDefined(mod.configure)
    assert.isFunction(mod.configure)
  })

  test('configure is exported from configure.ts and is a function', async ({ assert }) => {
    const mod = await import('../configure.ts')
    assert.isDefined(mod.configure)
    assert.isFunction(mod.configure)
  })
})

test.group('Configure stubs', () => {
  test('config stub file exists', ({ assert }) => {
    const stubPath = join(stubsRoot, 'config', 'tenancy.stub')
    assert.isTrue(existsSync(stubPath))
  })

  test('config stub contains valid defineTenancyConfig structure', ({ assert }) => {
    const stubPath = join(stubsRoot, 'config', 'tenancy.stub')
    const content = readFileSync(stubPath, 'utf-8')

    assert.isTrue(content.includes('defineTenancyConfig'))
    assert.isTrue(content.includes("default: 'subdomain'"))
    assert.isTrue(content.includes('subdomain'))
    assert.isTrue(content.includes('header'))
    assert.isTrue(content.includes('X-Tenant-ID'))
  })

  test('migration stubs referenced by configure exist', ({ assert }) => {
    const migrationsDir = join(stubsRoot, 'migrations')

    assert.isTrue(existsSync(join(migrationsDir, 'tenant_user.stub')))
    assert.isTrue(existsSync(join(migrationsDir, 'add_tenant_id_to_access_tokens.stub')))
  })

  test('migration stubs contain BaseSchema import', ({ assert }) => {
    const content = readFileSync(join(stubsRoot, 'migrations', 'tenant_user.stub'), 'utf-8')
    const content2 = readFileSync(
      join(stubsRoot, 'migrations', 'add_tenant_id_to_access_tokens.stub'),
      'utf-8'
    )

    assert.isTrue(content.includes("import { BaseSchema } from '@adonisjs/lucid/schema'"))
    assert.isTrue(content2.includes("import { BaseSchema } from '@adonisjs/lucid/schema'"))
  })

  test('all stubs have export directive', ({ assert }) => {
    const files = [
      'config/tenancy.stub',
      'migrations/tenant_user.stub',
      'migrations/add_tenant_id_to_access_tokens.stub',
    ]

    for (const file of files) {
      const content = readFileSync(join(stubsRoot, file), 'utf-8')
      assert.isTrue(content.includes('exports('), `${file} missing exports directive`)
    }
  })
})
