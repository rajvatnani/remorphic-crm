'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadOrderPaymentScreenshot } from '@/app/actions/shop'
import { compressImage } from '@/lib/image'
import { CheckCircle, Upload } from 'lucide-react'

export default function PaymentUpload({ token, alreadySent }: { token: string; alreadySent: boolean }) {
  const router = useRouter()
  const [sent, setSent] = useState(alreadySent)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    startTransition(async () => {
      try {
        // Phone screenshots can be large; shrink before sending
        const blob = await compressImage(file, 1600, 0.85)
        const form = new FormData()
        form.set('file', new File([blob], 'payment.jpg', { type: 'image/jpeg' }))
        const res = await uploadOrderPaymentScreenshot(token, form)
        if (!res.ok) { setError(res.error ?? 'Could not send the screenshot.'); return }
        setSent(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the screenshot.')
      }
    })
  }

  return (
    <div className="space-y-2">
      {sent && (
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-green-700 bg-green-50 rounded-xl px-4 py-2">
          <CheckCircle className="w-4 h-4" /> Screenshot sent. The shop will confirm your payment.
        </p>
      )}
      <label className={`flex items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-store-line rounded-full px-4 py-3 hover:bg-store-sand transition-colors ${pending ? 'opacity-60 pointer-events-none' : ''}`}>
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={pending} />
        <Upload className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">
          {pending ? 'Sending…' : sent ? 'Send a different screenshot' : 'Upload payment screenshot'}
        </span>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{error}</p>}
    </div>
  )
}
