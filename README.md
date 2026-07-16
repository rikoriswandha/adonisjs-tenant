# @rikology/adonisjs-tenant

Tenant identity propagation, tenant-aware authentication helpers, and opt-in Lucid query scoping for AdonisJS v7.

## Installation

This package extends AdonisJS Auth automatically when its provider boots. Configure Auth before configuring tenancy:

```sh
npm install @adonisjs/auth @rikology/adonisjs-tenant
node ace configure @adonisjs/auth --guard=access_tokens
node ace configure @rikology/adonisjs-tenant
```

The tenancy configure command requires `config/auth.ts`. It registers the tenancy provider, the `tenant` named middleware, a `config/tenancy.ts` stub, and tenant migrations. When creating the membership pivot, it asks independently whether the tenant and user identifiers are integers, big integers, UUIDs, or strings; integer remains the default. For non-interactive configuration, set `ADONISJS_TENANT_TENANT_ID_TYPE` and `ADONISJS_TENANT_USER_ID_TYPE` to `integer`, `bigint`, `uuid`, or `string`. Re-running configure detects the package's existing migration filenames and skips generating duplicates. The command fails before making changes when Auth is not configured.

## Configuration

Configure a default named resolver in `config/tenancy.ts`:

```ts
import { defineTenancyConfig } from '@rikology/adonisjs-tenant'
import Tenant from '#models/tenant'

export default defineTenancyConfig({
  default: 'header',
  failOnMissing: true,
  tenants: {
    header: {
      resolver: 'header',
      options: {
        header: 'X-Tenant-ID',
        lookup: async (tenantId) => {
          const tenant = await Tenant.find(tenantId)
          return tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null
        },
      },
    },
  },
})
```

`failOnMissing` defaults to `true`: the middleware responds with 404 when its selected resolver does not resolve a tenant. Set it to `false` only for routes whose downstream code is prepared to run without a tenant:

```ts
export default defineTenancyConfig({
  default: 'header',
  failOnMissing: false,
  tenants: {
    header: { resolver: 'header', options: { tenants: {} } },
  },
})
```

The selected `default` must name an entry in `tenants`; the provider validates this and resolver construction during boot.

### Tenant resolvers

Import built-in resolvers from `@rikology/adonisjs-tenant/resolvers`.

```ts
import {
  HeaderResolver,
  JwtResolver,
  PathResolver,
  SubdomainResolver,
} from '@rikology/adonisjs-tenant/resolvers'
```

- `SubdomainResolver` extracts a subdomain and resolves it through `lookup` or its configured `tenants` map.
- `HeaderResolver` reads `X-Tenant-ID` by default. A header is untrusted input: use an allowlist or lookup and authorize the requesting user separately.
- `JwtResolver` builds a tenant identity from a configured JWT claim/payload builder.
- `PathResolver` resolves the first URL path segment.

## Usage

### Middleware and context

The configured provider registers the `tenant` named middleware:

```ts
// start/routes.ts
router
  .get('/dashboard', ({ tenant }) => {
    return tenant
  })
  .middleware('tenant')
```

For a resolved tenant, the middleware assigns `ctx.tenant` and runs downstream code in the package's `AsyncLocalStorage` context. Tenant-aware guards and `auth.tenant` read that package context directly, so they do not require Adonis `app.useAsyncLocalStorage` to be enabled. A tenant-aware guard also leaves a tenant-less silent `check()` unattempted, allowing starter-kit `silent_auth_middleware` to run before a route's named `tenant` middleware without caching a failed authentication attempt. Explicit authentication still fails closed until a tenant is resolved. The root package declaration surface augments both `HttpContext` and Adonis Auth's `Authenticator`, so `ctx.tenant` and `auth.tenant` are typed as `TenantContext | undefined`.

The provider automatically extends AuthManager during boot; do not call `extendAuthenticator()` in application code just to obtain `auth.tenant`.

### Tenant-aware authentication guards

Configure tenant-aware guard factories from the package's guards subpath:

```ts
import { defineTenantAuthConfig, tenantGuards } from '@rikology/adonisjs-tenant/guards'
import { tokensUserProvider } from '@adonisjs/auth/access_tokens'
import User from '#models/user'

export default defineTenantAuthConfig({
  default: 'api',
  guards: {
    api: tenantGuards.accessTokens({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
      tenantTokenProvider: User.accessTokens,
    }),
  },
})
```

### `TenantScope` model mixin

Use `TenantScope` only on models whose backing table has a real, non-null `tenant_id` column:

```ts
import { column, BaseModel } from '@adonisjs/lucid/orm'
import { TenantScope } from '@rikology/adonisjs-tenant/mixins'

export default class Post extends TenantScope(BaseModel) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
}
```

Create that column and tenant-leading indexes in an application migration. Pick the trailing columns from the actual access paths:

```ts
this.schema.alterTable('posts', (table) => {
  table.string('tenant_id').notNullable()
  table.index(['tenant_id', 'created_at'])
})
```

