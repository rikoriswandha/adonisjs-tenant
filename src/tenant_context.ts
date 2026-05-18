import { AsyncLocalStorage } from 'node:async_hooks'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { TenantContext } from './types.js'

export class TenantNotResolvedError extends RuntimeException {
  static status = 500
  static code = 'E_TENANT_NOT_RESOLVED'
}

const storage = new AsyncLocalStorage<TenantContext>()

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore()
}

export function getTenantContextOrFail(): TenantContext {
  const tenant = getTenantContext()
  if (tenant === undefined) {
    throw new TenantNotResolvedError(
      'No tenant context available. Ensure runWithTenant() is used to set a tenant.'
    )
  }
  return tenant
}

export function runWithTenant<T>(
  tenant: TenantContext,
  callback: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(storage.run(tenant, callback))
}
