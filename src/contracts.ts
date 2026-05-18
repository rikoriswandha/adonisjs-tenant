import type { TenantContext } from './types.ts'
import type {} from '@adonisjs/auth'
import type { GuardFactory } from '@adonisjs/auth/types'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    tenant?: TenantContext
  }
}

declare module '@adonisjs/auth' {
  interface Authenticator<KnownGuards extends Record<string, GuardFactory>> {
    tenant?: TenantContext
  }
}
