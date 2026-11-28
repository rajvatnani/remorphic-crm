import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getInvoice } from '@/app/actions/shop'
import { formatRupees } from '@/lib/money'
import PrintButton from './print-button'
import UpiPay from '@/components/shop/upi-pay'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const inv = await getInvoice(token)
  return {
    title: inv ? `Invoice ${inv.order_no} · ${inv.business.name}` : 'Invoice',
    // Private to whoever has the link
    robots: { index: false, follow: false },
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

const PAYMENT_LABEL: Record<string, string> = { pending: 'Unpaid', partial: 'Part paid', paid: 'Paid' }

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await getInvoice(token)
  if (!inv) return notFound()

  const { business: b } = inv
  const subtotal = inv.lines.reduce((s, l) => s + l.qty * l.price_paise, 0)
  const total = Math.max(subtotal + inv.delivery_paise - inv.discount_paise, 0)
  const balance = Math.max(total - inv.paid_paise, 0)

  return (
    <main className="min-h-screen bg-gray-50 print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
        <div className="mb-4 flex justify-end print:hidden">
          <PrintButton />
        </div>

        <article className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-10 space-y-8 print:rounded-none print:border-0 print:p-0">
          <header className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              {b.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.photo} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-gray-200" />
              )}
              <div className="text-sm text-gray-600">
                <p className="text-2xl font-extrabold text-gray-900">{b.name}</p>
                {b.address && <p className="max-w-xs">{b.address}</p>}
                {b.phone && <p>Phone: {b.phone}</p>}
                {b.gstin && <p>GSTIN: {b.gstin}</p>}
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-3xl font-extrabold" style={{ color: '#F15A24' }}>Invoice</h1>
              <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-sm">
                <dt className="text-gray-500">Invoice no.</dt><dd className="font-bold">{inv.order_no}</dd>
                <dt className="text-gray-500">Order date</dt><dd>{fmtDate(inv.created_at)}</dd>
                {inv.delivered_at && (<><dt className="text-gray-500">Delivered on</dt><dd>{fmtDate(inv.delivered_at)}</dd></>)}
              </dl>
            </div>
          </header>

          <section className="rounded-xl bg-gray-50 p-4 text-sm print:border print:border-gray-200 print:bg-transparent">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Bill to</p>
            <p className="font-bold text-gray-900">{inv.customer.name}</p>
            {inv.customer.phone && <p>{inv.customer.phone}</p>}
            {inv.address && <p className="whitespace-pre-line text-gray-700">{inv.address}</p>}
          </section>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-2 font-bold">Item</th>
                <th className="px-2 py-2 text-right font-bold">Qty</th>
                <th className="px-2 py-2 text-right font-bold">Rate</th>
                <th className="py-2 pl-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 pr-2">{l.name}</td>
                  <td className="px-2 py-2.5 text-right">{l.qty}</td>
                  <td className="px-2 py-2.5 text-right">{formatRupees(l.price_paise)}</td>
                  <td className="py-2.5 pl-2 text-right font-semibold">{formatRupees(l.qty * l.price_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatRupees(subtotal)}</span></div>
            {inv.delivery_paise > 0 && <div className="flex justify-between"><span>Delivery</span><span>{formatRupees(inv.delivery_paise)}</span></div>}
            {inv.discount_paise > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatRupees(inv.discount_paise)}</span></div>}
            <div className="flex justify-between border-t-2 border-gray-200 pt-2 text-base font-extrabold">
              <span>Total</span><span>{formatRupees(total)}</span>
            </div>
            <div className="flex justify-between text-gray-700"><span>Paid</span><span>{formatRupees(inv.paid_paise)}</span></div>
            {balance > 0 && (
              <div className="flex justify-between font-bold text-amber-700"><span>Balance due</span><span>{formatRupees(balance)}</span></div>
            )}
            <div className="flex justify-between text-gray-500"><span>Payment</span><span>{PAYMENT_LABEL[inv.payment_status] ?? inv.payment_status}</span></div>
          </div>

          {balance > 0 && b.upi_id && (
            <div className="rounded-xl border border-gray-200 p-4">
              <UpiPay compact upiId={b.upi_id} payee={b.name} amountPaise={balance} note={`Invoice ${inv.order_no}`} />
            </div>
          )}
          {balance > 0 && !b.upi_id && b.payment_qr && (
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.payment_qr} alt="Payment QR code" className="h-28 w-28 object-contain" />
              <p className="text-sm text-gray-600">Scan to pay the balance of {formatRupees(balance)} by UPI, mentioning invoice {inv.order_no}.</p>
            </div>
          )}

          <footer className="border-t border-gray-200 pt-4 text-center text-sm text-gray-600">
            {b.invoice_note && <p className="whitespace-pre-line mb-2">{b.invoice_note}</p>}
            <p className="font-semibold text-gray-900">Thank you for your business!</p>
          </footer>
        </article>
      </div>
    </main>
  )
}
