import { Suspense, type ReactNode } from 'react'

// `lang` and `category` are read in their own Suspense boundary: shells where
// they are concrete render them statically, and the generic shells show
// `#category-fallback`. This makes the served shell's specialization
// observable from the static part of the response.
async function LayoutImpl({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string; category: string }>
}) {
  const { lang, category } = await params

  return (
    <div>
      <div id="lang">{lang}</div>
      <div id="category">{category}</div>
      {children}
    </div>
  )
}

export default function Layout(props: {
  children: ReactNode
  params: Promise<{ lang: string; category: string }>
}) {
  return (
    <Suspense
      fallback={
        <div id="category-fallback" data-fallback>
          loading category...
        </div>
      }
    >
      <LayoutImpl {...props} />
    </Suspense>
  )
}
