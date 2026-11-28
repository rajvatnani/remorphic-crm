'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toPaise, toRupeesInput } from '@/lib/money'
import { UPI_RE } from '@/lib/links'

const input = 'w-full h-8 rounded-lg border border-input px-2.5 text-sm outline-none'

/** What customers see and pay on the shop link. Saves on its own. */
export default function ShopSettings({ businessId }: { businessId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [description, setDescription] = useState('')
  const [upi, setUpi] = useState('')
  const [delivery, setDelivery] = useState('')
  const [freeAbove, setFreeAbove] = useState('')
  const [showSoldOut, setShowSoldOut] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    createClient()
      .from('businesses')
      .select('shop_description, upi_id, delivery_flat_paise, free_delivery_above_paise, show_sold_out')
      .eq('id', businessId)
      .single()
      .then(({ data, error }) => {
        if (error) { setError('Shop settings need the database update for the shop page.'); return }
        setDescription(data.shop_description ?? '')
        setUpi(data.upi_id ?? '')
        setDelivery(data.delivery_flat_paise ? toRupeesInput(data.delivery_flat_paise) : '')
        setFreeAbove(toRupeesInput(data.free_delivery_above_paise))
        setShowSoldOut(data.show_sold_out !== false)
        setLoaded(true)
      })
  }, [businessId])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const upiId = upi.trim()
    if (upiId && !UPI_RE.test(upiId)) { setError('Enter a UPI ID like name@okhdfcbank, or leave it blank.'); return }
    const flat = delivery.trim() ? toPaise(delivery) : 0
    const free = freeAbove.trim() ? toPaise(freeAbove) : null
    if (flat === null || flat < 0) { setError('Enter the delivery charge in rupees, or leave it blank for none.'); return }
    if (freeAbove.trim() && (free === null || free < 0)) { setError('Enter the free-delivery amount in rupees, or leave it blank.'); return }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const { error } = await createClient()
        .from('businesses')
        .update({
          shop_description: description.trim().slice(0, 120) || null,
          upi_id: upiId || null,
          delivery_flat_paise: flat,
          free_delivery_above_paise: free,
          show_sold_out: showSoldOut,
        })
        .eq('id', businessId)
      if (error) { setError(error.message); return }
      setSaved(true)
    })
  }

  if (!loaded) return error ? <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">{error}</p> : null

  return (
    <form onSubmit={handleSave} className="space-y-2 pt-2">
      <span className="block text-sm font-medium text-fest-ink">Shop page</span>
      <label className="block space-y-1">
        <span className="block text-xs text-gray-500">One-line description, under your name</span>
        <input value={description} onChange={e => { setDescription(e.target.value); setSaved(false) }} maxLength={120} placeholder="German silver gifts and pooja items" className={input} />
      </label>
      <label className="block space-y-1">
        <span className="block text-xs text-gray-500">UPI ID, for a Pay by UPI button with the amount filled in</span>
        <input value={upi} onChange={e => { setUpi(e.target.value); setSaved(false) }} placeholder="name@okhdfcbank" autoCapitalize="none" className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Delivery charge ₹</span>
          <input value={delivery} onChange={e => { setDelivery(e.target.value); setSaved(false) }} inputMode="decimal" placeholder="None" className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Free delivery above ₹</span>
          <input value={freeAbove} onChange={e => { setFreeAbove(e.target.value); setSaved(false) }} inputMode="decimal" placeholder="Never" className={input} />
        </label>
      </div>
      <p className="text-[11px] text-gray-400">Customers who collect (no address) pay no delivery.</p>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={showSoldOut} onChange={e => { setShowSoldOut(e.target.checked); setSaved(false) }} className="h-4 w-4 accent-[#C81E5B]" />
        Show sold-out items (greyed out, at the end)
      </label>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#C81E5B' }}>
          Save shop page
        </button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </form>
  )
}
