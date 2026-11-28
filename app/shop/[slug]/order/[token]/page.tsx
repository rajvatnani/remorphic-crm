import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getShopOrder } from '@/app/actions/shop'
import { formatRupees } from '@/lib/money'
import { CheckCircle, MessageCircle, FileText } from 'lucide-react'
import { hasInvoice } from '@/types'
import PaymentUpload from './payment-upload'

export const metadata: Metadata = {
  title: 'Your order',
  // Order pages are private to whoever has the link
  robots: { index: false, follow: false },
}

const STATUS_TEXT: Record<string, string> = {
  new: 'Received, waiting for the shop to confirm',
  confirmed: 'Confirmed',
  ready: 'Ready',
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50">
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Order #{order.order_no}</h1>
          <p className="text-sm text-gray-500 mt-1">{order.business.name}</p>
          <p className={`inline-block mt-3 text-sm font-medium px-3 py-1 rounded-full ${order.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-[#F15A24]'}`}>
            {STATUS_TEXT[order.status] ?? order.status}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-5">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {order.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 text-gray-900">{l.qty} × {l.name}</td>
                  <td className="py-2 text-right whitespace-nowrap">{formatRupees(l.qty * l.price_paise)}</td>
                </tr>
              ))}
              {order.delivery_paise > 0 && (
                <tr><td className="py-2 text-gray-500">Delivery</td><td className="py-2 text-right">{formatRupees(order.delivery_paise)}</td></tr>
              )}
              {order.discount_paise > 0 && (
                <tr><td className="py-2 text-gray-500">Discount</td><td className="py-2 text-right">−{formatRupees(order.discount_paise)}</td></tr>
              )}
              <tr><td className="py-2 font-semibold">Total</td><td className="py-2 text-right font-semibold">{formatRupees(total)}</td></tr>
              {order.paid_paise > 0 && (
                <tr><td className="py-2 text-gray-500">Paid</td><td className="py-2 text-right">{formatRupees(order.paid_paise)}</td></tr>
              )}
            </tbody>
          </table>
          {order.address && <p className="text-xs text-gray-500 mt-3">Deliver to: {order.address}</p>}
          {order.notes && <p className="text-xs text-gray-500 mt-1">Note: {order.notes}</p>}
        </div>

        {order.status !== 'cancelled' && order.payment_status !== 'paid' && due > 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-5 text-center space-y-3">
            <p className="font-semibold text-gray-900">Pay {formatRupees(due)}</p>
            {order.business.payment_qr && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.business.payment_qr} alt="Payment QR code" className="w-48 h-48 object-contain mx-auto rounded-xl" />
                <p className="text-xs text-gray-500">Scan with any UPI app, then upload the screenshot here.</p>
              </>
            )}
            <PaymentUpload token={token} alreadySent={order.has_screenshot} />
          </div>
        )}

        {hasInvoice(order.status) && (
          <Link
            href={`/invoice/${token}`}
            className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-gray-800 font-semibold flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" /> View invoice
          </Link>
        )}

        {waNumber && (
          <a
            href={`https://wa.me/${waNumber}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-2xl text-white font-semibold flex items-center justify-center gap-2"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle className="w-5 h-5" /> Message {order.business.name} on WhatsApp
          </a>
        )}

        <p className="text-center text-xs text-gray-400">
          Keep this page’s link to check your order. <Link href={`/shop/${order.business.slug}`} className="underline">Back to the shop</Link>
        </p>
      </div>
    </div>
  )
}
