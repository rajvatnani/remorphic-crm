'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  changeOrderStatus, recordPayment, getOrderScreenshotUrl, getOrderHistory,
  type PaymentMethod, type StatusChange,
} from '@/app/actions/orders'
import { formatRupees, toRupeesInput } from '@/lib/money'
import { ORDER_STATUSES, orderTotal, hasInvoice, type Order, type OrderStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Pencil, FileText, MessageCircle, Receipt, History } from 'lucide-react'

export const STATUS_LABEL = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s.label])) as Record<OrderStatus, string>

const input = 'h-8 rounded-lg border border-input px-2 text-sm outline-none focus:border-orange-400'

function fmtDate(d: string) {
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtWhen(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function waLink(phone: string | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const n = digits.length === 10 ? '91' + digits : digits
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

/** A message for the customer about where their order is, ready to send on WhatsApp */
function updateMessage(order: Order, total: number, origin: string) {
  const name = order.customers?.name ?? ''
  const no = `#${order.order_no}`
  const link = order.public_token ? `${origin}/invoice/${order.public_token}` : ''
  switch (order.status) {
    case 'new':
      return `Hi ${name}, we have received your order ${no} for ${formatRupees(total)}. We will confirm it shortly.`
    case 'confirmed':
      return `Hi ${name}, your order ${no} for ${formatRupees(total)} is confirmed. We will let you know when it is packed.`
    case 'ready':
      return order.address
        ? `Hi ${name}, your order ${no} is packed and will be sent soon.`
        : `Hi ${name}, your order ${no} is packed and ready to collect.`
    case 'shipped':
      return `Hi ${name}, your order ${no} has been sent${order.courier ? ` by ${order.courier}` : ''}.${order.tracking_no ? ` Tracking number: ${order.tracking_no}.` : ''}`
    case 'delivered':
      return `Hi ${name}, your order ${no} has been delivered. Thank you for shopping with us!${link ? ` Your invoice: ${link}` : ''}`
    case 'cancelled':
      return `Hi ${name}, your order ${no} has been cancelled${order.cancel_reason ? `: ${order.cancel_reason}` : '.'}`
  }
}

export default function OrderDetail({ order, onEdit }: { order: Order; onEdit: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<null | 'ship' | 'cancel'>(null)
  const [courier, setCourier] = useState(order.courier ?? '')
  const [tracking, setTracking] = useState(order.tracking_no ?? '')
  const [shipCost, setShipCost] = useState(order.delivery_cost_paise ? toRupeesInput(order.delivery_cost_paise) : '')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<PaymentMethod>(order.payment_status === 'cod' ? 'cod' : order.payment_status === 'refunded' ? 'refunded' : 'auto')
  const [paid, setPaid] = useState(toRupeesInput(order.paid_paise) || '')
  const [upiRef, setUpiRef] = useState(order.upi_ref ?? '')
  const [history, setHistory] = useState<StatusChange[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const total = orderTotal(order)
  const subtotal = order.order_items.reduce((s, l) => s + l.price_paise * l.qty, 0)
  const cost = order.order_items.every(l => l.cost_paise != null)
    ? order.order_items.reduce((s, l) => s + (l.cost_paise ?? 0) * l.qty, 0)
    : null
  const editable = order.status === 'new' || order.status === 'confirmed' || order.status === 'ready'
  const cancellable = editable || order.status === 'shipped'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    if (!showHistory) return
    let stale = false
    getOrderHistory(order.id).then(h => { if (!stale) setHistory(h) })
    return () => { stale = true }
  }, [showHistory, order.id, order.status])

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      after?.()
      router.refresh()
    })
  }
  const go = (status: OrderStatus, details = {}) => run(() => changeOrderStatus(order.id, status, details), () => setMode(null))

  const wa = waLink(order.customers?.phone, updateMessage(order, total, origin))
  const invoiceWa = order.public_token
    ? waLink(order.customers?.phone, `Hi ${order.customers?.name ?? ''}, here is the invoice for your order #${order.order_no} (${formatRupees(total)}): ${origin}/invoice/${order.public_token}`)
    : null

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
        {order.address ? <span>Deliver to: {[order.address, order.city, order.pincode].filter(Boolean).join(', ')}</span> : order.source === 'shop' && <span>Will collect</span>}
        {order.due_date && <span>Due {fmtDate(order.due_date)}</span>}
        {(order.courier || order.tracking_no) && <span>Sent {order.courier ? `by ${order.courier}` : ''}{order.tracking_no ? ` · Tracking ${order.tracking_no}` : ''}</span>}
        {cost != null && order.status !== 'cancelled' && (
          <span>
            Profit {formatRupees(subtotal - order.discount_paise + order.delivery_paise - (order.delivery_cost_paise ?? 0) - cost)}
            {order.delivery_cost_paise ? ` (after ${formatRupees(order.delivery_cost_paise)} delivery cost)` : ''}
          </span>
        )}
        {order.cancel_reason && order.status === 'cancelled' && <span>Cancelled: {order.cancel_reason}</span>}
        {order.notes && <span className="italic">{order.notes}</span>}
      </div>

      {/* Next steps */}
      <div className="flex flex-wrap items-center gap-2">
        {order.status === 'new' && <Button size="sm" disabled={pending} onClick={() => go('confirmed')} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">Confirm</Button>}
        {order.status === 'confirmed' && <Button size="sm" disabled={pending} onClick={() => go('ready')} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">Mark packed</Button>}
        {order.status === 'ready' && (
          <>
            <Button size="sm" disabled={pending} onClick={() => setMode(m => (m === 'ship' ? null : 'ship'))} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">Mark shipped</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => go('delivered')}>Handed over (delivered)</Button>
          </>
        )}
        {order.status === 'shipped' && <Button size="sm" disabled={pending} onClick={() => go('delivered')} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">Mark delivered</Button>}
        {editable && (
          <Button size="sm" variant="outline" disabled={pending} onClick={onEdit} className="gap-1">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {cancellable && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(m => (m === 'cancel' ? null : 'cancel'))} className="text-red-600 hover:text-red-700">
            Cancel order
          </Button>
        )}
        {order.status === 'cancelled' && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => go('new')}>Reopen</Button>
        )}
      </div>

      {mode === 'ship' && (
        <form onSubmit={e => { e.preventDefault(); go('shipped', { courier, tracking, deliveryCost: shipCost }) }} className="grid gap-2 sm:grid-cols-4 rounded-lg bg-gray-50 p-3">
          <input value={courier} onChange={e => setCourier(e.target.value)} placeholder="Courier, e.g. Delhivery" className={input} aria-label="Courier" />
          <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Tracking number" className={input} aria-label="Tracking number" />
          <input value={shipCost} onChange={e => setShipCost(e.target.value)} inputMode="decimal" placeholder="You paid ₹ (optional)" className={input} aria-label="What delivery cost you" />
          <Button type="submit" size="sm" disabled={pending} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white">Save and mark shipped</Button>
          <p className="sm:col-span-4 text-[11px] text-gray-500">What you paid the courier is taken off this order&apos;s profit.</p>
        </form>
      )}

      {mode === 'cancel' && (
        <form onSubmit={e => { e.preventDefault(); go('cancelled', { cancelReason: reason }) }} className="flex flex-wrap gap-2 rounded-lg bg-red-50 p-3">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional), e.g. out of stock" className={`${input} flex-1 min-w-48 bg-white`} aria-label="Reason for cancelling" />
          <Button type="submit" size="sm" disabled={pending} className="bg-red-600 hover:bg-red-700 text-white">Cancel order #{order.order_no}</Button>
          <p className="w-full text-[11px] text-red-700">Any stock it took goes back.</p>
        </form>
      )}

      {/* Messages and documents */}
      <div className="flex flex-wrap items-center gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-green-200 text-[0.8rem] font-medium text-green-700 hover:bg-green-50">
            <MessageCircle className="h-3.5 w-3.5" /> Send {STATUS_LABEL[order.status].toLowerCase()} update
          </a>
        )}
        {hasInvoice(order.status) && order.public_token && (
          <>
            <a href={`/invoice/${order.public_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 text-[0.8rem] font-medium text-gray-700 hover:bg-gray-50">
              <FileText className="h-3.5 w-3.5" /> Invoice
            </a>
            {invoiceWa && (
              <a href={invoiceWa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-green-200 text-[0.8rem] font-medium text-green-700 hover:bg-green-50">
                <MessageCircle className="h-3.5 w-3.5" /> Send invoice
              </a>
            )}
          </>
        )}
        <button type="button" onClick={() => setShowHistory(h => !h)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 text-[0.8rem] font-medium text-gray-700 hover:bg-gray-50">
          <History className="h-3.5 w-3.5" /> {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>

      {showHistory && (
        <ol className="text-xs text-gray-600 space-y-1 border-l-2 border-gray-100 pl-3">
          {history === null && <li className="text-gray-400">Loading…</li>}
          {history?.map((h, i) => (
            <li key={i}>
              <span className="text-gray-400">{fmtWhen(h.created_at)}</span>{' '}
              {h.from_status ? `${STATUS_LABEL[h.from_status as OrderStatus] ?? h.from_status} → ` : 'Placed as '}
              <b className="text-gray-800">{STATUS_LABEL[h.to_status as OrderStatus] ?? h.to_status}</b>
            </li>
          ))}
        </ol>
      )}

      {/* Payment */}
      {order.status !== 'cancelled' || order.payment_status !== 'pending' ? (
        <form
          onSubmit={e => { e.preventDefault(); run(() => recordPayment(order.id, paid, method, upiRef)) }}
          className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3"
        >
          {order.payment_screenshot && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 text-emerald-700"
              onClick={async () => {
                // Open the tab first so the browser does not block it
                const tab = window.open('', '_blank')
                const url = await getOrderScreenshotUrl(order.id)
                if (url && tab) tab.location.href = url
                else { tab?.close(); setError('Could not open the screenshot.') }
              }}
            >
              <Receipt className="h-3.5 w-3.5" /> Payment screenshot
            </Button>
          )}
          <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={input} aria-label="Payment">
            <option value="auto">Received</option>
            <option value="cod">Cash on delivery</option>
            <option value="refunded">Refunded</option>
          </select>
          <span className="text-sm text-gray-600">₹</span>
          <input value={paid} onChange={e => setPaid(e.target.value)} inputMode="decimal" className={`${input} w-24`} aria-label="Amount received" />
          <input value={upiRef} onChange={e => setUpiRef(e.target.value)} placeholder="UPI ref (optional)" className={`${input} w-36`} aria-label="UPI reference" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
          {order.payment_status !== 'paid' && order.payment_status !== 'refunded' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => { setMethod('auto'); setPaid(toRupeesInput(total)); run(() => recordPayment(order.id, toRupeesInput(total), 'auto', upiRef)) }}
            >
              Mark fully paid
            </Button>
          )}
        </form>
      ) : null}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
    </div>
  )
}
