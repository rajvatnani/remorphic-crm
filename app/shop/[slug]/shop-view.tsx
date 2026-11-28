'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { placeShopOrder, type ShopBusiness, type ShopItem } from '@/app/actions/shop'
import { formatRupees } from '@/lib/money'
import { MapPin, Search, ShoppingBag, Minus, Plus, X, Package } from 'lucide-react'

type Cart = Record<string, number> // item id → qty

function maxQty(item: ShopItem) {
  return item.stock == null ? 99 : Math.max(item.stock, 0)
}

function QtyControl({ item, q, setQty }: { item: ShopItem; q: number; setQty: (item: ShopItem, qty: number) => void }) {
  const soldOut = maxQty(item) === 0
  if (soldOut) return <span className="text-xs font-semibold text-gray-400">Sold out</span>
  if (!q) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setQty(item, 1) }}
        className="px-4 h-9 rounded-xl text-sm font-semibold text-white"
        style={{ backgroundColor: '#F15A24' }}
      >
        Add
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button onClick={() => setQty(item, q - 1)} className="w-9 h-9 rounded-xl border-2 border-orange-200 flex items-center justify-center" aria-label="One less">
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center font-semibold">{q}</span>
      <button
        onClick={() => setQty(item, q + 1)}
        disabled={q >= maxQty(item)}
        className="w-9 h-9 rounded-xl border-2 border-orange-200 flex items-center justify-center disabled:opacity-40"
        aria-label="One more"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

function Photo({ item, className }: { item: ShopItem; className: string }) {
  return item.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.photo_url} alt={item.name} className={`${className} object-cover`} />
  ) : (
    <div className={`${className} bg-orange-50 flex items-center justify-center`}>
      <Package className="w-8 h-8 text-orange-200" />
    </div>
  )
}

