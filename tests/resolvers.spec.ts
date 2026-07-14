import { test } from '@japa/runner'
import { SubdomainResolver } from '../src/resolvers/subdomain_resolver.js'
import { HeaderResolver } from '../src/resolvers/header_resolver.js'
import { JwtResolver } from '../src/resolvers/jwt_resolver.js'
import { PathResolver } from '../src/resolvers/path_resolver.js'
import type { HttpContext } from '@adonisjs/http-server'

test.group('SubdomainResolver', () => {
  function mockContext(hostname: string | null): HttpContext {
    return {
      request: {
        hostname: () => hostname,
        header: () => undefined,
        url: () => '/',
      },
      response: {} as any,
      logger: {} as any,
      containerResolver: {} as any,
    } as unknown as HttpContext
  }

  test('resolve tenant from subdomain with tenants map', async ({ assert }) => {
    const resolver = new SubdomainResolver({
      tenants: {
        'tenant-a': { id: 'ta-1', name: 'Tenant A' },
      },
    })
    const ctx = mockContext('tenant-a.example.com')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'ta-1')
    assert.equal(result!.name, 'Tenant A')
    assert.equal(result!.slug, 'tenant-a')
  })

  test('return null when no matching subdomain in map', async ({ assert }) => {
    const resolver = new SubdomainResolver({
      tenants: {
        'tenant-a': { id: 'ta-1', name: 'Tenant A' },
      },
    })
    const ctx = mockContext('unknown.example.com')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when hostname is null', async ({ assert }) => {
    const resolver = new SubdomainResolver()
    const ctx = mockContext(null)
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when hostname has no subdomain', async ({ assert }) => {
    const resolver = new SubdomainResolver()
    const ctx = mockContext('localhost')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('use lookup callback when provided', async ({ assert }) => {
    const resolver = new SubdomainResolver({
      lookup: (subdomain) => {
        if (subdomain === 'my-tenant') {
          return { id: 42, name: 'My Tenant', slug: subdomain }
        }
        return null
      },
    })
    const ctx = mockContext('my-tenant.example.com')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 42)
    assert.equal(result!.name, 'My Tenant')
    assert.equal(result!.slug, 'my-tenant')
  })

  test('support async lookup callback', async ({ assert }) => {
    const resolver = new SubdomainResolver({
      lookup: async (subdomain) => {
        return { id: subdomain.toUpperCase(), name: subdomain, slug: subdomain }
      },
    })
    const ctx = mockContext('foo.example.com')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'FOO')
  })
})

