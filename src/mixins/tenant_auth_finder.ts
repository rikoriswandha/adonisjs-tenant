import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import type { Hash, HashManager } from '@adonisjs/core/hash'
import type { BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { TenantScope } from './tenant_scope.js'
import { getTenantContext } from '../tenant_context.js'

/**
 * Custom access tokens provider that injects tenant_id into
 * the auth_access_tokens table during token creation.
 *
 * Note: DbAccessTokensProvider.create() does not accept extra columns,
 * so tenant_id is set via a follow-up UPDATE after the initial INSERT.
 * This is the only approach that avoids forking the upstream provider.
 * The migration should keep tenant_id as nullable to accommodate this.
 */
export class TenantDbAccessTokensProvider<
  TokenableModel extends LucidModel,
> extends DbAccessTokensProvider<TokenableModel> {
  async create(
    user: InstanceType<TokenableModel>,
    abilities?: string[],
    options?: { name?: string; expiresIn?: string | number }
  ): Promise<AccessToken> {
    const result = await super.create(user, abilities, options)
    const ctx = getTenantContext()
    if (ctx) {
      const db = await this.getDb()
      await db
        .from(this.table)
        .where('id', result.identifier as string | number)
        .update({ tenant_id: ctx.id as string | number })
    }
    return result
  }
}

/**
 * Composable mixin that adds tenant-aware authentication finder
 * to a Lucid model.
 *
 * Combines {@link withAuthFinder} with {@link TenantScope}, scopes
 * credential verification to the current tenant, and injects
 * tenant_id into access token generation.
 */
export function withTenantAuthFinder(
  hash: (() => Hash) | HashManager<any>,
  options?: {
    uids?: string[]
    passwordColumnName?: string
  }
) {
  return function <Model extends NormalizeConstructor<typeof BaseModel>>(superclass: Model) {
    class TenantAuthFinder extends withAuthFinder(hash, options)(TenantScope(superclass)) {
      /**
       * Overrides findForAuth to scope user lookup to the current
       * tenant when a tenant context is active.
       */
      static async findForAuth(this: any, uids: string[], value: string): Promise<any> {
        const query = this.query()
        const ctx = getTenantContext()
        if (ctx) {
          query.where('tenant_id', ctx.id as string | number)
        }
        query.andWhere((builder: any) => {
          uids.forEach((uid) => builder.orWhere(uid, value))
        })
        return query.limit(1).first()
      }

      static get accessTokens() {
        return TenantDbAccessTokensProvider.forModel(this as unknown as LucidModel)
      }
    }

    return TenantAuthFinder as unknown as Model & typeof TenantAuthFinder
  }
}
