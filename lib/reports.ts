// Order and stock reports. Pure functions over rows already loaded, so the
// numbers can be checked without a database.
//
// Only orders that are confirmed, ready or delivered count: new orders are
// not yet accepted and cancelled ones never happened.
// Sales = item lines + delivery − discount. Profit uses only lines whose cost
// is known (+ delivery − discount); `linesWithoutCost` says how many were left out.

export interface ReportLine {
  item_id: string | null
  name: string
  qty: number
  price_paise: number
  cost_paise: number | null
}

export interface ReportOrder {
  id: string
  order_no: number
  status: string
  created_at: string
  paid_paise: number
  delivery_paise: number
  discount_paise: number
  customer_id: string
  customers: { id: string; name: string; phone: string } | null
  order_items: ReportLine[]
}

export interface ReportItem {
  id: string
  name: string
  code: string | null
  price_paise: number
  cost_paise: number | null
  stock: number | null
  active: boolean
  category_id?: string | null
  low_stock_level?: number | null
  archived?: boolean
}

export const COUNTED = new Set(['confirmed', 'ready', 'delivered'])
export const LOW_STOCK = 2 // used when a business has no default of its own

export type RangeKey = '7d' | '30d' | '90d' | 'month' | 'year' | 'all'
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

const TZ = 'Asia/Kolkata'

/** YYYY-MM-DD of an instant, in India time */
export function istDay(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(typeof iso === 'string' ? new Date(iso) : iso)
}

