import crypto from 'crypto'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { splitResponseWithPPRSentinel } from 'e2e-utils/ppr'
import { retry } from 'next-test-utils'

type NextInstance = ReturnType<typeof nextTestSetup>['next']

function createSplitHTMLFetcher(next: NextInstance) {
  return async function fetchSplitHTML(pathname: string) {
    let response: Awaited<ReturnType<typeof next.fetch>> | undefined
    const [staticPart, dynamicPart] = await splitResponseWithPPRSentinel(
      async () => {
        response = await next.fetch(pathname)
        expect(response.status).toBe(200)

        if (!response.body) {
          throw new Error(`Expected a streamed response body for ${pathname}`)
        }

        return response.body
      }
    )

    return {
      response: response!,
      dynamicPart,
      static$: cheerio.load(staticPart),
    }
  }
}

function uniqueId() {
  return `id-${crypto.randomUUID()}`
}

function uniqueCategory() {
  return `cat-${crypto.randomUUID()}`
}

// Both fixture routes are `/[lang]/[category]/[id]` trees where
// `generateStaticParams` covers `lang` and `category` but never `id`: `id`
// must never resolve into a cached shell nor participate in a cache key.
//
// - `/empty-shell/...` reads all params without a Suspense boundary, so every
//   build-time shell is empty and the intermediate shells downgrade to
//   blocking routes. The cache key is only observable through cache-status
//   headers, since the cached shells have no content.
// - `/non-empty-shell/...` wraps its param reads in Suspense boundaries, so
//   shells have static content and the served shell's specialization
//   (`#category` resolved or not) makes the cache key observable through
//   content.
//
// These tests assert the desired behavior for ALL deployed infra: they are
// expected to fail on builds that don't yet implement it (at the time of
// writing, both builder paths mishandle empty shells, and the non-adapter
// builder does not implement intermediate-shell specialization at all).
describe('partial-fallback-empty-shell', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  const fetchSplitHTML = createSplitHTMLFetcher(next)

  describe('empty shell', () => {
    it('should keep a never-prerenderable param out of the cached shell', async () => {
      const id = uniqueId()
      const pathname = `/empty-shell/en/electronics/${id}`

      // Prime: the first request for this category creates the on-demand
      // cache entry (a blocking render, since the build-time shell was
      // empty).
      await fetchSplitHTML(pathname)

      // Repeat requests are served from the entry the first request created.
      // The id must arrive in the dynamic (resumed) part of the response,
      // never in the cached static part before the PPR boundary sentinel.
      await retry(async () => {
        const { static$, dynamicPart } = await fetchSplitHTML(pathname)

        expect(static$('#id').length).toBe(0)
        expect(dynamicPart).toContain(`<div id="id">${id}</div>`)
      })
    })

    // These assertions observe the platform cache key through its behavior:
    // a request for a never-before-seen param value can only be served from
    // the cache if that param is excluded from the cache key. The cached
    // shells are empty, so cache-status headers are the only observable;
    // they only exist on deployed infra.
    if (isNextDeploy) {
      it('should share the cache entry across ids (id excluded from the cache key)', async () => {
        // Use a fresh category so this test owns its cache entry.
        const category = uniqueCategory()
        const primedPathname = `/empty-shell/en/${category}/${uniqueId()}`

        // Prime the entry and wait until repeat requests for the primed URL
        // report a cache hit, so the probe below isn't racing entry creation.
        await retry(async () => {
          const response = await next.fetch(primedPathname)
          expect(response.status).toBe(200)
          expect(response.headers.get('x-vercel-cache')).not.toBe('MISS')
        })

        // A never-before-requested id must be served from the entry the
        // primed request created. Each attempt uses a fresh id: if `id` is
        // wrongly part of the cache key, every attempt is a MISS.
        await retry(async () => {
          const response = await next.fetch(
            `/empty-shell/en/${category}/${uniqueId()}`
          )
          expect(response.status).toBe(200)
          expect(response.headers.get('x-vercel-cache')).not.toBe('MISS')
        })
      })

      it('should not share cache entries across categories (category included in the cache key)', async () => {
        // Prime one category and wait until it is served from the cache, so
        // a hit for another category below could only come from key
        // collapse.
        const primedPathname = `/empty-shell/en/${uniqueCategory()}/1`
        await retry(async () => {
          const response = await next.fetch(primedPathname)
          expect(response.status).toBe(200)
          expect(response.headers.get('x-vercel-cache')).not.toBe('MISS')
        })

        // `category` is a `generateStaticParams` candidate, so it must
        // remain part of the cache key: the first request for a fresh
        // category must not be served from another category's entry. This
        // guards against over-collapsing the cache key (e.g. an empty
        // allowQuery), which would serve one shared entry for every
        // category. Each attempt uses a fresh category, so a wrongly-shared
        // entry fails every attempt.
        await retry(async () => {
          const response = await next.fetch(
            `/empty-shell/en/${uniqueCategory()}/1`
          )
          expect(response.status).toBe(200)
          expect(response.headers.get('x-vercel-cache')).toBe('MISS')
        })
      })
    }
  })

  describe('non-empty shell', () => {
    it('should keep a never-prerenderable param out of the cached shell', async () => {
      const id = uniqueId()
      const pathname = `/non-empty-shell/en/electronics/${id}`

      // Prime: the first request for this category creates or specializes
      // the cache entry.
      await fetchSplitHTML(pathname)

      // Repeat requests are served from a cached shell. The static content
      // must be present (the shell is actually non-empty, i.e. this variant
      // tests what it claims), and the id must only ever arrive in the
      // dynamic (resumed) part.
      await retry(async () => {
        const { static$, dynamicPart } = await fetchSplitHTML(pathname)

        expect(static$('#static').text()).toBe('static page content')
        expect(static$('#id').length).toBe(0)
        expect(dynamicPart).toContain(`<div id="id">${id}</div>`)
      })
    })

    it('should share the specialized shell across ids (id excluded from the cache key)', async () => {
      // Use a fresh category so this test owns its cache entry. Prime until
      // the specialized shell (category resolved in the static part) is
      // being served for this category.
      const category = uniqueCategory()
      await retry(async () => {
        const { static$ } = await fetchSplitHTML(
          `/non-empty-shell/en/${category}/${uniqueId()}`
        )
        expect(static$('#category').text()).toBe(category)
      })

      // A never-before-requested id must be served from the specialized
      // shell the priming created: `category` is resolved in the static part
      // of its very first response, which is only possible if `id` is
      // excluded from the cache key. Each attempt uses a fresh id: if `id`
      // is wrongly part of the cache key, every attempt starts from the
      // generic shell.
      await retry(async () => {
        const { static$ } = await fetchSplitHTML(
          `/non-empty-shell/en/${category}/${uniqueId()}`
        )
        expect(static$('#category').text()).toBe(category)
        expect(static$('#id').length).toBe(0)
      })
    })

    it('should not serve a specialized shell across categories (category included in the cache key)', async () => {
      // Prime one category until its specialized shell is served.
      const primedCategory = uniqueCategory()
      await retry(async () => {
        const { static$ } = await fetchSplitHTML(
          `/non-empty-shell/en/${primedCategory}/${uniqueId()}`
        )
        expect(static$('#category').text()).toBe(primedCategory)
      })

      // The first request for a fresh category must serve the generic shell
      // (category unresolved), never another category's specialized shell.
      // Each attempt uses a fresh category, so a wrongly-shared entry fails
      // every attempt.
      await retry(async () => {
        const { static$ } = await fetchSplitHTML(
          `/non-empty-shell/en/${uniqueCategory()}/1`
        )
        expect(static$('#category').length).toBe(0)
        expect(static$('#category-fallback').length).toBe(1)
      })
    })
  })
})
