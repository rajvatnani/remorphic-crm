'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setOrderStatus, setOrderPayment } from '@/app/actions/orders'
import { formatRupees, toRupeesInput } from '@/lib/money'
import { ORDER_STATUSES, orderTotal, hasInvoice, type Item, type ItemCategory, type Order, type OrderStatus } from '@/types'
import OrderDialog, { type CustomerOption } from './order-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronDown, Plus, Search, Pencil, FileText, MessageCircle } from 'lucide-react'

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'bg-purple-50 text-purple-700',
  confirmed: 'bg-blue-50 text-blue-700',
  ready: 'bg-amber-50 text-amber-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s.label])) as Record<OrderStatus, string>

const PAYMENT_STYLE = {
  pending: 'bg-red-50 text-red-600',
  partial: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
} as const
const PAYMENT_LABEL = { pending: 'Unpaid', partial: 'Part paid', paid: 'Paid' } as const

// The next step for each status, and its button label
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: 'confirmed', label: 'Confirm' },
  confirmed: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'delivered', label: 'Mark delivered' },
}

type Tab = 'open' | OrderStatus | 'unpaid' | 'all'
const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'unpaid', label: 'Payment due' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

function inTab(o: Order, tab: Tab) {
  switch (tab) {
    case 'all': return true
    case 'open': return o.status !== 'delivered' && o.status !== 'cancelled'
    case 'unpaid': return o.status !== 'cancelled' && o.payment_status !== 'paid'
    default: return o.status === tab
  }
}

function fmtDate(d: string) {
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function InvoiceButtons({ order, total }: { order: Order; total: number }) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/invoice/${order.public_token}`
  const phone = (order.customers?.phone ?? '').replace(/\D/g, '')
  const text = encodeURIComponent(
    `Hi ${order.customers?.name ?? ''}, here is the invoice for your order #${order.order_no} (${formatRupees(total)}): ${url}`
  )
  return (
    <>
      <a
        href={`/invoice/${order.public_token}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 text-[0.8rem] font-medium text-gray-700 hover:bg-gray-50"
      >
        <FileText className="h-3.5 w-3.5" /> Invoice
      </a>
      {phone && (
        <a
          href={`https://wa.me/${phone}?text=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-green-200 text-[0.8rem] font-medium text-green-700 hover:bg-green-50"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Send invoice
        </a>
      )}
    </>
  )
}

function OrderDetail({ order, onEdit }: { order: Order; onEdit: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const total = orderTotal(order)
  const [paid, setPaid] = useState(toRupeesInput(order.paid_paise) || '')
  const subtotal = order.order_items.reduce((s, l) => s + l.price_paise * l.qty, 0)
  const cost = order.order_items.every(l => l.cost_paise != null)
    ? order.order_items.reduce((s, l) => s + (l.cost_paise ?? 0) * l.qty, 0)
    : null
  const next = NEXT[order.status]
  const editable = order.status !== 'delivered' && order.status !== 'cancelled'

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {order.order_items.map(l => (
            <tr key={l.id}>
              <td className="py-1.5 text-gray-900">{l.name}</td>
              <td className="py-1.5 text-gray-500 text-right whitespace-nowrap">{l.qty} × {formatRupees(l.price_paise)}</td>
              <td className="py-1.5 text-right font-medium whitespace-nowrap w-28">{formatRupees(l.qty * l.price_paise)}</td>
            </tr>
          ))}
          {order.delivery_paise > 0 && (
            <tr><td className="py-1.5 text-gray-500" colSpan={2}>Delivery</td><td className="py-1.5 text-right">{formatRupees(order.delivery_paise)}</td></tr>
          )}
          {order.discount_paise > 0 && (
            <tr><td className="py-1.5 text-gray-500" colSpan={2}>Discount</td><td className="py-1.5 text-right">−{formatRupees(order.discount_paise)}</td></tr>
          )}
          <tr><td className="py-1.5 font-semibold" colSpan={2}>Total</td><td className="py-1.5 text-right font-semibold">{formatRupees(total)}</td></tr>
        </tbody>
      </table>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        {order.address && <span>Deliver to: {order.address}</span>}
        {order.due_date && <span>Due {fmtDate(order.due_date)}</span>}
        {cost != null && order.status !== 'cancelled' && (
          <span>Profit {formatRupees(subtotal - order.discount_paise - cost)}</span>
        )}
        {order.notes && <span className="italic">{order.notes}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {next && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, next.to))} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">
            {next.label}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="outline" disabled={pending} onClick={onEdit} className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {editable && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => { if (window.confirm(`Cancel order #${order.order_no}? Any stock it took goes back.`)) run(() => setOrderStatus(order.id, 'cancelled')) }}
            className="text-red-600 hover:text-red-700"
          >
            Cancel order
          </Button>
        )}
        {order.status === 'cancelled' && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, 'new'))}>
            Reopen
          </Button>
        )}
        {hasInvoice(order.status) && order.public_token && <InvoiceButtons order={order} total={total} />}
      </div>

      {order.status !== 'cancelled' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-sm text-gray-600">Received ₹</span>
          <input
            value={paid}
            onChange={e => setPaid(e.target.value)}
            inputMode="decimal"
            className="h-8 w-28 rounded-lg border border-input px-2 text-sm outline-none focus:border-orange-400"
          />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setOrderPayment(order.id, paid || '0'))}>
            Save
          </Button>
          {order.payment_status !== 'paid' && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => { setPaid(toRupeesInput(total)); run(() => setOrderPayment(order.id, toRupeesInput(total))) }}
            >
              Mark fully paid
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
    </div>
  )
}

