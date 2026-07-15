import { test } from '@japa/runner'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configure } from '../configure.ts'

type ConfigureCall = {
  providers: string[]
  middleware: Array<{ name: string; path: string }>
  stubs: string[]
  codemodsCreated: number
}

function makeConfigureCommand(appRoot: string): { command: unknown; calls: ConfigureCall } {
  const calls: ConfigureCall = {
    providers: [],
    middleware: [],
    stubs: [],
    codemodsCreated: 0,
  }

  return {
    command: {
      app: { appRoot: pathToFileURL(`${appRoot}/`) },
      logger: {
        info() {},
        success() {},
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
          async makeUsingStub(root: string, stub: string, _data: Record<string, unknown>) {
            calls.stubs.push(stub)

            if (stub === 'config/tenancy.stub') {
              const generatedConfig = readFileSync(join(root, stub), 'utf-8').replace(
                /^\{\{\{[\s\S]*?\}\}\}\n/,
                ''
              )
              writeFileSync(join(appRoot, 'config', 'tenancy.ts'), generatedConfig)
            }
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

  test('configures an Auth app without access tokens and generates scoped config', async ({
    assert,
  }) => {
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

      const generatedConfig = readFileSync(join(appRoot, 'config', 'tenancy.ts'), 'utf-8')
      assert.include(generatedConfig, "from '@rikology/adonisjs-tenant'")
      assert.include(generatedConfig, 'failOnMissing: true')
    } finally {
      rmSync(appRoot, { recursive: true, force: true })
    }
  })
})
