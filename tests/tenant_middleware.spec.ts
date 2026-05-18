import { test } from '@japa/runner'
import { TenantMiddleware } from '../src/middleware/tenant_middleware.js'
import { getTenantContext } from '../src/tenant_context.js'
import type { TenantResolverContract, TenantContext } from '../src/types.js'
import type { HttpContext } from '@adonisjs/core/http'

const acme: TenantContext = { id: 1, name: 'Acme Corp', slug: 'acme' }

test.group('TenantMiddleware', () => {
  function fakeResolver(returnValue: TenantContext | null): TenantResolverContract {
    return { resolve: async () => returnValue }
  }

  function createContext(): HttpContext {
    const response = {
      status: () => response,
      send: () => {},
    }
    return {
      request: {
        hostname: () => 'example.com',
        header: () => undefined,
        url: () => '/',
      },
      response,
      logger: {} as any,
      containerResolver: {} as any,
      tenant: undefined,
    } as unknown as HttpContext
  }

  test('set ctx.tenant when tenant resolved and call next', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(acme),
      failOnMissing: true,
    })
    const middleware = new TenantMiddleware()

    let nextCalled = false
    const ctx = createContext()

    await middleware.handle(ctx, async () => {
      nextCalled = true
      assert.deepEqual(ctx.tenant, acme)

      const alsContext = getTenantContext()
      assert.isNotNull(alsContext)
      assert.equal(alsContext!.id, acme.id)
      assert.equal(alsContext!.name, acme.name)
    })

    assert.isTrue(nextCalled)
    assert.deepEqual(ctx.tenant, acme)
  })

  test('set ctx.tenant when tenant resolved with default failOnMissing', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(acme),
    })
    const middleware = new TenantMiddleware()

    let nextCalled = false
    const ctx = createContext()

    await middleware.handle(ctx, async () => {
      nextCalled = true
      assert.deepEqual(ctx.tenant, acme)
    })

    assert.isTrue(nextCalled)
    assert.deepEqual(ctx.tenant, acme)
  })

  test('return 404 when tenant missing and failOnMissing is true', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(null),
      failOnMissing: true,
    })
    const middleware = new TenantMiddleware()

    let nextCalled = false
    const ctx = createContext()
    let statusCode = 0
    let body = ''
    ctx.response.status = (code: number) => {
      statusCode = code
      return ctx.response
    }
    ctx.response.send = (msg: string) => {
      body = msg
    }

    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isFalse(nextCalled)
    assert.equal(statusCode, 404)
    assert.equal(body, 'Tenant not found')
    assert.isUndefined(ctx.tenant)
  })

  test('return 404 when tenant missing and failOnMissing defaults to true', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(null),
    })
    const middleware = new TenantMiddleware()

    let nextCalled = false
    const ctx = createContext()
    let statusCode = 0
    ctx.response.status = (code: number) => {
      statusCode = code
      return ctx.response
    }

    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isFalse(nextCalled)
    assert.equal(statusCode, 404)
  })

  test('call next when tenant missing and failOnMissing is false', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(null),
      failOnMissing: false,
    })
    const middleware = new TenantMiddleware()

    let nextCalled = false
    const ctx = createContext()

    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isTrue(nextCalled)
    assert.isUndefined(ctx.tenant)
  })

  test('getTenantContext is undefined after middleware completes', async ({ assert }) => {
    TenantMiddleware.configure({
      resolver: fakeResolver(acme),
    })
    const middleware = new TenantMiddleware()

    const ctx = createContext()
    await middleware.handle(ctx, async () => {})

    assert.isUndefined(getTenantContext())
  })
})
