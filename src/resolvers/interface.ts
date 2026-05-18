/*
|--------------------------------------------------------------------------
| Tenant Resolver Contract
|--------------------------------------------------------------------------
|
| Defines the interface that all tenant resolvers must implement.
| Each resolver extracts tenant context from an HTTP request using a
| specific strategy (subdomain, header, JWT, path, etc.).
|
*/

import type { HttpContext } from '@adonisjs/http-server'
import type { TenantContext } from '../types.js'

export interface TenantResolverContract {
  resolve(ctx: HttpContext): Promise<TenantContext | null>
}
