'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { upiLink } from '@/lib/links'
import { formatRupees } from '@/lib/money'

/**
 * Pay by UPI with the amount and a note already filled in: a button that
 * opens the customer's UPI app (on a phone), a QR code to scan from another
 * phone, and the UPI ID to copy.
 */
export default function UpiPay({
  upiId,
  payee,
  amountPaise,
  note,
  compact = false,
}: {
  upiId: string
  payee: string
  amountPaise: number
  note: string
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const link = upiLink({ upiId, payee, amountPaise, note })
  if (!link) return null

  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <QRCodeSVG value={link} size={112} level="M" />
        <p className="text-sm text-gray-600">
          Scan with any UPI app to pay {formatRupees(amountPaise)}, or pay to <b>{upiId}</b> mentioning “{note}”.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-center">
      <a
        href={link}
        className="flex w-full h-12 items-center justify-center rounded-2xl text-white font-semibold"
        style={{ backgroundColor: '#F15A24' }}
      >
        Pay {formatRupees(amountPaise)} by UPI
      </a>
      <p className="text-xs text-gray-500">Opens GPay, PhonePe, Paytm or any UPI app with the amount filled in.</p>
      <div className="flex justify-center pt-1">
        <div className="rounded-xl bg-white p-2 ring-1 ring-gray-200">
          <QRCodeSVG value={link} size={176} level="M" />
        </div>
      </div>
      <p className="text-xs text-gray-500">On a computer? Scan this with your phone.</p>
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="text-gray-600">UPI ID: <b className="text-gray-900">{upiId}</b></span>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="text-xs font-medium text-[#F15A24] hover:underline"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
