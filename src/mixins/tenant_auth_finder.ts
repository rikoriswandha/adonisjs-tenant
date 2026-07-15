import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { DbAccessTokensProviderOptions } from '@adonisjs/auth/types/access_tokens'
import type { Hash, HashManager } from '@adonisjs/core/hash'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { TenantScope } from './tenant_scope.js'
import type { TenantScopedModelContract } from './tenant_scope.js'
import { getTenantContext, getTenantContextOrFail } from '../tenant_context.js'

/**
 * Custom access-token provider that persists the active tenant identifier
 * alongside each token.
 */
export class TenantDbAccessTokensProvider<
  TokenableModel extends LucidModel,
> extends DbAccessTokensProvider<TokenableModel> {
  static override forModel<TokenableModel extends LucidModel>(
    tokenableModel: DbAccessTokensProviderOptions<TokenableModel>['tokenableModel'],
    options?: Omit<DbAccessTokensProviderOptions<TokenableModel>, 'tokenableModel'>
  ): TenantDbAccessTokensProvider<TokenableModel> {
    return new TenantDbAccessTokensProvider({ tokenableModel, ...options })
  }

  async create(
    user: InstanceType<TokenableModel>,
    abilities: string[] = ['*'],
    options?: { name?: string; expiresIn?: string | number }
  ): Promise<AccessToken> {
    if (!user.$primaryKeyValue) {
      throw new RuntimeException(
        `Cannot use "${user.constructor.name}" model for managing access tokens. The primary key is undefined or null`
      )
    }

    const tenant = getTenantContextOrFail()
    const transientToken = AccessToken.createTransientToken(
      user.$primaryKeyValue,
      this.tokenSecretLength,
      options?.expiresIn ?? this.options.expiresIn
    )
    const dbRow = {
      tokenable_id: transientToken.userId,
      type: this.type,
      name: options?.name ?? null,
      hash: transientToken.hash,
      abilities: JSON.stringify(abilities),
      tenant_id: tenant.id,
      created_at: new Date(),
      updated_at: new Date(),
      last_used_at: null,
      expires_at: transientToken.expiresAt ?? null,
    }
    const db = await this.getDb()
    const result = await db.table(this.table).insert(dbRow).returning('id')
    const firstResult = result[0]
    const identifier =
      firstResult !== null && typeof firstResult === 'object' ? firstResult.id : firstResult

    if (!identifier) {
      throw new RuntimeException(
        `Cannot save access token. The insert result "${JSON.stringify(result)}" is unexpected`
      )
    }

    return new AccessToken({
      identifier,
      tokenableId: dbRow.tokenable_id,
      type: dbRow.type,
      prefix: this.prefix,
      secret: transientToken.secret,
      name: dbRow.name,
      hash: dbRow.hash,
      abilities,
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at,
      lastUsedAt: dbRow.last_used_at,
      expiresAt: dbRow.expires_at,
    })
  }

  /**
   * Verifies a token is valid for the tenant active in the current async
   * context. Pass this method to {@link tenantAwareAccessTokensGuard}.
   */
  async verifyForCurrentTenant(
    tokenValue: Parameters<DbAccessTokensProvider<TokenableModel>['verify']>[0]
  ): Promise<AccessToken | null> {
    return this.verify(tokenValue)
  }

  async verify(tokenValue: Parameters<DbAccessTokensProvider<TokenableModel>['verify']>[0]) {
    const tenant = getTenantContext()
    if (!tenant) {
      return null
    }

    const token = await super.verify(tokenValue)
    if (!token) {
      return null
    }

    const db = await this.getDb()
    const tokenRow = await db
      .query()
      .from(this.table)
      .where({ id: token.identifier, tenant_id: tenant.id })
      .first()

    return tokenRow ? token : null
  }
}

export type TenantAuthFinderMembershipOptions = {
  pivotTable: string
  userForeignKey?: string
  tenantForeignKey?: string
}

export type TenantAuthFinderOptions = {
  uids?: string[]
  passwordColumnName?: string
  membership?: TenantAuthFinderMembershipOptions
}

