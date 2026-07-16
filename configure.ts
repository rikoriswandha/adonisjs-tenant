/*
|--------------------------------------------------------------------------
| Configure hook
|--------------------------------------------------------------------------
|
| The configure hook is called when someone runs "node ace configure <package>"
| command. You are free to perform any operations inside this function to
| configure the package.
|
| To make things easier, you have access to the underlying "Configure"
| instance and you can use codemods to modify the source files.
|
*/

import type Configure from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TENANT_USER_MIGRATION_SUFFIX = '_create_tenant_user_table'
const ACCESS_TOKENS_MIGRATION_SUFFIX = '_add_tenant_id_to_access_tokens_table'

const IDENTIFIER_TYPES = [
  {
    name: 'integer',
    message: 'Integer (default)',
    column: "integer('{{ columnName }}').unsigned()",
  },
  {
    name: 'bigint',
    message: 'Big integer',
    column: "bigInteger('{{ columnName }}').unsigned()",
  },
  {
    name: 'uuid',
    message: 'UUID',
    column: "uuid('{{ columnName }}')",
  },
  {
    name: 'string',
    message: 'String',
    column: "string('{{ columnName }}')",
  },
] as const

type IdentifierType = (typeof IDENTIFIER_TYPES)[number]['name']

function isIdentifierType(value: string): value is IdentifierType {
  return IDENTIFIER_TYPES.some((identifierType) => identifierType.name === value)
}

function hasGeneratedMigration(appRoot: string, suffix: string) {
  const migrationsPath = join(appRoot, 'database', 'migrations')

  if (!existsSync(migrationsPath)) {
    return false
  }

  try {
    return readdirSync(migrationsPath).some(
      (fileName) =>
        fileName.endsWith(`${suffix}.ts`) ||
        fileName.endsWith(`${suffix}.js`) ||
        fileName.endsWith(`${suffix}.mjs`)
    )
  } catch {
    return false
  }
}

async function selectIdentifierType(
  command: Configure,
  subject: 'tenant' | 'user'
): Promise<IdentifierType> {
  const environmentVariable = `ADONISJS_TENANT_${subject.toUpperCase()}_ID_TYPE`
  const environmentValue = process.env[environmentVariable]

  if (environmentValue !== undefined) {
    if (!isIdentifierType(environmentValue)) {
      throw new Error(
        `${environmentVariable} must be one of: ${IDENTIFIER_TYPES.map(({ name }) => name).join(', ')}`
      )
    }

    return environmentValue
  }

  return command.prompt.choice(
    `Select the ${subject} identifier type`,
    IDENTIFIER_TYPES.map(({ name, message }) => ({ name, message })),
    {
      default: 'integer',
      validate: (value) => isIdentifierType(value) || 'Select a supported identifier type',
    }
  )
}

function identifierColumn(type: IdentifierType, columnName: 'tenant_id' | 'user_id') {
  const definition = IDENTIFIER_TYPES.find((identifierType) => identifierType.name === type)

  if (!definition) {
    throw new Error(`Unsupported identifier type "${type}"`)
  }

  return definition.column.replace('{{ columnName }}', columnName)
}

function detectAuthConfig(appRoot: string): { hasAuthConfig: boolean; hasAccessTokens: boolean } {
  const authConfigPath = join(appRoot, 'config', 'auth.ts')

  if (!existsSync(authConfigPath)) {
    return { hasAuthConfig: false, hasAccessTokens: false }
  }

  try {
    const content = readFileSync(authConfigPath, 'utf-8')
    const hasAccessTokens =
      content.includes('accessTokens') ||
      content.includes('access_tokens') ||
      content.includes('AccessTokensGuard')
    return { hasAuthConfig: true, hasAccessTokens }
  } catch {
    return { hasAuthConfig: true, hasAccessTokens: false }
  }
}

async function validatePrerequisites(command: Configure) {
  const appRoot = fileURLToPath(command.app.appRoot)
  const { hasAuthConfig, hasAccessTokens } = detectAuthConfig(appRoot)

  if (!hasAuthConfig) {
    throw new Error(
      'Cannot configure @rikology/adonisjs-tenant without @adonisjs/auth. Install and configure @adonisjs/auth first (node ace configure @adonisjs/auth).'
    )
  }

  if (!hasAccessTokens) {
    command.logger.info(
      'Access tokens guard not detected in auth config. If you plan to use access tokens authentication, configure it first:'
    )
    command.logger.info('  node ace configure @adonisjs/auth --guard=access_tokens')
    command.logger.info(
      'Skipping the access tokens migration. You can add tenant_id later when needed.'
    )
  }

  return { skipAccessTokensMigration: !hasAccessTokens }
}

export async function configure(command: Configure) {
  const { skipAccessTokensMigration } = await validatePrerequisites(command)
  const appRoot = fileURLToPath(command.app.appRoot)
  const codemods = await command.createCodemods()
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@rikology/adonisjs-tenant/providers/tenancy_provider')
  })

  await codemods.registerMiddleware('named', [
    {
      name: 'tenant',
      path: '@rikology/adonisjs-tenant/middleware',
    },
  ])

  await codemods.makeUsingStub(stubsRoot, 'config/tenancy.stub', {})

  if (hasGeneratedMigration(appRoot, TENANT_USER_MIGRATION_SUFFIX)) {
    command.logger.info('Skipped tenant_user migration because it has already been generated.')
  } else {
    const tenantIdentifierType = await selectIdentifierType(command, 'tenant')
    const userIdentifierType = await selectIdentifierType(command, 'user')

    await codemods.makeUsingStub(stubsRoot, 'migrations/tenant_user.stub', {
      migration: {
        folder: 'database/migrations',
        fileName: `${Date.now()}_create_tenant_user_table.ts`,
      },
      tenantIdColumn: identifierColumn(tenantIdentifierType, 'tenant_id'),
      userIdColumn: identifierColumn(userIdentifierType, 'user_id'),
    })
  }

  if (skipAccessTokensMigration) {
    command.logger.info(
      'Skipped access tokens migration. To add it later, run: node ace make:migration add_tenant_id_to_access_tokens'
    )
  } else if (hasGeneratedMigration(appRoot, ACCESS_TOKENS_MIGRATION_SUFFIX)) {
    command.logger.info('Skipped access tokens migration because it has already been generated.')
  } else {
    await codemods.makeUsingStub(stubsRoot, 'migrations/add_tenant_id_to_access_tokens.stub', {
      migration: {
        folder: 'database/migrations',
        fileName: `${Date.now()}_add_tenant_id_to_access_tokens_table.ts`,
      },
    })
  }

  command.logger.success('@rikology/adonisjs-tenant configured successfully!')
  command.logger.info('')
  command.logger.info('Next steps:')
  command.logger.info('  1. Update config/tenancy.ts with your tenant resolver configuration')
  command.logger.info('  2. Run migrations: node ace migration:run')
  command.logger.info("  3. Apply tenant middleware to your routes: router.use('tenant')")
}