`TenantScope` adds model behavior; it does **not** create or alter database schema. It fails closed for its scoped reads and mutations when no tenant context is active. `withoutTenantScope()`, `forTenant(tenantId)`, and `model.bypassTenantWriteCheck()` are unrestricted escape hatches; use them only behind host-owned authorization and audit controls.

### CLI and jobs

Set a context explicitly outside the HTTP middleware:

```ts
import { TenantService } from '@rikology/adonisjs-tenant'

await TenantService.run(tenant, async () => {
  // TenantScope queries in this callback use this tenant identity.
})
```

### `withTenantAuthFinder`

For users stored per tenant, replace `withAuthFinder` with `withTenantAuthFinder` and apply it to `BaseModel`:

```ts
import hash from '@adonisjs/core/services/hash'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withTenantAuthFinder } from '@rikology/adonisjs-tenant/mixins'

export default class User extends withTenantAuthFinder(() => hash.use())(BaseModel) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}
```

This direct mode composes `TenantScope` and filters the user table's `tenant_id`.

For global users whose tenant membership lives in a pivot table, configure membership mode instead:

```ts
export default class User extends withTenantAuthFinder(() => hash.use(), {
  uids: ['email'],
  passwordColumnName: 'password',
  membership: {
    pivotTable: 'tenant_user',
    // Optional; these are the defaults:
    userForeignKey: 'user_id',
    tenantForeignKey: 'tenant_id',
  },
})(BaseModel) {}
```

Membership mode leaves the global user model unscoped, joins the pivot only for credential lookup, and hydrates the model exclusively from user-table columns. Both modes bind newly issued access tokens to the active tenant. The generated migration safely adds a nullable, indexed `tenant_id` to an existing `auth_access_tokens` table. Run it, explicitly backfill each token's tenant or revoke/delete tokens that cannot be assigned, then author and run a follow-up migration that makes the column `NOT NULL`. Until that cutover, legacy null tokens are rejected; new tokens are written and verified only in their creating tenant.

When session or basic authentication validates membership separately, configure `TenantUserProvider` with the same pivot keys:

```ts
import { TenantUserProvider } from '@rikology/adonisjs-tenant/user_providers'

const tenantUsers = new TenantUserProvider(User, {
  pivotTable: 'tenant_user',
  userForeignKey: 'user_id',
  tenantForeignKey: 'tenant_id',
})
```

## Klinika / database RLS

`AsyncLocalStorage` selects execution-local tenant identity, and `TenantScope` supplies ORM predicates. Neither is a security boundary or database row-level-security enforcement.

For Klinika-style PostgreSQL isolation, define forced RLS policies in your application database and run RLS-protected work through `TenantDatabaseExecutor`:

```ts
import db from '@adonisjs/lucid/services/db'
import { TenantDatabaseExecutor } from '@rikology/adonisjs-tenant/database'

const tenantDatabase = new TenantDatabaseExecutor(db)

await tenantDatabase.run(async (tenant, trx) => {
  const posts = await trx.from('posts').where('tenant_id', tenant.id)
  return posts
})
```

`run()` requires an active tenant context, opens one Lucid transaction, parameterizes its transaction-local `app.tenant_id` setting, and passes that same transaction client to the callback. It does not create policies, bypass forced RLS, authorize platform administrators, or write audit records; those controls remain host-owned.

## API reference

| Import                                     | Public API                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@rikology/adonisjs-tenant`                | `TenantService`, `getTenantContext()`, `getTenantContextOrFail()`, `runWithTenant()`, `defineTenancyConfig()`, `TenantMiddleware`, `TenantContext` |
| `@rikology/adonisjs-tenant/database`       | `TenantDatabaseExecutor`                                                                                                                           |
| `@rikology/adonisjs-tenant/guards`         | `defineTenantAuthConfig()`, `tenantGuards`                                                                                                         |
| `@rikology/adonisjs-tenant/mixins`         | `TenantScope`, `withTenantAuthFinder`                                                                                                              |
| `@rikology/adonisjs-tenant/resolvers`      | `SubdomainResolver`, `HeaderResolver`, `JwtResolver`, `PathResolver`                                                                               |
| `@rikology/adonisjs-tenant/user_providers` | `TenantUserProvider`                                                                                                                               |
| `@rikology/adonisjs-tenant/extensions`     | `TenantAuthenticator`, `extendAuthenticator()` for advanced integrations; the installed provider applies the extension automatically.              |

## Limitations and security model

- The package does not provision tenants or create application tables, columns, indexes, or RLS policies.
- Middleware placement and resolver lookup establish tenant identity; your application must still authenticate and authorize every request.
- The package's context and ORM predicates are defense-in-depth conveniences, not a substitute for database RLS where hard isolation is required.
- Routes that intentionally allow no tenant must opt in with `failOnMissing: false` and must not invoke tenant-scoped operations without establishing a context.