export default function OrderList({
  orders,
  items,
  customers,
  customerLabel,
  fixedCustomerId,
  openNewFor,
  compact = false,
  categories = [],
}: {
  categories?: ItemCategory[]
  orders: Order[]
  items: Item[]
  customers: CustomerOption[]
  customerLabel: string
  /** On a customer's page: new orders go to this customer, no customer column */
  fixedCustomerId?: string
  /** Open the new-order dialog for this customer on load */
  openNewFor?: string
  compact?: boolean
}) {
  const [tab, setTab] = useState<Tab>(compact ? 'all' : 'open')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<{ order: Order | null; customerId?: string; n: number } | null>(
    openNewFor ? { order: null, customerId: openNewFor, n: 0 } : null
  )
  const router = useRouter()

  // Drop ?new= from the address once its dialog is open, so a refresh doesn't reopen it
  useEffect(() => {
    if (openNewFor) router.replace('/orders', { scroll: false })
  }, [openNewFor, router])

  const counts = useMemo(() => {
    const c: Partial<Record<Tab, number>> = {}
    for (const t of TABS) c[t.key] = orders.filter(o => inTab(o, t.key)).length
    return c
  }, [orders])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      if (!inTab(o, tab)) return false
      if (!q) return true
      return (
        String(o.order_no) === q.replace('#', '') ||
        (o.customers?.name ?? '').toLowerCase().includes(q) ||
        (o.customers?.phone ?? '').includes(q) ||
        o.order_items.some(l => l.name.toLowerCase().includes(q))
      )
    })
  }, [orders, tab, search])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cols = fixedCustomerId ? 6 : 7

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {!compact && (
          <div className="relative max-w-xs flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Order no, name, phone or item…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring"
            />
          </div>
        )}
        <Button
          onClick={() => setDialog({ order: null, customerId: fixedCustomerId, n: Date.now() })}
          className="bg-[#F15A24] hover:bg-[#d44d1b] text-white gap-2 ml-auto"
          size={compact ? 'sm' : 'default'}
        >
          <Plus className="h-4 w-4" /> New Order
        </Button>
      </div>

      {!compact && (
        <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}{counts[t.key] ? ` (${counts[t.key]})` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>Order</TableHead>
              {!fixedCustomerId && <TableHead>{customerLabel}</TableHead>}
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} className="text-center py-12 text-gray-400">
                  {orders.length === 0 ? 'No orders yet.' : 'No orders here.'}
                </TableCell>
              </TableRow>
            )}
            {shown.map(o => {
              const isOpen = expanded.has(o.id)
              const first = o.order_items[0]?.name ?? ''
              const more = o.order_items.length - 1
              return (
                <Fragment key={o.id}>
                  <TableRow className={`cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-orange-50/40 border-b-0' : ''}`} onClick={() => toggle(o.id)}>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-semibold text-gray-900">#{o.order_no}</span>
                      {o.source === 'shop' && <Badge className="ml-1.5 bg-orange-50 text-[#F15A24] border-0 text-[10px]">Shop</Badge>}
                      <span className="block text-xs text-gray-400">{fmtDate(o.created_at)}</span>
                    </TableCell>
                    {!fixedCustomerId && (
                      <TableCell>
                        {o.customers ? (
                          <Link href={`/customers/${o.customers.id}`} onClick={e => e.stopPropagation()} className="font-medium text-gray-900 hover:underline">
                            {o.customers.name}
                          </Link>
                        ) : '—'}
                        {o.customers?.phone && <span className="block text-xs text-gray-400">{o.customers.phone}</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-gray-600 max-w-56 truncate">
                      {first}{more > 0 ? ` +${more} more` : ''}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{formatRupees(orderTotal(o))}</TableCell>
                    <TableCell><Badge className={`${STATUS_STYLE[o.status]} border-0`}>{STATUS_LABEL[o.status]}</Badge></TableCell>
                    <TableCell>
                      {o.status !== 'cancelled' && (
                        <Badge className={`${PAYMENT_STYLE[o.payment_status]} border-0`}>{PAYMENT_LABEL[o.payment_status]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronDown className={`h-4 w-4 text-gray-400 inline transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-orange-50/40 hover:bg-orange-50/40">
                      <TableCell colSpan={cols} className="px-4 pb-4 pt-0 whitespace-normal">
                        <OrderDetail
                          key={`${o.id}-${o.paid_paise}`}
                          order={o}
                          onEdit={() => setDialog({ order: o, n: Date.now() })}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {dialog && (
        <OrderDialog
          key={dialog.n}
          open
          onClose={() => setDialog(null)}
          order={dialog.order}
          items={items}
          customers={customers}
          customerLabel={customerLabel}
          initialCustomerId={dialog.customerId}
          categories={categories}
        />
      )}
    </div>
  )
}
