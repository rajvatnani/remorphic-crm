'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markOrdersSeen } from '@/app/actions/orders'
import { formatRupees } from '@/lib/money'
import { orderTotal, type Item, type ItemCategory, type Order, type OrderStatus } from '@/types'
import OrderDialog, { type CustomerOption } from './order-dialog'
import OrderDetail, { STATUS_LABEL } from './order-detail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronDown, Plus, Search } from 'lucide-react'

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'bg-purple-50 text-purple-700',
  confirmed: 'bg-blue-50 text-blue-700',
  ready: 'bg-amber-50 text-amber-700',
  shipped: 'bg-sky-50 text-sky-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const PAYMENT_STYLE = {
  pending: 'bg-red-50 text-red-600',
  partial: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
  cod: 'bg-fest-ranisoft text-fest-rani',
  refunded: 'bg-gray-100 text-gray-600',
} as const
const PAYMENT_LABEL = { pending: 'Unpaid', partial: 'Part paid', paid: 'Paid', cod: 'Cash on delivery', refunded: 'Refunded' } as const

/** A shop order nobody has opened yet */
const isUnseen = (o: Order) => o.source === 'shop' && !o.seen_at && o.status === 'new'

type Tab = 'open' | OrderStatus | 'unpaid' | 'all'
const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'ready', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'unpaid', label: 'Payment due' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

function inTab(o: Order, tab: Tab) {
  switch (tab) {
    case 'all': return true
    case 'open': return o.status !== 'delivered' && o.status !== 'cancelled'
    case 'unpaid': return o.status !== 'cancelled' && o.payment_status !== 'paid' && o.payment_status !== 'refunded'
    default: return o.status === tab
  }
}

function fmtDate(d: string) {
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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

  // Opened here, so no longer new; the marker goes on the next refresh
  const [seenNow, setSeenNow] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    const order = orders.find(o => o.id === id)
    if (order && isUnseen(order) && !seenNow.has(id)) {
      setSeenNow(s => new Set(s).add(id))
      markOrdersSeen([id]).catch(() => {}) // the marker just stays until next time
    }
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
          className="bg-[#C81E5B] hover:bg-[#A81549] text-white gap-2 ml-auto"
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
                tab === t.key ? 'bg-fest-plum text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}{counts[t.key] ? ` (${counts[t.key]})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Phones: one card per order; the detail opens full width under it */}
      <div className="md:hidden space-y-3">
        {shown.length === 0 && (
          <p className="rounded-3xl border border-fest-line bg-white py-12 text-center text-sm text-gray-400">
            {orders.length === 0 ? 'No orders yet.' : 'No orders here.'}
          </p>
        )}
        {shown.map(o => {
          const isOpen = expanded.has(o.id)
          const first = o.order_items[0]?.name ?? ''
          const more = o.order_items.length - 1
          return (
            <div key={o.id} className={`overflow-hidden rounded-3xl border bg-white ${isOpen ? 'border-fest-rani/40' : 'border-fest-line'}`}>
              <button type="button" onClick={() => toggle(o.id)} className="w-full p-4 text-left" aria-expanded={isOpen}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-friendly text-lg font-bold text-fest-ink">#{o.order_no}</span>
                      {isUnseen(o) && !seenNow.has(o.id) && <Badge className="bg-[#C81E5B] text-white border-0 text-[10px]">New</Badge>}
                      {o.source === 'shop' && <Badge className="bg-fest-ranisoft text-[#C81E5B] border-0 text-[10px]">Shop</Badge>}
                      <span className="text-xs text-gray-400">{fmtDate(o.created_at)}</span>
                    </div>
                    {!fixedCustomerId && o.customers && (
                      <p className="mt-0.5 truncate text-sm font-semibold text-fest-ink">
                        {o.customers.name}
                        {o.customers.phone && <span className="font-normal text-gray-400"> · {o.customers.phone}</span>}
                      </p>
                    )}
                    <p className="truncate text-sm text-gray-600">{first}{more > 0 ? ` +${more} more` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-friendly text-lg font-bold text-fest-ink">{formatRupees(orderTotal(o))}</p>
                    <ChevronDown className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge className={`${STATUS_STYLE[o.status]} border-0`}>{STATUS_LABEL[o.status]}</Badge>
                  {o.status !== 'cancelled' && <Badge className={`${PAYMENT_STYLE[o.payment_status]} border-0`}>{PAYMENT_LABEL[o.payment_status]}</Badge>}
                  {o.status !== 'cancelled' && o.payment_status !== 'paid' && o.payment_screenshot && (
                    <span className="text-[11px] text-emerald-700">Screenshot sent</span>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-fest-line bg-fest-cream/60 p-3">
                  <OrderDetail
                    key={`${o.id}-${o.paid_paise}`}
                    order={o}
                    onEdit={() => setDialog({ order: o, n: Date.now() })}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="hidden md:block bg-white rounded-3xl border border-fest-line overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-fest-cream hover:bg-fest-cream">
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
                  <TableRow className={`cursor-pointer hover:bg-fest-cream ${isOpen ? 'bg-fest-marigoldsoft/40 border-b-0' : ''}`} onClick={() => toggle(o.id)}>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-semibold text-fest-ink">#{o.order_no}</span>
                      {isUnseen(o) && !seenNow.has(o.id) && <Badge className="ml-1.5 bg-[#C81E5B] text-white border-0 text-[10px]">New</Badge>}
                      {o.source === 'shop' && <Badge className="ml-1.5 bg-fest-ranisoft text-[#C81E5B] border-0 text-[10px]">Shop</Badge>}
                      <span className="block text-xs text-gray-400">{fmtDate(o.created_at)}</span>
                    </TableCell>
                    {!fixedCustomerId && (
                      <TableCell>
                        {o.customers ? (
                          <Link href={`/customers/${o.customers.id}`} onClick={e => e.stopPropagation()} className="font-medium text-fest-ink hover:underline">
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
                      {o.status !== 'cancelled' && o.payment_status !== 'paid' && o.payment_screenshot && (
                        <span className="block text-[11px] text-emerald-700 mt-0.5">Screenshot sent</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronDown className={`h-4 w-4 text-gray-400 inline transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-fest-marigoldsoft/40 hover:bg-fest-ranisoft/40">
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
