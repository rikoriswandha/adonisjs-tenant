import { join } from 'node:path'

/**
 * Path to the root directory where the stubs are stored. We use
 * this path within commands and the configure hook
 */
export const stubsRoot = import.meta.dirname

/**
 * Migration stubs
 */
export const migrationStubs = {
  tenantUser: join(stubsRoot, 'migrations', 'tenant_user.stub'),
  addTenantIdToAccessTokens: join(stubsRoot, 'migrations', 'add_tenant_id_to_access_tokens.stub'),
}
