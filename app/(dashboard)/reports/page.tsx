import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import ModuleOff from '@/components/orders/module-off'
import { RANGES, type RangeKey, type ReportItem, type ReportOrder } from '@/lib/reports'
import ReportsView, { IDLE_DAYS } from './reports-view'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; idle?: string }>
}) {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx
  if (!enabledModules(business).orders) return <ModuleOff title="Reports" />

  const sp = await searchParams
  const range: RangeKey = RANGES.some(r => r.key === sp.range) ? (sp.range as RangeKey) : '30d'
  const idle = IDLE_DAYS.find(d => String(d) === sp.idle) ?? 60

  const [{ data: orderRows }, { data: itemRows }, { data: categoryRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_no, status, created_at, paid_paise, delivery_paise, discount_paise, customer_id, customers(id, name, phone), order_items(item_id, name, qty, price_paise, cost_paise)')
      .eq('business_id', business.id)
      .neq('status', 'cancelled')
      .order('created_at'),
    supabase.from('items').select('id, name, code, price_paise, cost_paise, stock, active, category_id').eq('business_id', business.id).order('name'),
    supabase.from('item_categories').select('id, name').eq('business_id', business.id).order('position').order('name'),
  ])

  return (
    <ReportsView
      orders={(orderRows ?? []) as ReportOrder[]}
      items={(itemRows ?? []) as ReportItem[]}
      categories={(categoryRows ?? []) as { id: string; name: string }[]}
      customerLabel={business.customer_label ?? 'Customer'}
      range={range}
      idle={idle}
    />
  )
}