test.group('HeaderResolver', () => {
  function mockContext(headerValue: string | undefined): HttpContext {
    return {
      request: {
        hostname: () => null,
        header: (key: string) => (key === 'X-Tenant-ID' ? headerValue : undefined),
        url: () => '/',
      },
      response: {} as any,
      logger: {} as any,
      containerResolver: {} as any,
    } as unknown as HttpContext
  }

  test('rejects an unvalidated header value', async ({ assert }) => {
    const resolver = new HeaderResolver()
    const ctx = mockContext('tenant-42')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when header is missing', async ({ assert }) => {
    const resolver = new HeaderResolver()
    const ctx = mockContext(undefined)
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('use custom header name', async ({ assert }) => {
    const ctx = {
      request: {
        hostname: () => null,
        header: (key: string) => (key === 'X-My-Tenant' ? 'custom-tenant' : undefined),
        url: () => '/',
      },
    } as unknown as HttpContext

    const resolver = new HeaderResolver({
      header: 'X-My-Tenant',
      tenants: { 'custom-tenant': { id: 1, name: 'Custom' } },
    })
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.slug, 'custom-tenant')
  })

  test('use lookup callback to resolve tenant', async ({ assert }) => {
    const resolver = new HeaderResolver({
      lookup: (headerValue) => ({
        id: headerValue,
        name: `Tenant ${headerValue}`,
        slug: headerValue.toLowerCase(),
      }),
    })
    const ctx = mockContext('ACME')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'ACME')
    assert.equal(result!.name, 'Tenant ACME')
    assert.equal(result!.slug, 'acme')
  })

  test('lookup returning null means no tenant', async ({ assert }) => {
    const resolver = new HeaderResolver({
      lookup: () => null,
    })
    const ctx = mockContext('unknown')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('use tenants map to resolve tenant', async ({ assert }) => {
    const resolver = new HeaderResolver({
      tenants: {
        'tenant-1': { id: 1, name: 'Acme' },
        'tenant-2': { id: 2, name: 'Beta' },
      },
    })
    const ctx = mockContext('tenant-1')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 1)
    assert.equal(result!.name, 'Acme')
    assert.equal(result!.slug, 'tenant-1')
  })

  test('tenants map returns null for unknown header value', async ({ assert }) => {
    const resolver = new HeaderResolver({
      tenants: { 'tenant-1': { id: 1, name: 'Acme' } },
    })
    const ctx = mockContext('unknown-tenant')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('lookup takes precedence over tenants map', async ({ assert }) => {
    const resolver = new HeaderResolver({
      tenants: { x: { id: 1, name: 'From Map' } },
      lookup: (value) => ({ id: value, name: 'From Lookup', slug: value }),
    })
    const ctx = mockContext('x')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.name, 'From Lookup')
  })
})

test.group('JwtResolver', () => {
  function base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url')
  }

  function makeToken(payload: Record<string, any>): string {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const body = base64UrlEncode(JSON.stringify(payload))
    return `${header}.${body}.fake_signature`
  }

  function mockContext(authHeader: string | undefined): HttpContext {
    return {
      request: {
        hostname: () => null,
        header: (key: string) => (key === 'Authorization' ? authHeader : undefined),
        url: () => '/',
      },
      response: {} as any,
      logger: {} as any,
      containerResolver: {} as any,
    } as unknown as HttpContext
  }

  test('resolve tenant from JWT with default tenant_id claim', async ({ assert }) => {
    const token = makeToken({ tenant_id: 'tnt-3', sub: 'user-1' })
    const resolver = new JwtResolver()
    const ctx = mockContext(`Bearer ${token}`)
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'tnt-3')
    assert.equal(result!.slug, 'tnt-3')
  })

  test('return null when Authorization header is missing', async ({ assert }) => {
    const resolver = new JwtResolver()
    const ctx = mockContext(undefined)
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when Authorization is not Bearer', async ({ assert }) => {
    const resolver = new JwtResolver()
    const ctx = mockContext('Basic dXNlcjpwYXNz')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when JWT has no tenant claim', async ({ assert }) => {
    const token = makeToken({ sub: 'user-1' })
    const resolver = new JwtResolver()
    const ctx = mockContext(`Bearer ${token}`)
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when token is malformed', async ({ assert }) => {
    const resolver = new JwtResolver()
    const ctx = mockContext('Bearer not-a-valid-token')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('use custom tenant claim key', async ({ assert }) => {
    const token = makeToken({ org_id: 'org-abc' })
    const resolver = new JwtResolver({ tenantClaim: 'org_id' })
    const ctx = mockContext(`Bearer ${token}`)
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'org-abc')
  })

  test('use builder callback for custom TenantContext', async ({ assert }) => {
    const token = makeToken({ tenant_slug: 'my-org', tenant_name: 'My Organization' })
    const resolver = new JwtResolver({
      tenantClaim: 'tenant_slug',
      builder: (payload) => {
        return { id: payload.tenant_slug, name: payload.tenant_name, slug: payload.tenant_slug }
      },
    })
    const ctx = mockContext(`Bearer ${token}`)
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.name, 'My Organization')
    assert.equal(result!.slug, 'my-org')
  })
})

test.group('PathResolver', () => {
  function mockContext(url: string): HttpContext {
    return {
      request: {
        hostname: () => null,
        header: () => undefined,
        url: () => url,
      },
      response: {} as any,
      logger: {} as any,
      containerResolver: {} as any,
    } as unknown as HttpContext
  }

  test('resolve tenant from first path segment with tenants map', async ({ assert }) => {
    const resolver = new PathResolver({
      tenants: {
        'tenant-b': { id: 'tb-2', name: 'Tenant B' },
      },
    })
    const ctx = mockContext('/tenant-b/users')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.id, 'tb-2')
    assert.equal(result!.name, 'Tenant B')
    assert.equal(result!.slug, 'tenant-b')
  })

  test('return null when no matching path segment in map', async ({ assert }) => {
    const resolver = new PathResolver({
      tenants: {
        'tenant-b': { id: 'tb-2', name: 'Tenant B' },
      },
    })
    const ctx = mockContext('/unknown/path')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('return null when url is root path', async ({ assert }) => {
    const resolver = new PathResolver()
    const ctx = mockContext('/')
    const result = await resolver.resolve(ctx)
    assert.isNull(result)
  })

  test('use lookup callback when provided', async ({ assert }) => {
    const resolver = new PathResolver({
      lookup: (segment) => {
        if (segment === 'org-xyz') {
          return { id: 'org-xyz', name: 'Organization XYZ', slug: segment }
        }
        return null
      },
    })
    const ctx = mockContext('/org-xyz/settings')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.name, 'Organization XYZ')
  })

  test('strip query string from url', async ({ assert }) => {
    const resolver = new PathResolver({
      tenants: {
        'my-tenant': { id: 'mt', name: 'My Tenant' },
      },
    })
    const ctx = mockContext('/my-tenant/dashboard?page=1')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.slug, 'my-tenant')
  })

  test('use async lookup callback', async ({ assert }) => {
    const resolver = new PathResolver({
      lookup: async (segment) => {
        return { id: segment, name: segment.toUpperCase(), slug: segment }
      },
    })
    const ctx = mockContext('/hello-world')
    const result = await resolver.resolve(ctx)
    assert.isNotNull(result)
    assert.equal(result!.name, 'HELLO-WORLD')
  })
})
