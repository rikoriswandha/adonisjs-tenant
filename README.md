# adonisjs-tenant

Multitenancy library for AdonisJS v7. Provides tenant-aware authentication guards and ORM scoping via AsyncLocalStorage.

## Installation

```sh
npm install adonisjs-tenant
```

## Quick start

Run the configure command to set up the package:

```sh
node ace configure adonisjs-tenant
```

This registers the provider, middleware alias, and publishes the initial migrations.

## Configuration

Create a `config/tenancy.ts` file:

```ts
import { defineTenancyConfig } from 'adonisjs-tenant'
import { SubdomainResolver } from 'adonisjs-tenant/resolvers'

export default defineTenancyConfig({
  default: 'subdomain',
  tenants: {
    subdomain: {
      resolver: 'subdomain',
      options: {
        lookup: async (subdomain) => {
          const tenant = await Tenant.findBySlug(subdomain)
          return tenant ? { id: tenant.id, name: tenant.name, slug: subdomain } : null
        },
      },
    },
  },
})
```

### Tenant resolvers

**SubdomainResolver** — extracts tenant from hostname:

```ts
import { SubdomainResolver } from 'adonisjs-tenant/resolvers'

const resolver = new SubdomainResolver({
  levels: 1, // extract first subdomain segment
  lookup: async (subdomain) => {
    const tenant = await Tenant.findBySlug(subdomain)
    return tenant ? { id: tenant.id, name: tenant.name, slug: subdomain } : null
  },
})
```

**HeaderResolver** — reads tenant from HTTP header (default: `X-Tenant-ID`):

```ts
import { HeaderResolver } from 'adonisjs-tenant/resolvers'

const resolver = new HeaderResolver({
  header: 'X-Tenant-ID',
})
```

**JwtResolver** — extracts tenant from JWT payload:

```ts
import { JwtResolver } from 'adonisjs-tenant/resolvers'

const resolver = new JwtResolver({
  tenantClaim: 'tenant_id', // claim key inside the JWT payload
  builder: (payload) => {
    // custom TenantContext builder from decoded JWT
    return { id: payload.tenant_id, name: payload.tenant_name, slug: payload.tenant_slug }
  },
})
```

**PathResolver** — extracts tenant from first URL path segment:

```ts
import { PathResolver } from 'adonisjs-tenant/resolvers'

const resolver = new PathResolver({
  lookup: async (segment) => {
    const tenant = await Tenant.findBySlug(segment)
    return tenant ? { id: tenant.id, name: tenant.name, slug: segment } : null
  },
})
```

## Usage

### Middleware setup

The provider automatically registers the `tenant` middleware alias from your `config/tenancy.ts` configuration. Use it on routes that need tenant resolution:

```ts
// start/routes.ts
router
  .get('/dashboard', (ctx) => {
    console.log(ctx.tenant) // TenantContext { id, name, slug }
  })
  .middleware('tenant')
```

The middleware calls the configured resolver to extract the tenant from the request (subdomain, header, JWT, or path), sets `ctx.tenant`, and scopes all downstream code via AsyncLocalStorage.

If no tenant is resolved, the middleware returns a 404 by default. To allow requests without a tenant:

```ts
// In config/tenancy.ts, the failOnMissing option is available via TenantMiddleware.configure()
```

### Tenant-aware authentication guards

Configure tenant-aware auth guards in `config/auth.ts`:

```ts
import { defineTenantAuthConfig, tenantGuards } from 'adonisjs-tenant/guards'
import { TenantUserProvider } from 'adonisjs-tenant/user_providers'
import { sessionUserProvider } from '@adonisjs/auth/session'
import { tokensUserProvider } from '@adonisjs/auth/access_tokens'
import { basicAuthUserProvider } from '@adonisjs/auth/basic_auth'
import User from '#models/user'

const tenantProvider = new TenantUserProvider(User, 'tenant_user')

const authConfig = defineTenantAuthConfig({
  default: 'web',
  guards: {
    web: tenantGuards.session({
      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
      tenantProvider,
    }),
    api: tenantGuards.accessTokens({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
      tenantProvider,
    }),
    basic: tenantGuards.basicAuth({
      provider: basicAuthUserProvider({
        model: () => import('#models/user'),
      }),
      tenantProvider,
    }),
  },
})

export default authConfig
```

