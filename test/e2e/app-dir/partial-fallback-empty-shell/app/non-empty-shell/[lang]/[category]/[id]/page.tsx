import { Suspense } from 'react'

// The non-empty-shell variant of the fixture: static page content plus
// Suspense boundaries around all param reads, so every shell for this route
// contains static content and no empty-shell downgrade happens.
//
// `generateStaticParams` covers `lang` and `category` but never `id`, so `id`
// must never resolve into a cached shell and must never be part of a cache
// key: only `lang` and `category` can be completed into more specific shells.
export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'en', category: 'shoes' }]
}

async function Id({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <div id="id">{id}</div>
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string; id: string }>
}) {
  return (
    <div>
      <div id="static">static page content</div>
      <Suspense
        fallback={
          <div id="id-fallback" data-fallback>
            loading id...
          </div>
        }
      >
        <Id params={params} />
      </Suspense>
    </div>
  )
}
