import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getShopData } from '@/app/actions/shop'
import ShopView from './shop-view'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getShopData(slug)
  if (!data) return { title: 'Shop' }
  const image = data.business.photo ?? data.items.find(i => i.photo_url)?.photo_url ?? undefined
  return {
    title: data.business.name,
    description: `Browse and order from ${data.business.name}`,
    openGraph: {
      title: data.business.name,
      description: `Browse and order from ${data.business.name}`,
      images: image ? [image] : undefined,
    },
  }
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getShopData(slug)
  if (!data) return notFound()
  return <ShopView business={data.business} items={data.items} categories={data.categories} />
}
