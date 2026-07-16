import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const tempRoot = await mkdtemp(join(tmpdir(), 'rikology-adonisjs-tenant-consumer-'))
let tarball

function run(command, args, cwd, env) {
  execFileSync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: 'inherit',
  })
}

async function assertFileIncludes(file, expected) {
  const content = await readFile(file, 'utf8')
  for (const text of expected) {
    if (!content.includes(text)) {
      throw new Error(`Expected ${file} to include ${JSON.stringify(text)}`)
    }
  }
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
          '@rikology/adonisjs-tenant': `file:${tarball}`,
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
          'luxon': '^3.0.0',
          'sqlite3': '^6.0.1',
          'typescript': '^5.9.3',
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
    `import type { Authenticator } from '@adonisjs/auth'
import type { GuardFactory } from '@adonisjs/auth/types'
import type { HttpContext } from '@adonisjs/core/http'
import type { TenantContext } from '@rikology/adonisjs-tenant'
import {
  TenantDatabaseExecutor,
  TenantMiddleware,
  TenantScope,
  TenantService,
  defineTenancyConfig,
  getTenantContext,
  getTenantContextOrFail,
  runWithTenant,
} from '@rikology/adonisjs-tenant'
import { TenantAuthenticator, extendAuthenticator } from '@rikology/adonisjs-tenant/extensions'
import { defineTenantAuthConfig, tenantGuards } from '@rikology/adonisjs-tenant/guards'
import { withTenantAuthFinder } from '@rikology/adonisjs-tenant/mixins'
import { HeaderResolver, JwtResolver, PathResolver, SubdomainResolver } from '@rikology/adonisjs-tenant/resolvers'
import { TenantUserProvider } from '@rikology/adonisjs-tenant/user_providers'

declare const ctx: HttpContext
declare const auth: Authenticator<Record<string, GuardFactory>>

type ProbeUser = { id: number; email: string }
declare const sessionConfig: Parameters<typeof tenantGuards.session<ProbeUser>>[0]
declare const tokenConfig: Parameters<typeof tenantGuards.accessTokens<ProbeUser>>[0]
declare const basicConfig: Parameters<typeof tenantGuards.basicAuth<ProbeUser>>[0]

const sessionGuardConfig = tenantGuards.session(sessionConfig)
const tokenGuardConfig = tenantGuards.accessTokens(tokenConfig)
const basicGuardConfig = tenantGuards.basicAuth(basicConfig)
const tenantAuthConfigProvider = defineTenantAuthConfig({
  default: 'web',
  guards: {
    web: sessionGuardConfig,
    api: tokenGuardConfig,
    basic: basicGuardConfig,
  },
})

const resolvedTenantAuthConfig = await tenantAuthConfigProvider.resolver({} as never)
const configuredSessionGuard = resolvedTenantAuthConfig.guards.web({} as HttpContext)
const configuredSessionUser: ProbeUser | undefined = configuredSessionGuard.user
const configuredSessionLogin: (user: ProbeUser, remember?: boolean) => Promise<void> =
  configuredSessionGuard.login

const sessionFactory = await sessionGuardConfig.resolver('web', {} as never)
const tokenFactory = await tokenGuardConfig.resolver('api', {} as never)
const basicFactory = await basicGuardConfig.resolver('basic', {} as never)

const sessionGuard = sessionFactory({} as HttpContext)
const tokenGuard = tokenFactory({} as HttpContext)
const basicGuard = basicFactory({} as HttpContext)

const sessionUser: ProbeUser | undefined = sessionGuard.user
const sessionLogin: (user: ProbeUser, remember?: boolean) => Promise<void> = sessionGuard.login
const sessionLogout: () => Promise<void> = sessionGuard.logout
const tokenUserId: number | undefined = tokenGuard.user?.id
const tokenCreate = tokenGuard.createToken
const tokenInvalidate: () => Promise<boolean> = tokenGuard.invalidateToken
const basicUser: ProbeUser | undefined = basicGuard.user

const contextTenant: TenantContext | undefined = ctx.tenant
const authenticatorTenant: TenantContext | undefined = auth.tenant
void sessionUser
void sessionLogin
void sessionLogout
void tokenUserId
void tokenCreate
void tokenInvalidate
void basicUser
void configuredSessionUser
void configuredSessionLogin

void contextTenant
void authenticatorTenant
void TenantDatabaseExecutor
void TenantMiddleware
void TenantScope
void TenantService
void getTenantContext
void getTenantContextOrFail
void runWithTenant
void TenantAuthenticator
void TenantUserProvider
void HeaderResolver
void JwtResolver
void PathResolver
void SubdomainResolver
void defineTenancyConfig
void defineTenantAuthConfig
void extendAuthenticator
void tenantGuards
void withTenantAuthFinder
`
  )
  await writeFile(
    join(tempRoot, 'verify.mjs'),
    `import TenantMiddleware from '@rikology/adonisjs-tenant/middleware'
import TenancyProvider from '@rikology/adonisjs-tenant/providers/tenancy_provider'
import { TenantDatabaseExecutor } from '@rikology/adonisjs-tenant/database'
import { HeaderResolver } from '@rikology/adonisjs-tenant/resolvers'
import { TenantScope, withTenantAuthFinder } from '@rikology/adonisjs-tenant/mixins'
import { BaseModel } from '@adonisjs/lucid/orm'
import { Database } from '@adonisjs/lucid/database'

if (
  typeof TenantMiddleware !== 'function' ||
  typeof TenancyProvider !== 'function' ||
  typeof TenantDatabaseExecutor !== 'function' ||
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
    ['init', 'adonisjs@latest', '--', appRoot, '--kit=api', '--pkg=npm', '--skip-migrations'],
    tempRoot
  )
  run('npm', ['install', tarball], appRoot)
  run(process.execPath, ['ace', 'configure', '@adonisjs/auth', '--guard=access_tokens'], appRoot)
  await writeFile(
    join(appRoot, 'config', 'auth.ts'),
    `import { tokensUserProvider } from '@adonisjs/auth/access_tokens'
import type { Authenticators, InferAuthenticators, InferAuthEvents } from '@adonisjs/auth/types'
import { defineTenantAuthConfig, tenantGuards } from '@rikology/adonisjs-tenant/guards'

const authConfig = defineTenantAuthConfig({
  default: 'api',
  guards: {
    api: tenantGuards.accessTokens({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
      tenantTokenProvider: {
        verifyForCurrentTenant: async () => null,
      },
    }),
  },
})

export default authConfig

declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}

declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
`
  )
  const tenancyConfigureEnv = {
    ADONISJS_TENANT_TENANT_ID_TYPE: 'uuid',
    ADONISJS_TENANT_USER_ID_TYPE: 'uuid',
  }
  run(
    process.execPath,
    ['ace', 'configure', '@rikology/adonisjs-tenant'],
    appRoot,
    tenancyConfigureEnv
  )
  run(
    process.execPath,
    ['ace', 'configure', '@rikology/adonisjs-tenant'],
    appRoot,
    tenancyConfigureEnv
  )
  await assertFileIncludes(join(appRoot, 'adonisrc.ts'), [
    '@rikology/adonisjs-tenant/providers/tenancy_provider',
  ])
  await assertFileIncludes(join(appRoot, 'start', 'kernel.ts'), [
    "tenant: () => import('@rikology/adonisjs-tenant/middleware')",
    '@rikology/adonisjs-tenant/middleware',
  ])
  await assertFileIncludes(join(appRoot, 'config', 'tenancy.ts'), [
    "from '@rikology/adonisjs-tenant'",
    'failOnMissing:',
    'default:',
    'tenants:',
  ])
  const migrationsPath = join(appRoot, 'database', 'migrations')
  const migrationFiles = await readdir(migrationsPath)
  const tenantUserMigrations = migrationFiles.filter((fileName) =>
    fileName.endsWith('_create_tenant_user_table.ts')
  )
  const accessTokenMigrations = migrationFiles.filter((fileName) =>
    fileName.endsWith('_add_tenant_id_to_access_tokens_table.ts')
  )
  if (tenantUserMigrations.length !== 1 || accessTokenMigrations.length !== 1) {
    throw new Error(
      'Expected repeated configure to retain exactly one package migration of each kind'
    )
  }
  const [tenantUserMigration] = tenantUserMigrations
  await assertFileIncludes(join(migrationsPath, tenantUserMigration), [
    "table.uuid('tenant_id')",
    "table.uuid('user_id')",
  ])
  run(join(appRoot, 'node_modules', '.bin', tsc), ['--noEmit'], appRoot)
  run(process.execPath, ['ace', 'migration:status'], appRoot)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
  if (tarball) {
    await rm(tarball, { force: true })
  }
}
