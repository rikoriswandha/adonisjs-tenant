import { test } from '@japa/runner'

test.group('Package exports', () => {
  test('main entrypoint exports configure and stubsRoot', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.configure)
    assert.isDefined(mod.stubsRoot)
  })

  test('main entrypoint exports TenantService', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.TenantService)
    assert.isFunction(mod.TenantService.get)
    assert.isFunction(mod.TenantService.require)
    assert.isFunction(mod.TenantService.run)
    assert.isFunction(mod.TenantService.isActive)
    assert.isFunction(mod.TenantService.currentId)
  })

  test('main entrypoint exports tenant context helpers', async ({ assert }) => {
    const { getTenantContext, getTenantContextOrFail, runWithTenant, TenantNotResolvedError } =
      await import('../index.ts')
    assert.isFunction(getTenantContext)
    assert.isFunction(getTenantContextOrFail)
    assert.isFunction(runWithTenant)
    assert.isFunction(TenantNotResolvedError)
  })

  test('main entrypoint exports defineTenancyConfig', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.defineTenancyConfig)
  })

  test('main entrypoint exports TenantMiddleware', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.TenantMiddleware)
  })

  test('main entrypoint exports TenantScope', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.TenantScope)
  })

  test('main entrypoint exports auth guard functions', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.defineTenantAuthConfig)
    assert.isObject(mod.tenantGuards)
    assert.isFunction(mod.tenantGuards.session)
    assert.isFunction(mod.tenantGuards.accessTokens)
    assert.isFunction(mod.tenantGuards.basicAuth)
    assert.isFunction(mod.tenantAwareSessionGuard)
    assert.isFunction(mod.tenantAwareAccessTokensGuard)
    assert.isFunction(mod.tenantAwareBasicAuthGuard)
  })

  test('main entrypoint exports extendAuthenticator and TenantAuthenticator', async ({
    assert,
  }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.extendAuthenticator)
    assert.isFunction(mod.TenantAuthenticator)
  })

  test('main entrypoint exports TenantUserProvider', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.TenantUserProvider)
  })

  test('main entrypoint exports all resolvers', async ({ assert }) => {
    const mod = await import('../index.ts')
    assert.isFunction(mod.SubdomainResolver)
    assert.isFunction(mod.HeaderResolver)
    assert.isFunction(mod.JwtResolver)
    assert.isFunction(mod.PathResolver)
  })

  test('subpath: ./middleware default-exports TenantMiddleware for lazy loading', async ({
    assert,
  }) => {
    // Dynamic import intentionally exercises the lazy middleware module boundary.
    const mod = await import('../src/middleware/tenant_middleware.ts')
    assert.isFunction(mod.default)
    assert.strictEqual(mod.default, mod.TenantMiddleware)
  })

  test('subpath: ./guards exports defineTenantAuthConfig and tenantGuards', async ({ assert }) => {
    const mod = await import('../src/guards/define_config.ts')
    assert.isFunction(mod.defineTenantAuthConfig)
    assert.isObject(mod.tenantGuards)
    assert.isFunction(mod.tenantGuards.session)
    assert.isFunction(mod.tenantGuards.accessTokens)
    assert.isFunction(mod.tenantGuards.basicAuth)
    assert.isFunction(mod.tenantAwareSessionGuard)
    assert.isFunction(mod.tenantAwareAccessTokensGuard)
    assert.isFunction(mod.tenantAwareBasicAuthGuard)
  })

  test('subpath: ./mixins exports TenantScope', async ({ assert }) => {
    const mod = await import('../src/mixins/tenant_scope.ts')
    assert.isFunction(mod.TenantScope)
  })

  test('subpath: ./resolvers exports all resolver implementations', async ({ assert }) => {
    const mod = await import('../src/resolvers/index.ts')
    assert.isFunction(mod.SubdomainResolver)
    assert.isFunction(mod.HeaderResolver)
    assert.isFunction(mod.JwtResolver)
    assert.isFunction(mod.PathResolver)
  })

  test('subpath: ./extensions exports extendAuthenticator', async ({ assert }) => {
    const mod = await import('../src/extensions/authenticator.ts')
    assert.isFunction(mod.extendAuthenticator)
    assert.isFunction(mod.TenantAuthenticator)
  })

  test('subpath: ./user_providers exports TenantUserProvider', async ({ assert }) => {
    const mod = await import('../src/user_providers/tenant_user_provider.ts')
    assert.isFunction(mod.TenantUserProvider)
  })
})
