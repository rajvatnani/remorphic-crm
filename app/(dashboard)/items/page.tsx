import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import ModuleOff from '@/components/orders/module-off'
import ItemList from './item-list'
import type { Item } from '@/types'

export default async function ItemsPage() {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx
  if (!enabledModules(business).orders) return <ModuleOff title="Items" />

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('business_id', business.id)
    .order('name')

  return <ItemList items={(items ?? []) as Item[]} />
}
