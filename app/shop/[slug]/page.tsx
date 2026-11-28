import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getShopData } from '@/app/actions/shop'
import ShopView from './shop-view'

type Search = Promise<{ category?: string; item?: string }>

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }): Promise<Metadata> {
  const { slug } = await params
  const { item: code } = await searchParams
  const data = await getShopData(slug)
  if (!data) return { title: 'Shop' }
  // An item link previews that item on WhatsApp
  const item = code ? data.items.find(i => i.code?.toLowerCase() === code.toLowerCase()) : undefined
  if (item) {
    const image = item.photos?.[0] ?? item.photo_url ?? undefined
    const title = `${item.name} · ${data.business.name}`
    return { title, description: item.description ?? undefined, openGraph: { title, description: item.description ?? undefined, images: image ? [image] : undefined } }
  }
  const image = data.business.photo ?? data.items.find(i => i.photo_url)?.photo_url ?? undefined
  return {
    title: data.business.name,
    description: data.business.shop_description || `Browse and order from ${data.business.name}`,
    openGraph: {
      title: data.business.name,
      description: data.business.shop_description || `Browse and order from ${data.business.name}`,
      images: image ? [image] : undefined,
    },
  }
}

export default async function ShopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const { slug } = await params
  const { category, item } = await searchParams
  const data = await getShopData(slug)
  if (!data) return notFound()
  return (
    <ShopView
      business={data.business}
      items={data.items}
      categories={data.categories}
      initialCategory={category}
      initialItem={item}
    />
  )
}
