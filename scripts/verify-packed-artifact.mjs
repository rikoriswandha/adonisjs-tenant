import { execFileSync } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const tempRoot = await mkdtemp(join(tmpdir(), 'adonisjs-tenant-consumer-'))
let tarball

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

try {
  const packOutput = execFileSync('npm', ['pack', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
  const [{ filename }] = JSON.parse(packOutput)
  tarball = join(projectRoot, filename)

  await writeFile(
    join(tempRoot, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          'adonisjs-tenant': `file:${tarball}`,
        },
        devDependencies: {
          '@adonisjs/assembler': '^8.0.0',
          '@adonisjs/auth': '^10.0.0',
          '@adonisjs/core': '^7.0.0',
          '@adonisjs/lucid': '^22.0.0',
          '@types/luxon': '^3.0.0',
          '@types/json-schema': '^7.0.0',
          '@types/node': '^25.0.0',
          '@types/picomatch': '^4.0.0',
          '@types/yargs-parser': '^21.0.0',
          '@vinejs/vine': '^4.0.0',
          'json-schema': '^0.4.0',
          luxon: '^3.0.0',
          sqlite3: '^6.0.1',
          typescript: '^5.9.3',
        },
      },
      null,
      2
    )
  )
  await writeFile(
    join(tempRoot, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
        },
      },
      null,
      2
    )
  )
  await writeFile(
    join(tempRoot, 'index.ts'),
    `import TenantMiddleware from 'adonisjs-tenant/middleware'
import TenancyProvider from 'adonisjs-tenant/providers/tenancy_provider'
import { TenantScope, withTenantAuthFinder } from 'adonisjs-tenant/mixins'

void TenantMiddleware
void TenancyProvider
void TenantScope
void withTenantAuthFinder
`
  )
  await writeFile(
    join(tempRoot, 'verify.mjs'),
    `import TenantMiddleware from 'adonisjs-tenant/middleware'
import TenancyProvider from 'adonisjs-tenant/providers/tenancy_provider'
import { HeaderResolver } from 'adonisjs-tenant/resolvers'
import { TenantScope, withTenantAuthFinder } from 'adonisjs-tenant/mixins'
import { BaseModel } from '@adonisjs/lucid/orm'
import { Database } from '@adonisjs/lucid/database'

if (
  typeof TenantMiddleware !== 'function' ||
  typeof TenancyProvider !== 'function' ||
  typeof TenantScope !== 'function' ||
  typeof withTenantAuthFinder !== 'function'
) {
  throw new Error('Published package exports are incomplete')
}

const resolver = new HeaderResolver({
  tenants: { acme: { id: 'tenant-acme', name: 'Acme' } },
})
const tenant = await resolver.resolve({
  request: { header: (name) => (name === 'X-Tenant-ID' ? 'acme' : undefined) },
})
if (!tenant || tenant.id !== 'tenant-acme') {
  throw new Error('Published header resolver did not resolve an allowlisted tenant')
}

const unresolved = await new HeaderResolver().resolve({
  request: { header: () => 'untrusted-tenant' },
})
if (unresolved !== null) {
  throw new Error('Published header resolver accepted an untrusted tenant header')
}

class TenantPost extends TenantScope(BaseModel) {
  static table = 'tenant_package_smoke_posts'
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
  logger,
  emitter
)

try {
  const connection = database.connection()
  await connection.schema.createTable(TenantPost.table, (table) => {
    table.increments('id')
    table.string('tenant_id').notNullable()
    table.string('title').notNullable()
  })
  await connection
    .insertQuery()
    .table(TenantPost.table)
    .multiInsert([
      { tenant_id: 'tenant-acme', title: 'Acme' },
      { tenant_id: 'tenant-beta', title: 'Beta' },
    ])
  TenantPost.useAdapter(database.modelAdapter())
  TenantPost.boot()

  TenantMiddleware.configure({ resolver })
  const context = {
    request: { header: (name) => (name === 'X-Tenant-ID' ? 'acme' : undefined) },
    response: {
      status() {
        return this
      },
      send() {},
    },
  }
  await new TenantMiddleware().handle(context, async () => {
    const posts = await TenantPost.all()
    if (posts.length !== 1) {
      throw new Error('Published tenant middleware did not isolate Lucid records')
    }
  })
  if (!context.tenant || context.tenant.id !== 'tenant-acme') {
    throw new Error('Published tenant middleware did not attach the resolved tenant')
  }
} finally {
  await database.manager.closeAll()
}
`
  )

  run('npm', ['install', '--no-package-lock'], tempRoot)
  const tsc = process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
  run(join(tempRoot, 'node_modules', '.bin', tsc), [], tempRoot)
  run(process.execPath, ['verify.mjs'], tempRoot)

  const appRoot = join(tempRoot, 'app')
  run(
    'npm',
    [
      'init',
      'adonisjs@latest',
      '--',
      appRoot,
      '--kit=api',
      '--pkg=npm',
      '--skip-migrations',
    ],
    tempRoot
  )
  run('npm', ['install', tarball], appRoot)
  run(process.execPath, ['ace', 'configure', 'adonisjs-tenant'], appRoot)
  await access(join(appRoot, 'config', 'tenancy.ts'))
  run(process.execPath, ['ace', 'list'], appRoot)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
  if (tarball) {
    await rm(tarball, { force: true })
  }
}
