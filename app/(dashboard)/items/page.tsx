import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import ModuleOff from '@/components/orders/module-off'
import ItemList from './item-list'
import type { Item, ItemCategory } from '@/types'

export default async function ItemsPage() {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx
  if (!enabledModules(business).orders) return <ModuleOff title="Items" />

  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from('items').select('*').eq('business_id', business.id).order('name'),
    supabase.from('item_categories').select('id, name, position').eq('business_id', business.id).order('position').order('name'),
  ])

  return (
    <ItemList
      items={(items ?? []) as Item[]}
      categories={(categories ?? []) as ItemCategory[]}
      businessId={business.id}
      defaultLowStock={business.default_low_stock ?? 2}
      shopPath={business.shop_enabled ? `/shop/${business.slug}` : null}
    />
  )
}
