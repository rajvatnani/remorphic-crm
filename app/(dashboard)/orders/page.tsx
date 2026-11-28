import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import { loadOrderData } from '@/lib/orders-data'
import { formatRupees } from '@/lib/money'
import { orderTotal } from '@/types'
import ModuleOff from '@/components/orders/module-off'
import OrderList from '@/components/orders/order-list'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx
  if (!enabledModules(business).orders) return <ModuleOff title="Orders" />

  const { new: newFor } = await searchParams
  const { orders, items, customers, categories } = await loadOrderData(supabase, business.id)

  const live = orders.filter(o => o.status !== 'cancelled')
  const due = live.reduce((s, o) => s + Math.max(orderTotal(o) - o.paid_paise, 0), 0)
  const open = live.filter(o => o.status !== 'delivered').length

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Orders</h1>
        <p className="text-sm text-gray-500 mt-1">
          {open} open · {formatRupees(due)} to collect
        </p>
      </div>
      <OrderList
        orders={orders}
        items={items}
        customers={customers}
        categories={categories}
        customerLabel={business.customer_label ?? 'Customer'}
        openNewFor={newFor && customers.some(c => c.id === newFor) ? newFor : undefined}
      />
    </div>
  )
}