type TenantAuthFinderDirectOptions = Omit<TenantAuthFinderOptions, 'membership'> & {
  membership?: undefined
}

type TenantAuthFinderMethods<Model extends NormalizeConstructor<typeof BaseModel>> = {
  findForAuth(uids: string[], value: string): Promise<InstanceType<Model> | null>
  verifyCredentials(uid: string, password: string): Promise<InstanceType<Model>>
  readonly accessTokens: TenantDbAccessTokensProvider<LucidModel>
}

export type TenantAuthFinderModelContract<Model extends NormalizeConstructor<typeof BaseModel>> =
  TenantScopedModelContract<Model> & TenantAuthFinderMethods<Model>

export type TenantMembershipAuthFinderModelContract<
  Model extends NormalizeConstructor<typeof BaseModel>,
> = Model & TenantAuthFinderMethods<Model>

/**
 * Composable mixin that adds tenant-aware authentication lookup and access
 * tokens to a Lucid model.
 *
 * By default, users are scoped through their `tenant_id` column. Pass
 * `membership` to scope global users through a tenant-membership pivot instead.
 */
export function withTenantAuthFinder(
  hash: (() => Hash) | HashManager<Record<string, never>>,
  options: TenantAuthFinderOptions & {
    membership: TenantAuthFinderMembershipOptions
  }
): <Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) => TenantMembershipAuthFinderModelContract<Model>
export function withTenantAuthFinder(
  hash: (() => Hash) | HashManager<Record<string, never>>,
  options?: TenantAuthFinderDirectOptions
): <Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) => TenantAuthFinderModelContract<Model>
export function withTenantAuthFinder(
  hash: (() => Hash) | HashManager<Record<string, never>>,
  options: TenantAuthFinderOptions
): <Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) => TenantMembershipAuthFinderModelContract<Model>
export function withTenantAuthFinder(
  hash: (() => Hash) | HashManager<Record<string, never>>,
  options?: TenantAuthFinderOptions
) {
  const { membership, ...authFinderOptions } = options ?? {}

  return function <Model extends NormalizeConstructor<typeof BaseModel>>(superclass: Model) {
    const model = membership ? superclass : (TenantScope(superclass) as Model)

    class TenantAuthFinder extends withAuthFinder(hash, authFinderOptions)(model) {
      /**
       * Overrides findForAuth to scope user lookup to the current
       * tenant when a tenant context is active.
       */
      static async findForAuth<T extends NormalizeConstructor<typeof BaseModel>>(
        this: T,
        uids: string[],
        value: string
      ): Promise<InstanceType<T> | null> {
        const query = this.query()

        if (membership) {
          const tenant = getTenantContextOrFail()
          const userTable = this.table
          const primaryKeyColumn = this.$getColumn(this.primaryKey)?.columnName ?? this.primaryKey
          const userForeignKey = membership.userForeignKey ?? 'user_id'
          const tenantForeignKey = membership.tenantForeignKey ?? 'tenant_id'

          query
            .select(`${userTable}.*`)
            .innerJoin(
              membership.pivotTable,
              `${userTable}.${primaryKeyColumn}`,
              `${membership.pivotTable}.${userForeignKey}`
            )
            .where(`${membership.pivotTable}.${tenantForeignKey}`, tenant.id)
        } else {
          const tenant = getTenantContext()
          if (tenant) {
            query.where('tenant_id', String(tenant.id))
          }
        }

        query.andWhere((builder) => {
          uids.forEach((uid) => {
            const columnName = this.$getColumn(uid)?.columnName ?? uid
            const column = membership ? `${this.table}.${columnName}` : columnName
            builder.orWhere(column, value)
          })
        })

        return query.limit(1).first()
      }

      static get accessTokens() {
        return TenantDbAccessTokensProvider.forModel(this as unknown as LucidModel)
      }
    }

    return TenantAuthFinder as unknown as TenantAuthFinderModelContract<Model>
  }
}
