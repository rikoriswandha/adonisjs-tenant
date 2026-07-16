import { test } from '@japa/runner'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { configure } from '../configure.ts'

type MigrationStubData = {
  migration: {
    folder: string
    fileName: string
  }
  tenantIdColumn?: string
  userIdColumn?: string
}

type ConfigureCall = {
  providers: string[]
  middleware: Array<{ name: string; path: string }>
  stubs: string[]
  migrations: MigrationStubData[]
  logs: string[]
  prompts: string[]
  codemodsCreated: number
}

function isMigrationStubData(data: Record<string, unknown>): data is MigrationStubData {
  return (
    typeof data.migration === 'object' &&
    data.migration !== null &&
    'folder' in data.migration &&
    typeof data.migration.folder === 'string' &&
    'fileName' in data.migration &&
    typeof data.migration.fileName === 'string'
  )
}

function makeConfigureCommand(
  appRoot: string,
  identifierTypes: string[] = ['integer', 'integer']
): { command: unknown; calls: ConfigureCall } {
  const calls: ConfigureCall = {
    providers: [],
    middleware: [],
    stubs: [],
    migrations: [],
    logs: [],
    prompts: [],
    codemodsCreated: 0,
  }

  return {
    command: {
      app: { appRoot: pathToFileURL(`${appRoot}/`) },
      logger: {
        info(message: string) {
          calls.logs.push(message)
        },
        success() {},
      },
      prompt: {
        async choice(title: string) {
          calls.prompts.push(title)
          return identifierTypes.shift() ?? 'integer'
        },
      },
      async createCodemods() {
        calls.codemodsCreated += 1

        return {
          async updateRcFile(callback: (rcFile: { addProvider(provider: string): void }) => void) {
            callback({ addProvider: (provider) => calls.providers.push(provider) })
          },
          async registerMiddleware(
            _type: 'named',
            middleware: Array<{ name: string; path: string }>
          ) {
            calls.middleware.push(...middleware)
          },
          async makeUsingStub(root: string, stub: string, data: Record<string, unknown>) {
            calls.stubs.push(stub)

            if (stub === 'config/tenancy.stub') {
              const generatedConfig = readFileSync(join(root, stub), 'utf-8').replace(
                /^\{\{\{[\s\S]*?\}\}\}\n/,
                ''
              )
              writeFileSync(join(appRoot, 'config', 'tenancy.ts'), generatedConfig)
              return
            }

            if (!isMigrationStubData(data)) {
              throw new Error(`Expected migration data for ${stub}`)
            }

            calls.migrations.push(data)
            const destination = join(appRoot, data.migration.folder, data.migration.fileName)
            const contents = readFileSync(join(root, stub), 'utf-8')
              .replace(/^\{\{\{[\s\S]*?\}\}\}\n/, '')
              .replace('{{ tenantIdColumn }}', data.tenantIdColumn ?? '')
              .replace('{{ userIdColumn }}', data.userIdColumn ?? '')

            mkdirSync(dirname(destination), { recursive: true })
            writeFileSync(destination, contents)
          },
        }
      },
    },
    calls,
  }
}

function makeAppRoot(): string {
  const appRoot = mkdtempSync(join(tmpdir(), 'adonisjs-tenant-configure-'))
  mkdirSync(join(appRoot, 'config'), { recursive: true })
  return appRoot
}