function addDays(day: string, n: number) {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** First day (inclusive) of a range, as YYYY-MM-DD in India time; null = all time */
export function rangeStart(range: RangeKey, now = new Date()): string | null {
  const today = istDay(now)
  switch (range) {
    case '7d': return addDays(today, -6)
    case '30d': return addDays(today, -29)
    case '90d': return addDays(today, -89)
    case 'month': return today.slice(0, 8) + '01'
    case 'year': return today.slice(0, 5) + '01-01'
    case 'all': return null
  }
}

export function linesTotal(o: Pick<ReportOrder, 'order_items'>) {
  return o.order_items.reduce((s, l) => s + l.price_paise * l.qty, 0)
}

export function orderSales(o: ReportOrder) {
  return Math.max(linesTotal(o) + o.delivery_paise - o.discount_paise, 0)
}

export function orderProfit(o: ReportOrder) {
  const margin = o.order_items.reduce(
    (s, l) => s + (l.cost_paise == null ? 0 : (l.price_paise - l.cost_paise) * l.qty), 0)
  return margin + o.delivery_paise - o.discount_paise
}

export function inRange(o: ReportOrder, start: string | null) {
  return COUNTED.has(o.status) && (start === null || istDay(o.created_at) >= start)
}

// ─── summary ──────────────────────────────────────────────────────────────────

export function summary(orders: ReportOrder[], start: string | null) {
  const counted = orders.filter(o => inRange(o, start))
  const sales = counted.reduce((s, o) => s + orderSales(o), 0)
  const profit = counted.reduce((s, o) => s + orderProfit(o), 0)
  const linesWithoutCost = counted.reduce((s, o) => s + o.order_items.filter(l => l.cost_paise == null).length, 0)
  return {
    sales,
    profit,
    orders: counted.length,
    average: counted.length ? Math.round(sales / counted.length) : 0,
    linesWithoutCost,
  }
}

// ─── over time ────────────────────────────────────────────────────────────────

export type Bucket = 'day' | 'week' | 'month'

export function bucketFor(range: RangeKey): Bucket {
  if (range === '7d' || range === '30d' || range === 'month') return 'day'
  if (range === '90d') return 'week'
  return 'month'
}

/** Monday of the week (day), first of the month, or the day itself */
function bucketKey(day: string, bucket: Bucket) {
  if (bucket === 'day') return day
  if (bucket === 'month') return day.slice(0, 7) + '-01'
  const dow = new Date(day + 'T00:00:00Z').getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}

function nextBucket(key: string, bucket: Bucket) {
  if (bucket === 'day') return addDays(key, 1)
  if (bucket === 'week') return addDays(key, 7)
  const d = new Date(key + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export interface Period { key: string; sales: number; profit: number; orders: number }

/** Every period in the range, including empty ones, oldest first */
export function overTime(orders: ReportOrder[], start: string | null, bucket: Bucket, now = new Date()): Period[] {
  const counted = orders.filter(o => inRange(o, start))
  const firstDay = start ?? (counted.length ? counted.map(o => istDay(o.created_at)).sort()[0] : istDay(now))
  const last = bucketKey(istDay(now), bucket)
  const map = new Map<string, Period>()
  for (let k = bucketKey(firstDay, bucket); k <= last; k = nextBucket(k, bucket)) {
    map.set(k, { key: k, sales: 0, profit: 0, orders: 0 })
  }
  for (const o of counted) {
    const p = map.get(bucketKey(istDay(o.created_at), bucket))
    if (!p) continue
    p.sales += orderSales(o)
    p.profit += orderProfit(o)
    p.orders += 1
  }
  return [...map.values()]
}

export function periodLabel(key: string, bucket: Bucket) {
  const d = new Date(key + 'T00:00:00Z')
  if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return bucket === 'week' ? `Week of ${s}` : s
}

// ─── best sellers ─────────────────────────────────────────────────────────────

export interface Seller { key: string; name: string; qty: number; sales: number; profit: number | null }

/** Per item (or per typed-in name), within the range */
export function bestSellers(orders: ReportOrder[], start: string | null): Seller[] {
  const map = new Map<string, Seller>()
  for (const o of orders) {
    if (!inRange(o, start)) continue
    for (const l of o.order_items) {
      const key = l.item_id ?? `name:${l.name.trim().toLowerCase()}`
      const s = map.get(key) ?? { key, name: l.name, qty: 0, sales: 0, profit: 0 }
      s.qty += l.qty
      s.sales += l.qty * l.price_paise
      s.profit = s.profit === null || l.cost_paise == null ? null : s.profit + (l.price_paise - l.cost_paise) * l.qty
      map.set(key, s)
    }
  }
  return [...map.values()]
}

// ─── stock ────────────────────────────────────────────────────────────────────

/** Last day each item was in a counted order (any time) */
export function lastSold(orders: ReportOrder[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const o of orders) {
    if (!COUNTED.has(o.status)) continue
    const day = istDay(o.created_at)
    for (const l of o.order_items) {
      if (l.item_id && (map.get(l.item_id) ?? '') < day) map.set(l.item_id, day)
    }
  }
  return map
}

/** In-stock items with no sale in the last `days` days */
export function deadStock(items: ReportItem[], orders: ReportOrder[], days: number, now = new Date()) {
  const since = addDays(istDay(now), -(days - 1))
  const sold = lastSold(orders)
  return items
    .filter(i => !i.archived && (i.stock ?? 0) > 0 && (sold.get(i.id) ?? '') < since)
    .map(i => ({
      item: i,
      lastSold: sold.get(i.id) ?? null,
      valueAtCost: i.cost_paise == null ? null : i.cost_paise * (i.stock ?? 0),
      valueAtPrice: i.price_paise * (i.stock ?? 0),
    }))
    .sort((a, b) => (b.valueAtCost ?? b.valueAtPrice) - (a.valueAtCost ?? a.valueAtPrice))
}

/** Tracked items still on sale at or below their low-stock level (or the business default), emptiest first */
export function reorderList(items: ReportItem[], defaultLow = LOW_STOCK) {
  return items
    .filter(i => i.active && !i.archived && i.stock != null && i.stock <= (i.low_stock_level ?? defaultLow))
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.name.localeCompare(b.name))
}

export function stockValue(items: ReportItem[], categories: { id: string; name: string }[]) {
  const rows = new Map<string, { name: string; units: number; atCost: number; atPrice: number; costMissing: number }>()
  const order = [...categories.map(c => c.id), '']
  for (const id of order) rows.set(id, { name: categories.find(c => c.id === id)?.name ?? 'No category', units: 0, atCost: 0, atPrice: 0, costMissing: 0 })
  for (const i of items) {
    if (i.archived || !i.stock || i.stock <= 0) continue
    const row = rows.get(i.category_id && rows.has(i.category_id) ? i.category_id : '')!
    row.units += i.stock
    row.atPrice += i.stock * i.price_paise
    if (i.cost_paise == null) row.costMissing += 1
    else row.atCost += i.stock * i.cost_paise
  }
  return [...rows.values()].filter(r => r.units > 0)
}

// ─── customers and payments ───────────────────────────────────────────────────

export function repeatCustomers(orders: ReportOrder[]) {
  const map = new Map<string, { id: string; name: string; phone: string; orders: number; spent: number; last: string }>()
  for (const o of orders) {
    if (!COUNTED.has(o.status) || !o.customers) continue
    const c = map.get(o.customer_id) ?? { id: o.customer_id, name: o.customers.name, phone: o.customers.phone, orders: 0, spent: 0, last: '' }
    c.orders += 1
    c.spent += orderSales(o)
    const day = istDay(o.created_at)
    if (day > c.last) c.last = day
    map.set(o.customer_id, c)
  }
  return [...map.values()].filter(c => c.orders >= 2).sort((a, b) => b.spent - a.spent)
}

/** Accepted orders not fully paid, oldest first */
export function pendingPayments(orders: ReportOrder[]) {
  return orders
    .filter(o => COUNTED.has(o.status))
    .map(o => ({ order: o, total: orderSales(o), due: Math.max(orderSales(o) - o.paid_paise, 0) }))
    .filter(r => r.due > 0)
    .sort((a, b) => a.order.created_at.localeCompare(b.order.created_at))
}
