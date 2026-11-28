'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MODULES, enabledModules, type ModuleKey } from '@/lib/modules'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

/** Switches each part of the app on or off for this business. Saves on each change. */
export default function FeaturesCard() {
  const router = useRouter()
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [on, setOn] = useState<Record<ModuleKey, boolean> | null>(null)
  const [shopOn, setShopOn] = useState(false)
  const [slug, setSlug] = useState('')
  const [copied, setCopied] = useState(false)
  const [gstin, setGstin] = useState('')
  const [invoiceNote, setInvoiceNote] = useState('')
  const [invoiceSaved, setInvoiceSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    createClient().from('businesses').select('*').single().then(({ data }) => {
      if (!data) return
      setBusinessId(data.id)
      setOn(enabledModules(data))
      setShopOn(data.shop_enabled === true)
      setSlug(data.slug ?? '')
      setGstin(data.gstin ?? '')
      setInvoiceNote(data.invoice_note ?? '')
    })
  }, [])

  function toggle(key: ModuleKey, column: string, value: boolean) {
    if (!businessId || !on) return
    const before = on
    setOn({ ...on, [key]: value })
    setError(null)
    startTransition(async () => {
      const { error } = await createClient().from('businesses').update({ [column]: value }).eq('id', businessId)
      if (error) {
        setOn(before)
        setError(error.message.includes('column')
          ? 'Features cannot be saved until the database update for orders has been run.'
          : error.message)
        return
      }
      router.refresh()
    })
  }

  function toggleShop(value: boolean) {
    if (!businessId) return
    setShopOn(value)
    setError(null)
    startTransition(async () => {
      const { error } = await createClient().from('businesses').update({ shop_enabled: value }).eq('id', businessId)
      if (error) {
        setShopOn(!value)
        setError(error.message.includes('column')
          ? 'The shop link cannot be switched on until the database update for the shop has been run.'
          : error.message)
      }
    })
  }

  function saveInvoiceDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    setError(null)
    setInvoiceSaved(false)
    startTransition(async () => {
      const { error } = await createClient()
        .from('businesses')
        .update({ gstin: gstin.trim().toUpperCase() || null, invoice_note: invoiceNote.trim() || null })
        .eq('id', businessId)
      if (error) {
        setError(error.message.includes('column')
          ? 'Invoice details cannot be saved until the database update for invoices has been run.'
          : error.message)
        return
      }
      setInvoiceSaved(true)
    })
  }

  const shopUrl = typeof window !== 'undefined' && slug ? `${window.location.origin}/shop/${slug}` : ''

  return (
    <Card className="shadow-none border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Features</CardTitle>
        <CardDescription>Turn on the parts your business uses. Everything is linked through your customers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!on && <p className="text-sm text-gray-400">Loading…</p>}
        {on && MODULES.map(m => (
          <label key={m.key} className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-gray-900">{m.label}</span>
              <span className="block text-xs text-gray-500">{m.description}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={on[m.key]}
              disabled={pending}
              onChange={e => toggle(m.key, m.column, e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#F15A24]"
            />
          </label>
        ))}
        {on?.orders && (
          <div className="ml-4 pl-4 border-l-2 border-orange-100 space-y-2">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-gray-900">Shop link</span>
                <span className="block text-xs text-gray-500">A page where customers see your items and order, with no login</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={shopOn}
                disabled={pending}
                onChange={e => toggleShop(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#F15A24]"
              />
            </label>
            {shopOn && shopUrl && (
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">{shopUrl}</code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(shopUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="text-xs font-medium text-[#F15A24] hover:underline whitespace-nowrap"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-gray-600 hover:underline whitespace-nowrap">Open</a>
              </div>
            )}
            <form onSubmit={saveInvoiceDetails} className="space-y-2 pt-2">
              <span className="block text-sm font-medium text-gray-900">Invoice details</span>
              <input
                value={gstin}
                onChange={e => { setGstin(e.target.value); setInvoiceSaved(false) }}
                placeholder="GSTIN (optional)"
                maxLength={15}
                className="w-full h-8 rounded-lg border border-input px-2.5 text-sm outline-none uppercase placeholder:normal-case"
              />
              <textarea
                value={invoiceNote}
                onChange={e => { setInvoiceNote(e.target.value); setInvoiceSaved(false) }}
                placeholder="Note at the bottom of every invoice, e.g. exchange within 7 days"
                rows={2}
                className="w-full rounded-lg border border-input px-2.5 py-1.5 text-sm outline-none"
              />
              <div className="flex items-center gap-3">
                <button type="submit" disabled={pending} className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: '#F15A24' }}>
                  Save invoice details
                </button>
                {invoiceSaved && <span className="text-xs text-green-600">Saved</span>}
              </div>
            </form>
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
      </CardContent>
    </Card>
  )
}