### TenantScope mixin on models

Apply the mixin to Lucid models that should be scoped to the current tenant:

```ts
import { TenantScope } from 'adonisjs-tenant/mixins'

class Post extends TenantScope(BaseModel) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
}

// Queries are automatically scoped to the current tenant
const posts = await Post.all()

// Bypass tenant scoping
const allPosts = await Post.withoutTenantScope().exec()

// Scope to a specific tenant
const tenantPosts = await Post.forTenant('tenant-id').exec()
```

The mixin adds a `tenant_id` column, applies a global query scope on `find` events, and auto-sets `tenant_id` on `save`.

### TenantService for CLI and jobs

Use `TenantService` to access or set the tenant context outside HTTP request lifecycle:

```ts
import { TenantService } from 'adonisjs-tenant'

// Get current tenant
const tenant = TenantService.get()

// Require a tenant context
const tenant = TenantService.require()

// Check if tenant context is active
if (TenantService.isActive()) {
}

// Run a callback within a tenant-scoped context
await TenantService.run(tenant, async () => {
  // any ORM calls here are tenant-scoped
})
```

### withTenantAuthFinder on User model

Replace `withAuthFinder` with `withTenantAuthFinder` to scope credential verification to the current tenant:

```ts
import { withTenantAuthFinder } from 'adonisjs-tenant/mixins'
import { hash } from '@adonisjs/core'

class User extends withTenantAuthFinder(hash) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string
}
```

This combines `TenantScope` with `withAuthFinder`, scopes `findForAuth` queries to the active tenant, and injects `tenant_id` into access tokens on creation.

### TenantAuthenticator extension

During app boot, extend the AuthManager to make `auth.tenant` available on all authenticator instances:

```ts
// providers/app.ts
import { extendAuthenticator } from 'adonisjs-tenant/extensions'

await boot(async () => {
  const authManager = await app.container.make('auth.manager')
  extendAuthenticator(authManager)
})
```

This replaces the default `Authenticator` with `TenantAuthenticator`, which exposes a `tenant` getter.

## Migrations

The configure command publishes two migrations:

- `tenant_user` — a pivot table linking users to tenants
- `add_tenant_id_to_access_tokens` — adds `tenant_id` to the access tokens table

After configure, run the migrations:

```sh
node ace migration:run
```

If you prefer a different table name for the tenant-user pivot, update the `TenantUserProvider` constructor:

```ts
const tenantProvider = new TenantUserProvider(User, 'custom_pivot_table')
```

## Architecture

Tenant context flows through the request lifecycle via AsyncLocalStorage:

1. Incoming HTTP request hits `TenantMiddleware`
2. Middleware calls the configured resolver to extract tenant identity
3. Resolver returns a `TenantContext` object
4. Middleware stores it in AsyncLocalStorage via `runWithTenant()`
5. All downstream code — controllers, guards, ORM — accesses the context via `getTenantContext()` or `TenantService`

```
Request → TenantMiddleware → resolver.resolve() → TenantContext → AsyncLocalStorage
                                                                     ↓
                                              Controller ← auth.tenant
                                                  ↓
                                              Guards, ORM queries
```

## API reference

### Core

| Export                      | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `TenantService`             | Static API for accessing tenant context outside HTTP |
| `getTenantContext()`        | Retrieve current TenantContext or undefined          |
| `getTenantContextOrFail()`  | Retrieve current TenantContext or throw              |
| `runWithTenant(tenant, fn)` | Execute a callback within a tenant-scoped context    |

### Configuration

