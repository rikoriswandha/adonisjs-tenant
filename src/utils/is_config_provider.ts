import type { ConfigProvider } from '@adonisjs/core/types'

export function isConfigProvider<T>(value: T | ConfigProvider<T>): value is ConfigProvider<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resolver' in value &&
    typeof (value as ConfigProvider<T>).resolver === 'function'
  )
}
