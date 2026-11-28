import Link from 'next/link'
import { formatRupees } from '@/lib/money'
import ExportCsvButton from '@/components/export-csv-button'
import {
  RANGES, LOW_STOCK, rangeStart, bucketFor, summary, overTime, periodLabel, bestSellers,
  deadStock, reorderList, stockValue, repeatCustomers, pendingPayments, istDay,
  type RangeKey, type ReportItem, type ReportOrder,
} from '@/lib/reports'

export const IDLE_DAYS = [30, 60, 90] as const

// CSV money: plain rupees, no symbol or separators, so spreadsheets read numbers
const csvRupees = (paise: number | null) => (paise == null ? '' : (paise / 100).toFixed(2))

function fmtDay(day: string | null) {
  if (!day) return 'Never'
  return new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function Section({ title, note, csv, children }: {
  title: string
  note?: string
  csv?: { name: string; headers: string[]; rows: (string | number)[][] }
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
        </div>
        {csv && csv.rows.length > 0 && <ExportCsvButton filenamePrefix={csv.name} headers={csv.headers} rows={csv.rows} />}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-6 text-center">{children}</p>
}

const th = 'py-2 px-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap'
const thR = th.replace('text-left', 'text-right')
const td = 'py-2 px-2 text-gray-700'
const tdR = td + ' text-right whitespace-nowrap tabular-nums'

/** The reports themselves, from rows already loaded */
export default function ReportsView({ orders, items, categories, customerLabel, range, idle, defaultLowStock = LOW_STOCK }: {
  defaultLowStock?: number
  orders: ReportOrder[]
  items: ReportItem[]
  categories: { id: string; name: string }[]
  customerLabel: string
  range: RangeKey
  idle: number
}) {
  const link = (patch: { range?: string; idle?: number }) => {
    const q = new URLSearchParams({ range, idle: String(idle), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })
    return `/reports?${q}`
  }
  const start = rangeStart(range)
  const rangeLabel = RANGES.find(r => r.key === range)!.label.toLowerCase()
  const sum = summary(orders, start)
  const bucket = bucketFor(range)
  const periods = overTime(orders, start, bucket)
  const maxSales = Math.max(...periods.map(p => p.sales), 1)
  const sellers = bestSellers(orders, start)
  const byQty = [...sellers].sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 10)
  const byProfit = sellers.filter(s => s.profit !== null).sort((a, b) => b.profit! - a.profit!).slice(0, 10)
  const dead = deadStock(items, orders, idle)
  const reorder = reorderList(items, defaultLowStock)
  const value = stockValue(items, categories)
  const repeat = repeatCustomers(orders)
  const pending = pendingPayments(orders)
  const pendingTotal = pending.reduce((s, p) => s + p.due, 0)

  const tiles = [
    { label: 'Sales', value: formatRupees(sum.sales) },
    { label: 'Profit', value: formatRupees(sum.profit), hint: sum.linesWithoutCost ? `${sum.linesWithoutCost} line${sum.linesWithoutCost === 1 ? '' : 's'} without a cost left out` : undefined },
    { label: 'Orders', value: String(sum.orders) },
    { label: 'Average order', value: formatRupees(Math.round(sum.average / 100) * 100) },
    { label: 'To collect', value: formatRupees(pendingTotal), hint: 'All accepted orders, any date' },
  ]

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div>
        <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Counts confirmed, ready and delivered orders. New and cancelled orders are left out.</p>
      </div>

      {/* Period, one row above everything it filters */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {RANGES.map(r => (
          <Link
            key={r.key}
            href={link({ range: r.key })}
            scroll={false}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${r.key === range ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{t.value}</p>
            {t.hint && <p className="text-[11px] text-gray-400 mt-1">{t.hint}</p>}
          </div>
        ))}
      </div>

      <Section
        title={`Sales by ${bucket}`}
        note={`${RANGES.find(r => r.key === range)!.label}. Hover a bar for its figures.`}
        csv={{
          name: 'sales',
          headers: [bucket === 'day' ? 'Date' : bucket === 'week' ? 'Week starting' : 'Month', 'Orders', 'Sales (Rs)', 'Profit (Rs)'],
          rows: periods.map(p => [p.key, p.orders, csvRupees(p.sales), csvRupees(p.profit)]),
        }}
      >
        {sum.orders === 0 ? <Empty>No accepted orders in this period.</Empty> : (
          <>
            <div className="flex gap-3">
              <div className="flex flex-col justify-between text-[11px] text-gray-400 tabular-nums h-48 pb-0.5 text-right">
                <span>{formatRupees(maxSales)}</span>
                <span>₹0</span>
              </div>
              <div className="flex-1 min-w-0 h-48 flex items-end gap-0.5 border-b border-gray-200" role="img" aria-label={`Sales by ${bucket}, ${rangeLabel}. Figures are in the table below.`}>
                {periods.map(p => (
                  <div key={p.key} className="group relative flex-1 h-full flex items-end justify-center min-w-[3px]">
                    <div
                      className="w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                      style={{ height: p.sales ? `${Math.max((p.sales / maxSales) * 100, 1.5)}%` : 0, backgroundColor: '#F15A24' }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                      <p className="font-semibold">{periodLabel(p.key, bucket)}</p>
                      <p>Sales {formatRupees(p.sales)}</p>
                      <p>Profit {formatRupees(p.profit)}</p>
                      <p>{p.orders} order{p.orders === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-gray-400 mt-1 pl-14">
              <span>{periodLabel(periods[0].key, bucket)}</span>
              <span>{periodLabel(periods[periods.length - 1].key, bucket)}</span>
            </div>
          </>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section
          title="Best sellers by quantity"
          note={`Top 10, ${rangeLabel}`}
          csv={{ name: 'best-sellers', headers: ['Item', 'Qty', 'Sales (Rs)', 'Profit (Rs)'], rows: [...sellers].sort((a, b) => b.qty - a.qty).map(s => [s.name, s.qty, csvRupees(s.sales), csvRupees(s.profit)]) }}
        >
          {byQty.length === 0 ? <Empty>Nothing sold in this period.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Item</th><th className={thR}>Qty</th><th className={thR}>Sales</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {byQty.map(s => <tr key={s.key}><td className={td}>{s.name}</td><td className={tdR}>{s.qty}</td><td className={tdR}>{formatRupees(s.sales)}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Best sellers by profit" note={`Top 10, ${rangeLabel}. Items without a cost are left out.`}>
          {byProfit.length === 0 ? <Empty>No sales with a known cost in this period.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Item</th><th className={thR}>Qty</th><th className={thR}>Profit</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {byProfit.map(s => <tr key={s.key}><td className={td}>{s.name}</td><td className={tdR}>{s.qty}</td><td className={tdR}>{formatRupees(s.profit)}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section
        title="Pending payments"
        note="Accepted orders not fully paid, oldest first"
        csv={{ name: 'pending-payments', headers: ['Order', 'Date', 'Customer', 'Phone', 'Total (Rs)', 'Paid (Rs)', 'Due (Rs)'], rows: pending.map(p => [p.order.order_no, istDay(p.order.created_at), p.order.customers?.name ?? '', p.order.customers?.phone ?? '', csvRupees(p.total), csvRupees(p.order.paid_paise), csvRupees(p.due)]) }}
      >
        {pending.length === 0 ? <Empty>Everything is paid.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Order</th><th className={th}>Date</th><th className={th}>{customerLabel}</th><th className={thR}>Total</th><th className={thR}>Paid</th><th className={thR}>Due</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(p => (
                  <tr key={p.order.id}>
                    <td className={td + ' font-medium'}>#{p.order.order_no}</td>
                    <td className={td + ' whitespace-nowrap'}>{fmtDay(istDay(p.order.created_at))}</td>
                    <td className={td}>{p.order.customers ? <Link href={`/customers/${p.order.customers.id}`} className="hover:underline">{p.order.customers.name}</Link> : '—'}</td>
                    <td className={tdR}>{formatRupees(p.total)}</td>
                    <td className={tdR}>{formatRupees(p.order.paid_paise)}</td>
                    <td className={tdR + ' font-semibold text-gray-900'}>{formatRupees(p.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Section
          title="Running low"
          note={`Items on sale at or below their low-stock alert (shop default ${defaultLowStock})`}
          csv={{ name: 'running-low', headers: ['Item', 'Code', 'In stock'], rows: reorder.map(i => [i.name, i.code ?? '', i.stock ?? 0]) }}
        >
          {reorder.length === 0 ? <Empty>Nothing is running low.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Item</th><th className={thR}>In stock</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {reorder.map(i => <tr key={i.id}><td className={td}>{i.name}</td><td className={tdR + ((i.stock ?? 0) <= 0 ? ' text-red-600 font-semibold' : '')}>{(i.stock ?? 0) <= 0 ? 'Sold out' : i.stock}</td></tr>)}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Stock value"
          note="Items in stock, by category"
          csv={{ name: 'stock-value', headers: ['Category', 'Units', 'At cost (Rs)', 'At selling price (Rs)', 'Items without a cost'], rows: value.map(v => [v.name, v.units, csvRupees(v.atCost), csvRupees(v.atPrice), v.costMissing]) }}
        >
          {value.length === 0 ? <Empty>No stock recorded.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Category</th><th className={thR}>Units</th><th className={thR}>At cost</th><th className={thR}>At price</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {value.map(v => (
                  <tr key={v.name}>
                    <td className={td}>{v.name}{v.costMissing > 0 && <span className="block text-[11px] text-gray-400">{v.costMissing} without a cost</span>}</td>
                    <td className={tdR}>{v.units}</td>
                    <td className={tdR}>{formatRupees(v.atCost)}</td>
                    <td className={tdR}>{formatRupees(v.atPrice)}</td>
                  </tr>
                ))}
                {value.length > 1 && (
                  <tr className="font-semibold">
                    <td className={td}>Total</td>
                    <td className={tdR}>{value.reduce((s, v) => s + v.units, 0)}</td>
                    <td className={tdR}>{formatRupees(value.reduce((s, v) => s + v.atCost, 0))}</td>
                    <td className={tdR}>{formatRupees(value.reduce((s, v) => s + v.atPrice, 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section
        title="Slow-moving stock"
        note={`In stock, not sold in the last ${idle} days. Largest value first.`}
        csv={{ name: 'slow-moving-stock', headers: ['Item', 'Code', 'In stock', 'Last sold', 'Value at cost (Rs)', 'Value at price (Rs)'], rows: dead.map(d => [d.item.name, d.item.code ?? '', d.item.stock ?? 0, d.lastSold ?? 'Never', csvRupees(d.valueAtCost), csvRupees(d.valueAtPrice)]) }}
      >
        <div className="flex gap-1 mb-3">
          {IDLE_DAYS.map(d => (
            <Link key={d} href={link({ idle: d })} scroll={false} className={`px-3 py-1 rounded-lg text-xs font-medium ${d === idle ? 'bg-gray-900 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}>
              {d} days
            </Link>
          ))}
        </div>
        {dead.length === 0 ? <Empty>Everything in stock has sold in the last {idle} days.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Item</th><th className={thR}>In stock</th><th className={th}>Last sold</th><th className={thR}>Value at cost</th><th className={thR}>Value at price</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {dead.map(d => (
                  <tr key={d.item.id}>
                    <td className={td}>{d.item.name}</td>
                    <td className={tdR}>{d.item.stock}</td>
                    <td className={td + ' whitespace-nowrap'}>{fmtDay(d.lastSold)}</td>
                    <td className={tdR}>{d.valueAtCost == null ? '—' : formatRupees(d.valueAtCost)}</td>
                    <td className={tdR}>{formatRupees(d.valueAtPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title={`Repeat ${(customerLabel).toLowerCase()}s`}
        note="Two or more accepted orders, any date. Highest spend first."
        csv={{ name: 'repeat-customers', headers: ['Name', 'Phone', 'Orders', 'Total spent (Rs)', 'Last order'], rows: repeat.map(c => [c.name, c.phone, c.orders, csvRupees(c.spent), c.last]) }}
      >
        {repeat.length === 0 ? <Empty>No repeat buyers yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Name</th><th className={th}>Phone</th><th className={thR}>Orders</th><th className={thR}>Spent</th><th className={th}>Last order</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {repeat.map(c => (
                  <tr key={c.id}>
                    <td className={td}><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                    <td className={td}>{c.phone || '—'}</td>
                    <td className={tdR}>{c.orders}</td>
                    <td className={tdR}>{formatRupees(c.spent)}</td>
                    <td className={td + ' whitespace-nowrap'}>{fmtDay(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
