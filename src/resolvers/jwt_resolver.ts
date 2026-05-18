/*
|--------------------------------------------------------------------------
| JWT Tenant Resolver
|--------------------------------------------------------------------------
|
| Resolves the current tenant from a JWT token in the Authorization header.
| Decodes the JWT without verifying the signature — the auth middleware is
| expected to have already verified it.
|
*/

import type { HttpContext } from '@adonisjs/core/http'
import type { TenantContext, TenantResolverContract } from '../types.js'

/**
 * Configuration options for the JWT resolver.
 */
export type JwtResolverOptions = {
  /**
   * The claim key inside the JWT payload that holds the tenant identifier
   * (default: "tenant_id").
   */
  tenantClaim?: string

  /**
   * A callback to build a TenantContext from the decoded JWT payload.
   * If not provided, the resolver creates a basic context using the
   * claim value as id, name, and slug.
   */
  builder?: (payload: Record<string, any>) => TenantContext | null
}

/**
 * Simple Base64-URL decoder for JWT payloads.
 * Does NOT verify the signature — only decodes the payload.
 */
function decodeJWTPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    // Standard Base64-URL to Base64 with padding normalization
    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    const decoded = atob(base64)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Resolves the current tenant by decoding a JWT from the
 * Authorization header and extracting a tenant claim.
 */
export class JwtResolver implements TenantResolverContract {
  constructor(private options: JwtResolverOptions = {}) {}

  async resolve(ctx: HttpContext): Promise<TenantContext | null> {
    const authHeader = ctx.request.header('Authorization')
    if (!authHeader) return null

    // Expect "Bearer <token>"
    if (!authHeader.startsWith('Bearer ')) return null

    const token = authHeader.slice(7).trim()
    if (!token) return null

    const payload = decodeJWTPayload(token)
    if (!payload) return null

    if (this.options.builder) {
      return this.options.builder(payload)
    }

    const tenantClaim = this.options.tenantClaim ?? 'tenant_id'
    const tenantId = payload[tenantClaim]

    if (!tenantId) return null

    return {
      id: tenantId,
      name: String(tenantId),
      slug: String(tenantId),
    }
  }
}