test.group('Configure hook', () => {
  test('fails before codemods when Auth has not been configured', async ({ assert }) => {
    const appRoot = makeAppRoot()
    const { command, calls } = makeConfigureCommand(appRoot)

    try {
      await assert.rejects(
        () => configure(command as never),
        /Cannot configure @rikology\/adonisjs-tenant without @adonisjs\/auth/
      )

      assert.equal(calls.codemodsCreated, 0)
      assert.deepEqual(calls.providers, [])
      assert.deepEqual(calls.middleware, [])
      assert.deepEqual(calls.stubs, [])
    } finally {
      rmSync(appRoot, { recursive: true, force: true })
    }
  })

  test('renders integer tenant and user keys by default', async ({ assert }) => {
    const appRoot = makeAppRoot()
    writeFileSync(join(appRoot, 'config', 'auth.ts'), 'export default { guards: { web: {} } }\n')
    const { command, calls } = makeConfigureCommand(appRoot)

    try {
      await configure(command as never)

      assert.deepEqual(calls.providers, ['@rikology/adonisjs-tenant/providers/tenancy_provider'])
      assert.deepEqual(calls.middleware, [
        { name: 'tenant', path: '@rikology/adonisjs-tenant/middleware' },
      ])
      assert.deepEqual(calls.stubs, ['config/tenancy.stub', 'migrations/tenant_user.stub'])
      assert.deepEqual(calls.prompts, [
        'Select the tenant identifier type',
        'Select the user identifier type',
      ])

      const [migration] = calls.migrations
      assert.equal(migration.tenantIdColumn, "integer('tenant_id').unsigned()")
      assert.equal(migration.userIdColumn, "integer('user_id').unsigned()")

      const generatedMigration = readFileSync(
        join(appRoot, migration.migration.folder, migration.migration.fileName),
        'utf-8'
      )
      assert.include(generatedMigration, "table.integer('tenant_id').unsigned()")
      assert.include(generatedMigration, "table.integer('user_id').unsigned()")
      assert.include(generatedMigration, "table.primary(['tenant_id', 'user_id'])")
      assert.notInclude(generatedMigration, "table.increments('id').primary()")

      const generatedConfig = readFileSync(join(appRoot, 'config', 'tenancy.ts'), 'utf-8')
      assert.include(generatedConfig, "from '@rikology/adonisjs-tenant'")
      assert.include(generatedConfig, 'failOnMissing: true')
    } finally {
      rmSync(appRoot, { recursive: true, force: true })
    }
  })

  test('uses UUID environment overrides without prompting', async ({ assert }) => {
    const appRoot = makeAppRoot()
    const originalTenantIdType = process.env.ADONISJS_TENANT_TENANT_ID_TYPE
    const originalUserIdType = process.env.ADONISJS_TENANT_USER_ID_TYPE
    process.env.ADONISJS_TENANT_TENANT_ID_TYPE = 'uuid'
    process.env.ADONISJS_TENANT_USER_ID_TYPE = 'uuid'
    writeFileSync(
      join(appRoot, 'config', 'auth.ts'),
      'export default { guards: { accessTokens: {} } }\n'
    )
    const { command, calls } = makeConfigureCommand(appRoot)

    try {
      await configure(command as never)

      const [migration] = calls.migrations
      const generatedMigration = readFileSync(
        join(appRoot, migration.migration.folder, migration.migration.fileName),
        'utf-8'
      )
      assert.include(generatedMigration, "table.uuid('tenant_id')")
      assert.include(generatedMigration, "table.uuid('user_id')")
      assert.include(generatedMigration, ".references('id')")
      assert.include(generatedMigration, "table.primary(['tenant_id', 'user_id'])")
      assert.deepEqual(calls.prompts, [])
      assert.deepEqual(calls.stubs, [
        'config/tenancy.stub',
        'migrations/tenant_user.stub',
        'migrations/add_tenant_id_to_access_tokens.stub',
      ])
    } finally {
      if (originalTenantIdType === undefined) {
        delete process.env.ADONISJS_TENANT_TENANT_ID_TYPE
      } else {
        process.env.ADONISJS_TENANT_TENANT_ID_TYPE = originalTenantIdType
      }

      if (originalUserIdType === undefined) {
        delete process.env.ADONISJS_TENANT_USER_ID_TYPE
      } else {
        process.env.ADONISJS_TENANT_USER_ID_TYPE = originalUserIdType
      }

      rmSync(appRoot, { recursive: true, force: true })
    }
  })

  test('creates each package migration at most once across sequential configure calls', async ({
    assert,
  }) => {
    const appRoot = makeAppRoot()
    writeFileSync(
      join(appRoot, 'config', 'auth.ts'),
      'export default { guards: { accessTokens: {} } }\n'
    )
    const first = makeConfigureCommand(appRoot)
    const second = makeConfigureCommand(appRoot)

    try {
      await configure(first.command as never)
      await configure(second.command as never)

      assert.deepEqual(first.calls.stubs, [
        'config/tenancy.stub',
        'migrations/tenant_user.stub',
        'migrations/add_tenant_id_to_access_tokens.stub',
      ])
      assert.deepEqual(second.calls.stubs, ['config/tenancy.stub'])
      assert.deepEqual(second.calls.prompts, [])
      assert.include(
        second.calls.logs,
        'Skipped tenant_user migration because it has already been generated.'
      )
      assert.include(
        second.calls.logs,
        'Skipped access tokens migration because it has already been generated.'
      )
    } finally {
      rmSync(appRoot, { recursive: true, force: true })
    }
  })

  test('skips a pre-existing access tokens migration', async ({ assert }) => {
    const appRoot = makeAppRoot()
    const migrationsPath = join(appRoot, 'database', 'migrations')
    mkdirSync(migrationsPath, { recursive: true })
    writeFileSync(
      join(migrationsPath, '1710000000000_add_tenant_id_to_access_tokens_table.ts'),
      'export default {}'
    )
    writeFileSync(
      join(appRoot, 'config', 'auth.ts'),
      'export default { guards: { accessTokens: {} } }\n'
    )
    const { command, calls } = makeConfigureCommand(appRoot)

    try {
      await configure(command as never)

      assert.deepEqual(calls.stubs, ['config/tenancy.stub', 'migrations/tenant_user.stub'])
      assert.include(
        calls.logs,
        'Skipped access tokens migration because it has already been generated.'
      )
    } finally {
      rmSync(appRoot, { recursive: true, force: true })
    }
  })
})
