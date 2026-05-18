import { RuntimeException } from '@adonisjs/core/exceptions'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { TenantContext, TenantUserProviderContract } from '../types.js'

export class TenantUserProvider<UserModel extends LucidModel> implements TenantUserProviderContract<
  InstanceType<UserModel>
> {
  constructor(
    private userModel: UserModel,
    private tenantUserPivot: string = 'tenant_user'
  ) {}

  async findById(
    tenant: TenantContext,
    identifier: string | number
  ): Promise<InstanceType<UserModel> | null> {
    const user = await this.userModel
      .query()
      .innerJoin(
        this.tenantUserPivot,
        `${this.userModel.table}.id`,
        `${this.tenantUserPivot}.user_id`
      )
      .where(`${this.userModel.table}.id`, identifier)
      .where(`${this.tenantUserPivot}.tenant_id`, tenant.id)
      .first()

    return user
  }

  async getUserFor(
    tenant: TenantContext,
    identifier: string | number
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
