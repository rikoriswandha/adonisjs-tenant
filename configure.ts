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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

  const timestamp = Date.now()

  await codemods.makeUsingStub(stubsRoot, 'migrations/tenant_user.stub', {
    migration: {
      folder: 'database/migrations',
      fileName: `${timestamp}_create_tenant_user_table.ts`,
    },
  })

  if (!skipAccessTokensMigration) {
    await codemods.makeUsingStub(stubsRoot, 'migrations/add_tenant_id_to_access_tokens.stub', {
      migration: {
        folder: 'database/migrations',
        fileName: `${timestamp}_add_tenant_id_to_access_tokens_table.ts`,
      },
    })
  } else {
    command.logger.info(
      'Skipped access tokens migration. To add it later, run: node ace make:migration add_tenant_id_to_access_tokens'
    )
  }

  command.logger.success('@rikology/adonisjs-tenant configured successfully!')
  command.logger.info('')
  command.logger.info('Next steps:')
  command.logger.info('  1. Update config/tenancy.ts with your tenant resolver configuration')
  command.logger.info('  2. Run migrations: node ace migration:run')
  command.logger.info("  3. Apply tenant middleware to your routes: router.use('tenant')")
}
