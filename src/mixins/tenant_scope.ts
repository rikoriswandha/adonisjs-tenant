import { column } from '@adonisjs/lucid/orm'
import type { BaseModel } from '@adonisjs/lucid/orm'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type {
  LucidModel,
  ModelAdapterOptions,
  ModelQueryBuilderContract,
} from '@adonisjs/lucid/types/model'
import { getTenantContext, getTenantContextOrFail } from '../tenant_context.js'

const SKIP_TENANT_SCOPE = '$adonisjs_tenant_skipScope'
const MUTATION_METHODS = new Set(['update', 'delete', 'del', 'increment', 'decrement'])

type ScopedQuery = ModelQueryBuilderContract<LucidModel, unknown>
type TenantScopedInstance = {
  tenant_id?: string | number | null
}
type Callable = (...args: unknown[]) => unknown
type UpdateCallable = Callable & {
  merge?: Callable
  raw?: Callable
}

const scopedBuilders = new WeakSet<object>()
const writeCheckBypass = new WeakSet<object>()
const bootedTenantModels = new WeakSet<object>()

function tenantIdsMatch(left: string | number, right: string | number) {
  return String(left) === String(right)
}

function hasTenantId(model: TenantScopedInstance) {
  return model.tenant_id !== undefined && model.tenant_id !== null
}

function isScopeSkipped(query: ScopedQuery) {
  return (query.sideloaded as Record<string, unknown> | undefined)?.[SKIP_TENANT_SCOPE] === true
}

function applyTenantScope(query: ScopedQuery) {
  if (scopedBuilders.has(query)) {
    return
  }

  if (isScopeSkipped(query)) {
    return
  }

  const ctx = getTenantContext()
  if (ctx) {
    query.where('tenant_id', ctx.id)
    scopedBuilders.add(query)
  }
}

function applyTenantScopeOnce(query: ScopedQuery) {
  applyTenantScope(query)
}

function wrapUpdate(target: ScopedQuery, update: UpdateCallable) {
  const wrapped: UpdateCallable = (...args: unknown[]) => {
    applyTenantScopeOnce(target)
    return update.apply(target, args)
  }

  if (update.merge) {
    wrapped.merge = (...args: unknown[]) => {
      applyTenantScopeOnce(target)
      return update.merge?.apply(target, args)
    }
  }

  if (update.raw) {
    wrapped.raw = (...args: unknown[]) => {
      applyTenantScopeOnce(target)
      return update.raw?.apply(target, args)
    }
  }

  return wrapped
}

function applyMutationScope<Q extends ScopedQuery>(query: Q): Q {
  return new Proxy(query, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)

      if (prop === 'clone' && typeof value === 'function') {
        return (...args: unknown[]) => applyMutationScope(value.apply(target, args) as Q)
      }

      if (!MUTATION_METHODS.has(String(prop)) || typeof value !== 'function') {
        return value
      }

      if (prop === 'update') {
        return wrapUpdate(target, value as unknown as UpdateCallable)
      }

      return (...args: unknown[]) => {
        applyTenantScopeOnce(target)
        return (value as Callable).apply(target, args)
      }
    },
  }) as Q
}

export type TenantScopedModelContract<Model extends NormalizeConstructor<typeof BaseModel>> =
  NormalizeConstructor<typeof BaseModel> & {
    withoutTenantScope(): ModelQueryBuilderContract<LucidModel, InstanceType<Model>>
    forTenant(tenantId: string | number): ModelQueryBuilderContract<LucidModel, InstanceType<Model>>
    boot(): void
    new (...args: ConstructorParameters<Model>): InstanceType<Model> & {
      tenant_id: string | number
      bypassTenantWriteCheck(): InstanceType<Model>
    }
  }

export function TenantScope<Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) {
  const originalQuery = (superclass as typeof BaseModel).query

  class TenantScoped extends superclass {
    @column()
    declare tenant_id: string | number

    static boot() {
      super.boot()

      const self = this as unknown as LucidModel
      if (bootedTenantModels.has(self)) {
        return
      }
      bootedTenantModels.add(self)

      self.before('save', (model) => {
        const scopedModel = model as unknown as TenantScopedInstance

        if (!hasTenantId(scopedModel)) {
          const ctx = getTenantContextOrFail()
          scopedModel.tenant_id = ctx.id
          return
        }

        if (writeCheckBypass.has(model)) {
          return
        }

        const tenantId = scopedModel.tenant_id
        if (tenantId === undefined || tenantId === null) {
          return
        }

        const ctx = getTenantContext()
        if (ctx && !tenantIdsMatch(tenantId, ctx.id)) {
          throw new RuntimeException(
            `Cross-tenant write blocked: model tenant_id "${tenantId}" does not match current tenant "${ctx.id}". Call bypassTenantWriteCheck() on the model instance to bypass this check explicitly.`,
            { status: 403, code: 'E_CROSS_TENANT_WRITE' }
          )
        }
      })

      self.before('find', (query: ScopedQuery) => {
        applyTenantScope(query)
      })

      self.before('fetch', (query: ScopedQuery) => {
        applyTenantScope(query)
      })

      self.before('paginate', ([countQuery, query]: [ScopedQuery, ScopedQuery]) => {
        applyTenantScope(query)
        applyTenantScope(countQuery)
      })
    }

    static query(
      options?: ModelAdapterOptions
    ): ModelQueryBuilderContract<LucidModel, InstanceType<Model>> {
      const query = originalQuery.call(this, options) as ModelQueryBuilderContract<
        LucidModel,
        InstanceType<Model>
      >
      return applyMutationScope(query)
    }

    static withoutTenantScope(): ModelQueryBuilderContract<LucidModel, InstanceType<Model>> {
      const query = originalQuery.call(this) as ModelQueryBuilderContract<
        LucidModel,
        InstanceType<Model>
      >
      return query.sideload(
        { [SKIP_TENANT_SCOPE]: true } as Record<string, unknown>,
        true
      ) as ModelQueryBuilderContract<LucidModel, InstanceType<Model>>
    }

    static forTenant(
      tenantId: string | number
    ): ModelQueryBuilderContract<LucidModel, InstanceType<Model>> {
      const query = originalQuery.call(this) as ModelQueryBuilderContract<
        LucidModel,
        InstanceType<Model>
      >
      return query
        .sideload({ [SKIP_TENANT_SCOPE]: true } as Record<string, unknown>, true)
        .where('tenant_id', tenantId) as ModelQueryBuilderContract<LucidModel, InstanceType<Model>>
    }

    bypassTenantWriteCheck(): this {
      writeCheckBypass.add(this)
      return this
    }
  }

  return TenantScoped
}