| Export                     | Description                                   |
| -------------------------- | --------------------------------------------- |
| `defineTenancyConfig()`    | Type-safe configuration for tenancy           |
| `defineTenantAuthConfig()` | Type-safe configuration for tenant-aware auth |

### Middleware

| Export             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `TenantMiddleware` | HTTP middleware that resolves and sets tenant context |

### Guards

| Export                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `tenantGuards.session()`      | Tenant-aware session guard factory       |
| `tenantGuards.accessTokens()` | Tenant-aware access tokens guard factory |
| `tenantGuards.basicAuth()`    | Tenant-aware basic auth guard factory    |

### Resolvers

| Export              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `SubdomainResolver` | Resolve tenant from subdomain                   |
| `HeaderResolver`    | Resolve tenant from HTTP header                 |
| `JwtResolver`       | Resolve tenant from JWT in Authorization header |
| `PathResolver`      | Resolve tenant from first URL path segment      |

### ORM

| Export                 | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `TenantScope`          | Lucid model mixin for tenant-scoped queries              |
| `withTenantAuthFinder` | Lucid model mixin combining auth finder + tenant scoping |

### Extensions

| Export                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `extendAuthenticator()` | Replace Authenticator with TenantAuthenticator |
| `TenantAuthenticator`   | Extended authenticator with `tenant` getter    |

### User providers

| Export               | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `TenantUserProvider` | User provider that scopes lookups to the current tenant |

## Limitations

- **No tenant provisioning** — the library does not create or manage tenants. You must create the tenants table and seed it yourself.
- **Row-level isolation only** — the library scopes data at the row level via `tenant_id`. It does not provide database-level or schema-level isolation.
- **Guest tenants out of scope** — the library assumes all requests without a resolved tenant should return 404. There is no built-in support for routes that behave differently for guest vs identified tenants.

## Troubleshooting

### "auth_access_tokens table does not exist" error during migration

If you see this error when running `node ace migration:run`, it means you haven't set up AdonisJS Auth with the access tokens guard yet.

**Solution:**

```sh
npm install @adonisjs/auth
node ace configure @adonisjs/auth --guard=access_tokens
```

After configuring auth, re-run migrations:

```sh
node ace migration:run
```

Alternatively, if you don't need access tokens authentication, you can skip the access tokens migration by configuring auth first before installing `adonisjs-tenant`.

### User ID is not a string

If your users table uses numeric IDs (which is the default), the migration uses `integer` columns for both `tenant_id` and `user_id` with foreign key constraints. This is the recommended approach for new projects.

If you need to customize the ID types (e.g., UUIDs), modify the published migration after configure:

```sh
node ace configure adonisjs-tenant
# Edit database/migrations/xxx_create_tenant_user_table.ts
# Change integer() to uuid() or string() as needed
```

### No tenant context available error

If you see `TenantNotResolvedError: No tenant context available`, it means you're trying to use tenant-scoped code outside of the middleware chain.

**Common causes:**

1. **Missing middleware** — Ensure routes that need tenant scoping use the middleware:

   ```ts
   router.get('/posts', [PostsController, 'index']).middleware('tenant')
   ```

2. **CLI/Queue context** — Use `TenantService.run()` when outside HTTP:

   ```ts
   await TenantService.run(tenant, async () => {
     // Your tenant-scoped code here
   })
   ```

3. **Missing resolver configuration** — Check `config/tenancy.ts` and ensure your resolver is properly configured.

### configure command skipped access tokens migration

The `node ace configure adonisjs-tenant` command now detects your auth setup and skips the access tokens migration if you haven't configured `@adonisjs/auth` yet. This is intentional — it prevents migration failures.

To add the access tokens migration later:

```sh
node ace make:migration add_tenant_id_to_access_tokens
```

Then add this to the migration:

```ts
this.schema.alterTable('auth_access_tokens', (table) => {
  table.string('tenant_id').nullable().index()
})
```
