import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { getTenantContextOrFail } from './tenant_context.js'
import type { TenantContext } from './types.js'

/**
 * A database client that can execute work within one Lucid transaction.
 */
export interface TenantDatabaseClient {
  transaction<T>(callback: (transaction: TransactionClientContract) => Promise<T>): Promise<T>
}

export type TenantDatabaseExecutorCallback<T> = (
  tenant: TenantContext,
  transaction: TransactionClientContract
) => T | Promise<T>

/**
 * Runs database work with the active tenant selected for transaction-local PostgreSQL RLS policies.
 *
 * This class does not authorize callers or create/enforce row-level security policies. Hosts must
 * apply their own authorization and audit controls before invoking it.
 */
export class TenantDatabaseExecutor {
  constructor(private readonly database: TenantDatabaseClient) {}

  async run<T>(callback: TenantDatabaseExecutorCallback<T>): Promise<T> {
    const tenant = getTenantContextOrFail()

    return this.database.transaction(async (transaction) => {
      await transaction.rawQuery("SELECT set_config('app.tenant_id', ?, true)", [String(tenant.id)])
      return callback(tenant, transaction)
    })
  }
}
