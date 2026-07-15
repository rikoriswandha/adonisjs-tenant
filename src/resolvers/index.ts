/*
|--------------------------------------------------------------------------
| Resolvers barrel
|--------------------------------------------------------------------------
|
| Re-exports all tenant resolver implementations and their option types.
|
*/
export type { TenantResolverContract } from '../types.js'

export { SubdomainResolver } from './subdomain_resolver.js'
export type { SubdomainResolverOptions } from './subdomain_resolver.js'

export { HeaderResolver } from './header_resolver.js'
export type { HeaderResolverOptions } from './header_resolver.js'

export { JwtResolver } from './jwt_resolver.js'
export type { JwtResolverOptions } from './jwt_resolver.js'

export { PathResolver } from './path_resolver.js'
export type { PathResolverOptions } from './path_resolver.js'
