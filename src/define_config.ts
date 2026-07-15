import type { TenantConfig, TenancyConfig } from './types.ts'

type DefinedTenancyConfig<Tenants extends Record<string, TenantConfig>> = Omit<
  TenancyConfig,
  'default' | 'tenants'
> & {
  default: Extract<keyof Tenants, string>
  tenants: Tenants
}

/**
 * Define tenancy configuration with a default resolver key that must exist in
 * the configured resolver map.
 */
export function defineTenancyConfig<const Tenants extends Record<string, TenantConfig>>(
  config: DefinedTenancyConfig<Tenants>
): DefinedTenancyConfig<Tenants> {
  return config
}
