import type { TenancyConfig } from './types.ts'

/**
 * Define the configuration for the tenancy package.
 * This is an identity function that validates the config shape
 * and provides full type inference.
 */
export function defineTenancyConfig<UserConfig extends TenancyConfig>(
  config: UserConfig
): UserConfig {
  return config
}
