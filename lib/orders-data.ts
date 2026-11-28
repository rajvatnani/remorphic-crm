import type { Item, Order } from '@/types'
import type { CustomerOption } from '@/components/orders/order-dialog'

const ORDER_SELECT = 'id, order_no, source, address, customer_id, status, payment_status, paid_paise, delivery_paise, discount_paise, notes, due_date, created_at, customers(id, name, phone), order_items(id, item_id, name, price_paise, cost_paise, qty)'

/** Orders (optionally for one customer), items and customers for the order screens */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOrderData(supabase: any, businessId: string, customerId?: string) {
  let ordersQuery = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (customerId) ordersQuery = ordersQuery.eq('customer_id', customerId)

  const [{ data: orders }, { data: items }, { data: customers }] = await Promise.all([
    ordersQuery,
    supabase.from('items').select('*').eq('business_id', businessId).order('name'),
    customerId
      ? Promise.resolve({ data: [] })
      : supabase.from('customers').select('id, name, phone').eq('business_id', businessId).order('name'),
  ])

  return {
    orders: (orders ?? []) as Order[],
    items: (items ?? []) as Item[],
    customers: (customers ?? []) as CustomerOption[],
  }
}