export default function ShopView({ business, items }: { business: ShopBusiness; items: ShopItem[] }) {
  const router = useRouter()
  const storageKey = `custozo-cart-${business.slug}`
  const [cart, setCart] = useState<Cart>({})
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'browse' | 'cart'>('browse')
  const [detail, setDetail] = useState<ShopItem | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The cart lives on the customer's phone, one per shop. It can only be
  // read after the page has loaded in the browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
      if (saved && typeof saved === 'object') {
        const valid: Cart = {}
        for (const [id, qty] of Object.entries(saved)) {
          const item = items.find(i => i.id === id)
          const q = Math.min(Number(qty) || 0, item ? maxQty(item) : 0)
          if (item && q > 0) valid[id] = q
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCart(valid)
      }
      const details = JSON.parse(window.localStorage.getItem('custozo-shopper') ?? '{}')
      if (details?.name) setName(details.name)
      if (details?.phone) setPhone(details.phone)
      if (details?.address) setAddress(details.address)
    } catch {
      // storage blocked: the cart still works for this visit
    }
    setLoaded(true)
  }, [storageKey, items])

  useEffect(() => {
    if (!loaded) return
    try { window.localStorage.setItem(storageKey, JSON.stringify(cart)) } catch { /* ignore */ }
  }, [cart, loaded, storageKey])

  function setQty(item: ShopItem, qty: number) {
    setError(null)
    setCart(c => {
      const next = { ...c }
      const q = Math.max(0, Math.min(qty, maxQty(item)))
      if (q > 0) next[item.id] = q
      else delete next[item.id]
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.code ?? '').toLowerCase().includes(q) ||
      (i.description ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  const cartLines = items.filter(i => cart[i.id])
  const count = cartLines.reduce((s, i) => s + cart[i.id], 0)
  const total = cartLines.reduce((s, i) => s + cart[i.id] * i.price_paise, 0)

  function handlePlace(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await placeShopOrder({
        businessId: business.id,
        name, phone, address, note,
        lines: cartLines.map(i => ({ item_id: i.id, qty: cart[i.id] })),
      })
      if (!res.ok) { setError(res.error); return }
      try {
        window.localStorage.removeItem(storageKey)
        window.localStorage.setItem('custozo-shopper', JSON.stringify({ name, phone, address }))
      } catch { /* ignore */ }
      router.push(`/shop/${business.slug}/order/${res.token}`)
    })
  }

  // ── cart + checkout ────────────────────────────────────────────────────────
  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50">
        <div className="max-w-lg mx-auto px-4 py-8">
          <button onClick={() => setView('browse')} className="text-sm text-gray-500 hover:text-gray-800 mb-4">← Keep shopping</button>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Your order</h1>

          {cartLines.length === 0 ? (
            <p className="text-gray-500 bg-white rounded-2xl p-6 text-center">Your cart is empty.</p>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 mb-4">
                {cartLines.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3">
                    <Photo item={item} className="w-14 h-14 rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">{formatRupees(item.price_paise)} each</p>
                    </div>
                    <QtyControl item={item} q={cart[item.id] ?? 0} setQty={setQty} />
                  </div>
                ))}
                <div className="flex justify-between p-3 font-semibold">
                  <span>Total</span>
                  <span>{formatRupees(total)}</span>
                </div>
              </div>

              <form onSubmit={handlePlace} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="s_name">Your name</label>
                  <input id="s_name" value={name} onChange={e => setName(e.target.value)} required className="w-full h-11 px-4 rounded-xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="s_phone">Mobile number</label>
                  <input id="s_phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="98765 43210" className="w-full h-11 px-4 rounded-xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="s_address">Delivery address <span className="text-gray-400 font-normal">(leave blank to collect)</span></label>
                  <textarea id="s_address" value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="s_note">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input id="s_note" value={note} onChange={e => setNote(e.target.value)} placeholder="Size, colour, gift wrap…" className="w-full h-11 px-4 rounded-xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm" />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl">{error}</p>}
                <button type="submit" disabled={pending} className="w-full h-12 rounded-2xl text-white font-semibold disabled:opacity-50" style={{ backgroundColor: '#F15A24' }}>
                  {pending ? 'Placing order…' : `Place order · ${formatRupees(total)}`}
                </button>
                <p className="text-xs text-gray-400 text-center">{business.name} will confirm your order and how to pay.</p>
              </form>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── browse ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50 pb-28">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          {business.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.photo} alt={business.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-md border-2 border-white" />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#F15A24' }}>
              <ShoppingBag className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{business.name}</h1>
          {business.address && (
            <p className="flex items-center justify-center gap-1 text-gray-500 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />{business.address}
            </p>
          )}
        </div>

        {items.length > 6 && (
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full h-11 pl-10 pr-4 rounded-2xl border-2 border-gray-200 bg-white focus:border-[#F15A24] outline-none text-sm"
            />
          </div>
        )}

        {items.length === 0 && <p className="text-center text-gray-500 bg-white rounded-2xl p-8">No items to show yet.</p>}
        {items.length > 0 && filtered.length === 0 && <p className="text-center text-gray-500 py-8">No items match “{search}”.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(item => {
            const left = item.stock
            return (
              <div key={item.id} onClick={() => setDetail(item)} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col">
                <Photo item={item} className="w-full aspect-square" />
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.name}</p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900">{formatRupees(item.price_paise)}</p>
                      {left != null && left > 0 && left <= 5 && <p className="text-[11px] text-amber-600 font-medium">Only {left} left</p>}
                    </div>
                    <QtyControl item={item} q={cart[item.id] ?? 0} setQty={setQty} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Item detail */}
      {detail && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setDetail(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <Photo item={detail} className="w-full aspect-square" />
              <button onClick={() => setDetail(null)} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <h2 className="text-xl font-bold text-gray-900">{detail.name}</h2>
              {detail.code && <p className="text-xs text-gray-400">Code {detail.code}</p>}
              {detail.description && <p className="text-sm text-gray-600 whitespace-pre-line">{detail.description}</p>}
              <div className="flex items-center justify-between pt-2">
                <span className="text-2xl font-bold text-gray-900">{formatRupees(detail.price_paise)}</span>
                <QtyControl item={detail} q={cart[detail.id] ?? 0} setQty={setQty} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart bar */}
      {count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-4">
          <button
            onClick={() => { setView('cart'); window.scrollTo(0, 0) }}
            className="max-w-lg mx-auto w-full h-14 rounded-2xl text-white font-bold shadow-lg flex items-center justify-between px-5"
            style={{ backgroundColor: '#F15A24' }}
          >
            <span className="flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> {count} item{count === 1 ? '' : 's'}</span>
            <span>{formatRupees(total)} · View order →</span>
          </button>
        </div>
      )}
    </div>
  )
}
