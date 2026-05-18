# adonisjs-tenant — Code Review

**Date**: 2026-05-17  
**Tests**: 126 passed / 126  
**Typecheck**: 1 error in `configure.ts:41`  

---

## Findings

### 1. [HIGH] configure command registers non-exported package subpaths

**Files**: `configure.ts:73`, `configure.ts:79`, `package.json:16-24`

The `node ace configure adonisjs-tenant` command writes:

```
adonisjs-tenant/tenant_provider
adonisjs-tenant/tenant_middleware
```

But `package.json` exports these as:

```
./providers/tenancy_provider
./middleware
```

No export alias exists for the shorter paths. Any app running `configure` will get broken provider and middleware references. Fix the configure paths to match actual exports, or add matching export aliases in `package.json`.

---

### 2. [HIGH] TypeScript type error in configure.ts

**Files**: `configure.ts:40-41`

```
error TS2345: Argument of type 'URL' is not assignable to parameter of type 'string'.
```

`command.app.appRoot` returns a `URL` in AdonisJS v7, but `detectAuthConfig()` passes it directly to `path.join()`. This also risks runtime path bugs. Fix: convert via `fileURLToPath(command.app.appRoot)` or change `detectAuthConfig` to accept `URL`.

---

### 3. [MEDIUM] README auth config passes string provider where guard expects object

**Files**: `README.md:124-137`, `src/guards/tenant_aware_session.ts:63-93`

README shows:
```ts
web: tenantGuards.session({ provider: 'user', tenantProvider }),
```

Guard factories resolve the provider via `config.provider.resolver(app)` if it looks like a `ConfigProvider`, or use it directly. A string `'user'` has no `resolver` property, so it falls through — but then has no `findById`/`verifyCredentials`. Either add provider-name resolution through Adonis auth config, or fix the README to pass the real user provider.

---

### 4. [HIGH] TenantScope only hooks `find` and `fetch` — update/delete/aggregates un-scoped

**Files**: `src/mixins/tenant_scope.ts:72-92`

The mixin registers `before('find')` and `before('fetch')` hooks. Lucid operations like `.query().update(...)`, `.query().delete()`, `.query().where(...).paginate(...)`, relationship queries, and raw queries can bypass tenant filtering entirely. The README claims "queries are automatically scoped to the current tenant" — this is false for anything beyond basic select operations.

Fix: use Lucid global scopes (if available in v22) or register hooks for all query events that matter (`update`, `delete`, `paginate`, etc.).

---

### 5. [MEDIUM] before('save') allows cross-tenant writes via explicit tenant_id

**Files**: `src/mixins/tenant_scope.ts:65-69`

```ts
if (!model.tenant_id) {
  const ctx = getTenantContextOrFail()
  model.tenant_id = ctx.id
}
```

Code inside tenant A's context can set `model.tenant_id = 'tenant-b-id'` and the hook silently allows it. If cross-tenant writes need an opt-out, use an explicit bypass flag (like `withoutTenantScope()`). Otherwise, reject mismatched `tenant_id` in the save hook.

---

### 6. [MEDIUM] TenantUserProvider requires undocumented Lucid relationship

**Files**: `src/user_providers/tenant_user_provider.ts:25`, `README.md:128`, `stubs/migrations/tenant_user.stub`

Default usage:
```ts
new TenantUserProvider(User, 'tenant_user')
```

Calls `whereHas('tenant_user', ...)` which requires a Lucid relationship named `tenant_user` on the User model. The migration stub creates the pivot table but does not document or enforce the required relationship. This fails silently on first use for any user who follows the README.

Fix: document the required `@hasManyThrough`/`@belongsToMany` relationship shape, or make the provider query the pivot table directly instead of relying on `whereHas`.

---

### 7. [MEDIUM] withTenantAuthFinder binds accessTokens to wrong model

**Files**: `src/mixins/tenant_auth_finder.ts:69`

```ts
static accessTokens = TenantDbAccessTokensProvider.forModel(this as unknown as LucidModel)
```

`this` at class-definition time is `TenantAuthFinder`, an intermediate base class. Multiple concrete models extending it may share the same bound `accessTokens` metadata. Adonis `withAuthFinder` initializes this property per concrete subclass — this mixin should follow the same pattern.

---

### 8. [LOW] JwtResolver: atob on base64url without padding normalization

**Files**: `src/resolvers/jwt_resolver.ts:44-46`

```ts
const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
const decoded = atob(base64)
```

Standard JWT Base64url omits padding. Node `atob` requires valid Base64, so tokens whose payload decodes to a length not divisible by 4 will throw. Add padding normalization: `base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')`.

---

## Verification Summary

| Check | Result |
|---|---|
| `npm test` | 126/126 passed |
| `npm run typecheck` | failed — `configure.ts:41` TS2345 |
| LSP diagnostics | 1 error (same) |
| Test type | Mostly mocked, does not exercise real Lucid query paths |

The test suite is broad but shallow: tenant-scope tests reimplement hook logic manually rather than driving real Lucid queries, so the update/delete isolation gaps (finding 4) are not caught.
