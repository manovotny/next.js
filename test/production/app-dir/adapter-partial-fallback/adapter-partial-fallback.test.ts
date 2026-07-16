import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-partial-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit partial fallback metadata when infra can upgrade the shell', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const withGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/with-gsp/[slug]'
    )
    const withGspRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/with-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/with-gsp/[slug].segments/') &&
        output.pathname !== '/with-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withoutGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/without-gsp/[slug]'
    )
    const withoutGspRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/without-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withoutGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/without-gsp/[slug].segments/') &&
        output.pathname !== '/without-gsp/[slug].segments/_tree.segment.rsc'
    )
    const genericPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/prefix/[one]/[two]'
    )
    const genericPrefixRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/prefix/[one]/[two].segments/_tree.segment.rsc'
    )
    const genericPrefixOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/prefix/[one]/[two].segments/') &&
        output.pathname !== '/prefix/[one]/[two].segments/_tree.segment.rsc'
    )
    const generatedPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/prefix/b/[two]'
    )
    const genericDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/dashed/[my-slug]/[two]'
    )
    const generatedDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/dashed/b/[two]'
    )

    expect(withGspPrerender).toBeDefined()
    expect(withGspRouteTreePrerender).toBeDefined()
    expect(withGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(withoutGspPrerender).toBeDefined()
    expect(withoutGspRouteTreePrerender).toBeDefined()
    expect(withoutGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(genericPrefixPrerender).toBeDefined()
    expect(genericPrefixRouteTreePrerender).toBeDefined()
    expect(genericPrefixOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(generatedPrefixPrerender).toBeDefined()
    expect(genericDashedPrerender).toBeDefined()
    expect(generatedDashedPrerender).toBeDefined()

    expect(withGspPrerender.config.partialFallback).toBe(true)
    expect(withGspPrerender.config.allowQuery).toEqual(['nxtPslug'])
    expect(withGspRouteTreePrerender.config.partialFallback).toBe(true)
    expect(withGspRouteTreePrerender.config.allowQuery).toEqual(['nxtPslug'])
    for (const output of withGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPslug'])
    }

    expect(withoutGspPrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspPrerender.config.allowQuery).toEqual([])
    expect(withoutGspRouteTreePrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspRouteTreePrerender.config.allowQuery).toEqual([])
    for (const output of withoutGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBeUndefined()
      expect(output.config.allowQuery).toEqual([])
    }

    expect(genericPrefixPrerender.config.partialFallback).toBe(true)
    expect(genericPrefixPrerender.config.allowQuery).toEqual(['nxtPone'])
    expect(genericPrefixRouteTreePrerender.config.partialFallback).toBe(true)
    expect(genericPrefixRouteTreePrerender.config.allowQuery).toEqual([
      'nxtPone',
    ])
    for (const output of genericPrefixOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPone'])
    }

    expect(generatedPrefixPrerender.config.partialFallback).toBeUndefined()
    expect(generatedPrefixPrerender.config.allowQuery).toEqual([])

    expect(genericDashedPrerender.config.partialFallback).toBe(true)
    expect(genericDashedPrerender.config.allowQuery).toEqual(['nxtPmy-slug'])

    expect(generatedDashedPrerender.config.partialFallback).toBeUndefined()
    expect(generatedDashedPrerender.config.allowQuery).toEqual([])
  })

  it('should exclude never-prerenderable params from allowQuery for blocking routes with empty shells', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const genericEmptyShellPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/[one]/[two]'
    )
    const genericEmptyShellDataPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/[one]/[two].rsc'
    )
    const genericEmptyShellSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/empty-shell/[one]/[two].segments/')
    )
    const generatedEmptyShellPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/empty-shell/a/[two]'
    )

    expect(genericEmptyShellPrerender).toBeDefined()
    expect(genericEmptyShellDataPrerender).toBeDefined()
    expect(genericEmptyShellSegmentPrerenders.length).toBeGreaterThan(0)
    expect(generatedEmptyShellPrerender).toBeDefined()

    // The generic route's empty build-time shell downgraded it to a blocking
    // route (no servable fallback), but `two` is still never provided by
    // generateStaticParams: an on-demand render must only complete `one`, so
    // only `one` may be part of the cache key. Including `two` would create a
    // cache entry per `two` value and resolve `two` into cached content.
    expect(genericEmptyShellPrerender.config.allowQuery).toEqual(['nxtPone'])
    expect(genericEmptyShellDataPrerender.config.allowQuery).toEqual([
      'nxtPone',
    ])
    for (const output of genericEmptyShellSegmentPrerenders) {
      expect(output.config.allowQuery).toEqual(['nxtPone'])
    }

    // The generated route is already the most specific prerenderable shell
    // (only the never-prerenderable `two` remains), so it stays a single
    // shared entry.
    expect(generatedEmptyShellPrerender.config.partialFallback).toBeUndefined()
    expect(generatedEmptyShellPrerender.config.allowQuery).toEqual([])
  })
})
