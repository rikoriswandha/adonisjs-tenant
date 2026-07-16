import { RuntimeException } from '@adonisjs/core/exceptions'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { TenantContext, TenantUserProviderContract } from '../types.js'

export type TenantUserProviderOptions = {
  pivotTable?: string
  userForeignKey?: string
  tenantForeignKey?: string
}

export class TenantUserProvider<UserModel extends LucidModel> implements TenantUserProviderContract<
  InstanceType<UserModel>
> {
  private readonly membership: Required<TenantUserProviderOptions>

  constructor(userModel: UserModel, pivotTable?: string)
  constructor(userModel: UserModel, options?: TenantUserProviderOptions)
  constructor(
    private readonly userModel: UserModel,
    options: string | TenantUserProviderOptions = 'tenant_user'
  ) {
    this.membership =
      typeof options === 'string'
        ? { pivotTable: options, userForeignKey: 'user_id', tenantForeignKey: 'tenant_id' }
        : {
            pivotTable: options.pivotTable ?? 'tenant_user',
            userForeignKey: options.userForeignKey ?? 'user_id',
            tenantForeignKey: options.tenantForeignKey ?? 'tenant_id',
          }
  }

  async findById(
    tenant: TenantContext,
    identifier: string | number | BigInt
  ): Promise<InstanceType<UserModel> | null> {
    const primaryKey = this.userModel.primaryKey
    const primaryKeyColumn = this.userModel.$getColumn(primaryKey)?.columnName ?? primaryKey
    const databaseIdentifier = String(identifier)
    const user = await this.userModel
      .query()
      .select(`${this.userModel.table}.*`)
      .innerJoin(
        this.membership.pivotTable,
        `${this.userModel.table}.${primaryKeyColumn}`,
        `${this.membership.pivotTable}.${this.membership.userForeignKey}`
      )
      .where(`${this.userModel.table}.${primaryKeyColumn}`, databaseIdentifier)
      .where(`${this.membership.pivotTable}.${this.membership.tenantForeignKey}`, tenant.id)
      .first()

    return user
  }

  async getUserFor(
    tenant: TenantContext,
    identifier: string | number | BigInt
  ): Promise<InstanceType<UserModel>> {
    const user = await this.findById(tenant, identifier)

    if (!user) {
      throw new RuntimeException(
        `User "${identifier}" not found or does not belong to the current tenant`
      )
    }

    return user
  }
}
