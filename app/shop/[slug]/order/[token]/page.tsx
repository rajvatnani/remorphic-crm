import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getShopOrder } from '@/app/actions/shop'
import { formatRupees } from '@/lib/money'
import { CheckCircle, MessageCircle, FileText } from 'lucide-react'
import { hasInvoice } from '@/types'
import PaymentUpload from './payment-upload'
import UpiPay from '@/components/shop/upi-pay'

export const metadata: Metadata = {
  title: 'Your order',
  // Order pages are private to whoever has the link
  robots: { index: false, follow: false },
}

const STATUS_TEXT: Record<string, string> = {
  new: 'Received, waiting for the shop to confirm',
  confirmed: 'Confirmed',
  ready: 'Packed',
  shipped: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export default async function ShopOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const order = await getShopOrder(slug, token)
  if (!order) return notFound()

  const subtotal = order.lines.reduce((s, l) => s + l.qty * l.price_paise, 0)
  const total = Math.max(subtotal + order.delivery_paise - order.discount_paise, 0)
  const due = Math.max(total - order.paid_paise, 0)

  const waNumber = (order.business.phone ?? '').replace(/\D/g, '')
  const waText = encodeURIComponent(
    `Hi ${order.business.name}, this is ${order.customer_name}. About my order #${order.order_no} (${formatRupees(total)}).`
  )

  return (
    <div className="min-h-screen bg-store-cream text-store-ink">
      <header className="border-b border-store-line/70 bg-store-cream/90">
        <div className="max-w-lg mx-auto px-4 py-3">
          <Link href={`/shop/${order.business.slug}`} className="font-display text-2xl font-semibold tracking-wide">{order.business.name}</Link>
        </div>
      </header>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="bg-store-night text-store-cream rounded-3xl p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-store-gold/20 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-7 h-7 text-store-gold" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-store-gold">Thank you</p>
          <h1 className="font-display text-4xl font-semibold mt-1">Order #{order.order_no}</h1>
          <p className={`inline-block mt-3 text-sm font-semibold px-4 py-1 rounded-full ${order.status === 'cancelled' ? 'bg-white/10 text-store-cream/70' : 'bg-store-gold text-store-night'}`}>
            {STATUS_TEXT[order.status] ?? order.status}
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-store-line p-5">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-store-line">
              {order.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 text-store-ink">{l.qty} × {l.name}</td>
                  <td className="py-2 text-right whitespace-nowrap">{formatRupees(l.qty * l.price_paise)}</td>
                </tr>
              ))}
              {order.delivery_paise > 0 && (
                <tr><td className="py-2 text-store-ink/60">Delivery</td><td className="py-2 text-right">{formatRupees(order.delivery_paise)}</td></tr>
              )}
              {order.discount_paise > 0 && (
                <tr><td className="py-2 text-store-ink/60">Discount</td><td className="py-2 text-right">−{formatRupees(order.discount_paise)}</td></tr>
              )}
              <tr><td className="py-2 font-semibold">Total</td><td className="py-2 text-right font-semibold">{formatRupees(total)}</td></tr>
              {order.paid_paise > 0 && (
                <tr><td className="py-2 text-store-ink/60">Paid</td><td className="py-2 text-right">{formatRupees(order.paid_paise)}</td></tr>
              )}
            </tbody>
          </table>
          {order.address && <p className="text-xs text-store-ink/60 mt-3">Deliver to: {order.address}</p>}
          {order.status === 'shipped' && (order.courier || order.tracking_no) && (
            <p className="text-sm text-store-ink/80 mt-2">Sent{order.courier ? ` by ${order.courier}` : ''}{order.tracking_no ? ` · Tracking number ${order.tracking_no}` : ''}</p>
          )}
          {order.status === 'cancelled' && order.cancel_reason && <p className="text-sm text-store-ink/70 mt-2">Reason: {order.cancel_reason}</p>}
          {order.notes && <p className="text-xs text-store-ink/60 mt-1">Note: {order.notes}</p>}
        </div>

        {order.payment_status === 'cod' && order.status !== 'cancelled' && (
          <p className="bg-white rounded-3xl border border-store-line p-5 text-center text-sm text-store-ink/80">Pay {formatRupees(due)} in cash on delivery.</p>
        )}
        {order.status !== 'cancelled' && !['paid', 'refunded', 'cod'].includes(order.payment_status) && due > 0 && (
          <div className="bg-white rounded-3xl border border-store-line p-5 text-center space-y-3">
            {!order.business.upi_id && <p className="font-semibold text-store-ink">Pay {formatRupees(due)}</p>}
            {order.business.upi_id ? (
              <UpiPay upiId={order.business.upi_id} payee={order.business.name} amountPaise={due} note={`Order ${order.order_no}`} />
            ) : order.business.payment_qr && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.business.payment_qr} alt="Payment QR code" className="w-48 h-48 object-contain mx-auto rounded-xl" />
                <p className="text-xs text-store-ink/60">Scan with any UPI app, then upload the screenshot here.</p>
              </>
            )}
            <PaymentUpload token={token} alreadySent={order.has_screenshot} />
          </div>
        )}

        {hasInvoice(order.status) && (
          <Link
            href={`/invoice/${token}`}
            className="w-full h-12 rounded-full bg-white border border-store-line text-store-ink font-semibold flex items-center justify-center gap-2 hover:bg-store-sand"
          >
            <FileText className="w-5 h-5" /> View invoice
          </Link>
        )}

        {waNumber && (
          <a
            href={`https://wa.me/${waNumber}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-full bg-store-ink text-store-cream font-semibold flex items-center justify-center gap-2 hover:bg-black"
          >
            <MessageCircle className="w-5 h-5" /> Message {order.business.name} on WhatsApp
          </a>
        )}

        <p className="text-center text-xs text-store-ink/50">
          Keep this page’s link to check your order. <Link href={`/shop/${order.business.slug}`} className="underline">Back to the shop</Link>
        </p>
      </div>
    </div>
  )
}
