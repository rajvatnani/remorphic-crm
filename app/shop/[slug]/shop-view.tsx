'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { placeShopOrder, type ShopBusiness, type ShopItem, type ShopCategory } from '@/app/actions/shop'
import { formatRupees } from '@/lib/money'
import { itemTags } from '@/lib/item-tags'
import PhotoViewer from './photo-viewer'
import { Search, ShoppingBag, Minus, Plus, MapPin, Maximize2, ArrowLeft } from 'lucide-react'

type Cart = Record<string, number> // item id → qty

function maxQty(item: ShopItem) {
  return item.stock == null ? 99 : Math.max(item.stock, 0)
}

function photosOf(item: ShopItem) {
  return item.photos?.length ? item.photos : item.photo_url ? [item.photo_url] : []
}

// WhatsApp link to the business, Indian 10-digit numbers get +91
function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const n = digits.length === 10 ? '91' + digits : digits
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

const inputClass = 'w-full h-12 px-5 rounded-full border border-store-line bg-white text-sm outline-none focus:border-store-gold focus:ring-2 focus:ring-store-gold/20'

export default function ShopView({
  business,
  items,
  categories = [],
  initialCategory,
  initialItem,
}: {
  business: ShopBusiness
  items: ShopItem[]
  categories?: ShopCategory[]
  /** From a category link: /shop/<slug>?category=<id> */
  initialCategory?: string
  /** From an item link: /shop/<slug>?item=<code> */
  initialItem?: string
}) {
  const router = useRouter()
  const storageKey = `custozo-cart-${business.slug}`
  const [category, setCategory] = useState<string>(
    initialCategory && categories.some(c => c.id === initialCategory) ? initialCategory : 'all'
  )
  const [sort, setSort] = useState<'new' | 'low' | 'high' | 'name'>('new')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Cart>({})
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<'browse' | 'bag'>('browse')
  const [viewer, setViewer] = useState<{ item: ShopItem; index: number } | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const linkedItem = initialItem ? items.find(i => i.code?.toLowerCase() === initialItem.toLowerCase()) : undefined

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The bag lives on the customer's phone, one per shop. It can only be
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
      if (details?.city) setCity(details.city)
      if (details?.pincode) setPincode(details.pincode)
    } catch {
      // storage blocked: the bag still works for this visit
    }
    setLoaded(true)
  }, [storageKey, items])

  useEffect(() => {
    if (!loaded) return
    try { window.localStorage.setItem(storageKey, JSON.stringify(cart)) } catch { /* ignore */ }
  }, [cart, loaded, storageKey])

  // An item link scrolls to that item
  useEffect(() => {
    if (linkedItem) document.getElementById(`item-${linkedItem.id}`)?.scrollIntoView({ block: 'center' })
  }, [linkedItem])

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

  function addToBag(item: ShopItem) {
    setQty(item, (cart[item.id] ?? 0) + 1)
    setJustAdded(item.id)
    setTimeout(() => setJustAdded(cur => (cur === item.id ? null : cur)), 1400)
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items.filter(i => {
      if (category !== 'all' && i.category_id !== category) return false
      return !q ||
        i.name.toLowerCase().includes(q) ||
        (i.code ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
    })
    const soldOut = (i: ShopItem) => (i.stock != null && i.stock <= 0 ? 1 : 0)
    return [...list].sort((a, b) =>
      // Sold-out items always last
      soldOut(a) - soldOut(b) ||
      (sort === 'low' ? a.price_paise - b.price_paise
        : sort === 'high' ? b.price_paise - a.price_paise
        : sort === 'name' ? a.name.localeCompare(b.name)
        : b.created_at.localeCompare(a.created_at))
    )
  }, [items, search, category, sort])

  const bagLines = items.filter(i => cart[i.id])
  const count = bagLines.reduce((s, i) => s + cart[i.id], 0)
  const subtotal = bagLines.reduce((s, i) => s + cart[i.id] * i.price_paise, 0)
  // Same rule as the database: delivery only when there is an address, free above the limit
  const freeAbove = business.free_delivery_above_paise ?? null
  const freeByRule = freeAbove !== null && subtotal >= freeAbove
  const delivery = !address.trim() || freeByRule ? 0 : business.delivery_flat_paise ?? 0
  const total = subtotal + delivery

  const heroPhotos = items.map(i => ({ url: photosOf(i)[0], name: i.name })).filter(p => p.url).slice(0, 3)
  const eyebrow = categories.length ? categories.map(c => c.name).join(' · ') : 'The collection'
  const chatLink = waLink(business.phone, `Hi ${business.name}, I'd like to know more about your collection.`)

  function handlePlace(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await placeShopOrder({
        businessId: business.id,
        name, phone, address, city, pincode, note,
        lines: bagLines.map(i => ({ item_id: i.id, qty: cart[i.id] })),
      })
      if (!res.ok) { setError(res.error); return }
      try {
        window.localStorage.removeItem(storageKey)
        window.localStorage.setItem('custozo-shopper', JSON.stringify({ name, phone, address, city, pincode }))
      } catch { /* ignore */ }
      router.push(`/shop/${business.slug}/order/${res.token}`)
    })
  }

  const header = (
    <header className="sticky top-0 z-30 border-b border-store-line/70 bg-store-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button onClick={() => { setView('browse'); window.scrollTo(0, 0) }} className="flex min-w-0 items-center gap-3 text-left">
          {business.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.photo} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-store-line" />
          )}
          <span className="truncate font-display text-2xl font-semibold leading-none tracking-wide">{business.name}</span>
        </button>
        <button
          onClick={() => { setView('bag'); window.scrollTo(0, 0) }}
          className="relative inline-flex items-center gap-2 rounded-full bg-store-ink px-4 py-2 text-sm font-semibold text-store-cream hover:bg-black"
          aria-label={`Bag, ${count} items`}
        >
          <ShoppingBag className="h-4 w-4" /> Bag
          {count > 0 && <span className="rounded-full bg-store-gold px-2 py-0.5 text-xs font-extrabold text-store-night">{count}</span>}
        </button>
      </div>
    </header>
  )

  const footer = (
    <footer className="bg-store-night text-store-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-12 text-center">
        <div className="font-display text-3xl font-semibold tracking-wide">{business.name}</div>
        {business.shop_description && <p className="max-w-md text-sm text-store-cream/70">{business.shop_description}</p>}
        {business.address && <p className="flex items-center gap-1 text-xs text-store-cream/60"><MapPin className="h-3.5 w-3.5" />{business.address}</p>}
        {chatLink && (
          <a href={chatLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-full border border-store-gold/60 px-5 py-2 text-sm font-semibold text-store-gold hover:bg-store-gold hover:text-store-night">
            Chat with us on WhatsApp
          </a>
        )}
        <p className="mt-6 text-xs text-store-cream/40">Powered by Custozo</p>
      </div>
    </footer>
  )

  // ── bag + checkout ─────────────────────────────────────────────────────────
  if (view === 'bag') {
    return (
      <div className="flex min-h-screen flex-col bg-store-cream text-store-ink">
        {header}
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
          <button onClick={() => setView('browse')} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-store-ink/60 hover:text-store-ink">
            <ArrowLeft className="h-4 w-4" /> Keep shopping
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-store-golddark">Checkout</p>
          <h1 className="mb-5 font-display text-4xl font-semibold">Your bag</h1>

          {bagLines.length === 0 ? (
            <p className="rounded-3xl border border-store-line bg-white p-8 text-center text-store-ink/60">Your bag is empty.</p>
          ) : (
            <>
              <div className="mb-4 divide-y divide-store-line rounded-3xl border border-store-line bg-white">
                {bagLines.map(item => {
                  const q = cart[item.id]
                  const photo = photosOf(item)[0]
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-store-sand">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg font-semibold leading-tight">{item.name}</p>
                        <p className="text-xs text-store-ink/60">{formatRupees(item.price_paise)} each</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQty(item, q - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-store-line hover:bg-store-sand" aria-label="One less"><Minus className="h-4 w-4" /></button>
                        <span className="w-7 text-center font-bold">{q}</span>
                        <button onClick={() => setQty(item, q + 1)} disabled={q >= maxQty(item)} className="flex h-9 w-9 items-center justify-center rounded-full border border-store-line hover:bg-store-sand disabled:opacity-40" aria-label="One more"><Plus className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )
                })}
                <div className="space-y-1 p-4 text-sm">
                  <div className="flex justify-between text-store-ink/70"><span>Items</span><span>{formatRupees(subtotal)}</span></div>
                  {(business.delivery_flat_paise ?? 0) > 0 && (
                    <>
                      <div className="flex justify-between text-store-ink/70">
                        <span>Delivery</span>
                        <span>{!address.trim() ? 'None if you collect' : delivery === 0 ? 'Free' : formatRupees(delivery)}</span>
                      </div>
                      {freeAbove !== null && !freeByRule && (
                        <p className="text-xs font-semibold text-green-700">Add {formatRupees(freeAbove - subtotal)} more for free delivery.</p>
                      )}
                    </>
                  )}
                  <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{formatRupees(total)}</span></div>
                </div>
              </div>

              <form onSubmit={handlePlace} className="space-y-3 rounded-3xl border border-store-line bg-white p-5">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">Your name</span>
                  <input value={name} onChange={e => setName(e.target.value)} required className={inputClass} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">Mobile number</span>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="98765 43210" className={inputClass} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">Delivery address <span className="font-normal text-store-ink/50">(leave blank to collect)</span></span>
                  <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full rounded-2xl border border-store-line bg-white px-5 py-3 text-sm outline-none focus:border-store-gold focus:ring-2 focus:ring-store-gold/20" />
                </label>
                {address.trim() && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold">City</span>
                      <input value={city} onChange={e => setCity(e.target.value)} className={inputClass} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold">Pincode</span>
                      <input value={pincode} onChange={e => setPincode(e.target.value)} inputMode="numeric" maxLength={7} className={inputClass} />
                    </label>
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">Note <span className="font-normal text-store-ink/50">(optional)</span></span>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Size, colour, gift wrap…" className={inputClass} />
                </label>
                {error && <p className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={pending} className="h-12 w-full rounded-full bg-store-ink font-bold text-store-cream hover:bg-black disabled:opacity-50">
                  {pending ? 'Placing order…' : `Place order · ${formatRupees(total)}`}
                </button>
                <p className="text-center text-xs text-store-ink/50">{business.name} will confirm your order and how to pay.</p>
              </form>
            </>
          )}
        </main>
        {footer}
      </div>
    )
  }

  // ── browse ─────────────────────────────────────────────────────────────────
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition ${active ? 'bg-store-ink text-store-cream' : 'bg-white text-store-ink ring-1 ring-store-line hover:ring-store-ink/40'}`

  return (
    <div className="flex min-h-screen flex-col bg-store-cream text-store-ink">
      {header}

      <main className="flex-1 pb-28">
        {/* Hero */}
        <section className="relative overflow-hidden bg-store-night text-store-cream">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, #C9A46A 0%, transparent 65%)' }}
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-20">
            <div className="flex flex-col items-start gap-5">
              {business.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.photo} alt={`${business.name} logo`} className="h-16 w-16 rounded-full object-cover ring-2 ring-store-gold/50 md:h-20 md:w-20" />
              )}
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-store-gold">{eyebrow}</p>
              <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-wide md:text-7xl">{business.name}</h1>
              {business.shop_description && (
                <p className="max-w-md text-base leading-relaxed text-store-cream/75 md:text-lg">{business.shop_description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3">
                <a href="#collection" className="inline-flex items-center rounded-full bg-store-gold px-6 py-3 font-semibold text-store-night hover:bg-[#d8b47c]">Shop the collection</a>
                {chatLink && (
                  <a href={chatLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full border border-store-cream/30 px-6 py-3 font-semibold text-store-cream hover:bg-white/10">
                    Chat on WhatsApp
                  </a>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-store-cream/60">
                <li>✦ No app or login</li>
                {business.upi_id && <li>✦ Pay easily by UPI</li>}
                {chatLink && <li>✦ Help on WhatsApp</li>}
              </ul>
            </div>

            {heroPhotos.length > 0 && (
              <div className={`grid h-72 gap-3 sm:h-96 md:h-[460px] ${heroPhotos.length >= 3 ? 'grid-cols-2 grid-rows-2' : heroPhotos.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {heroPhotos.map((p, i) => (
                  <div key={p.url} className={`overflow-hidden rounded-3xl bg-store-ink ring-1 ring-white/10 ${heroPhotos.length >= 3 && i === 0 ? 'row-span-2' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Collection */}
        <section id="collection" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-6 px-4 py-10 sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-store-golddark">Shop</p>
              <h2 className="font-display text-4xl font-semibold md:text-5xl">The Collection</h2>
            </div>
            <p className="text-sm text-store-ink/60">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</p>
          </div>

          {categories.length > 0 && (
            <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Categories">
              <button onClick={() => setCategory('all')} className={chip(category === 'all')}>All</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id)}>{c.name}</button>
              ))}
            </nav>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-store-ink/40" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or code" aria-label="Search items" className={`${inputClass} pl-10`} />
            </div>
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort items" className="h-12 rounded-full border border-store-line bg-white px-4 text-sm outline-none focus:border-store-gold">
              <option value="new">Newest</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </div>

          {items.length === 0 ? (
            <p className="py-16 text-center text-store-ink/60">No pieces to show yet.</p>
          ) : shown.length === 0 ? (
            <p className="py-16 text-center text-store-ink/60">No pieces found.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map(item => {
                const inBag = cart[item.id] ?? 0
                const soldOut = item.stock != null && item.stock <= 0
                const maxed = inBag >= maxQty(item)
                const photos = photosOf(item)
                const tags = itemTags(item.tags)
                const off = item.mrp_paise && item.mrp_paise > item.price_paise
                  ? Math.round(((item.mrp_paise - item.price_paise) / item.mrp_paise) * 100)
                  : 0
                const desc = item.description ?? ''
                const long = desc.length > 140 || desc.split('\n').length > 3
                const showAll = expanded[item.id]
                const ask = waLink(business.phone, `Hi, I'm interested in ${item.name}${item.code ? ` (${item.code})` : ''}. Is it available?`)
                return (
                  <article
                    key={item.id}
                    id={`item-${item.id}`}
                    className={`flex gap-4 rounded-3xl border bg-white p-3 sm:p-4 ${linkedItem?.id === item.id ? 'border-store-gold ring-2 ring-store-gold/40' : 'border-store-line'}`}
                  >
                    <button
                      type="button"
                      onClick={() => photos.length && setViewer({ item, index: 0 })}
                      className="relative h-36 w-28 shrink-0 overflow-hidden rounded-2xl bg-store-sand sm:h-44 sm:w-36"
                      aria-label={photos.length ? `View photos of ${item.name}` : `${item.name}, no photo`}
                    >
                      {photos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photos[0]} alt={item.name} loading="lazy" className={`h-full w-full object-cover ${soldOut ? 'opacity-50 grayscale' : ''}`} />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-store-ink/40">No photo</span>
                      )}
                      {photos.length > 1 && (
                        <span className="absolute bottom-2 right-2 rounded-full bg-store-night/75 px-2 py-0.5 text-[11px] font-bold text-store-cream">1/{photos.length}</span>
                      )}
                      {photos.length > 0 && (
                        <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-store-ink shadow-sm" aria-hidden="true">
                          <Maximize2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {item.code && <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.2em] text-store-golddark">{item.code}</span>}
                        {soldOut ? (
                          <span className="rounded-full bg-store-ink px-2.5 py-1 text-xs font-bold text-store-cream">Sold out</span>
                        ) : (
                          tags.map(t => <span key={t.key} className={`rounded-full px-2.5 py-1 text-xs font-bold ${t.style}`}>{t.label}</span>)
                        )}
                      </div>
                      <h3 className="font-display text-2xl font-semibold leading-tight">{item.name}</h3>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-lg font-bold">{formatRupees(item.price_paise)}</span>
                        {off > 0 && (
                          <>
                            <span className="text-sm text-store-ink/50 line-through">{formatRupees(item.mrp_paise)}</span>
                            <span className="text-xs font-bold text-green-700">{off}% off</span>
                          </>
                        )}
                        {!soldOut && item.stock != null && item.stock <= 2 && (
                          <span className="text-xs font-bold text-amber-800">Only {item.stock} left</span>
                        )}
                      </div>

                      {desc && (
                        <div className="text-sm leading-relaxed text-store-ink/75">
                          <p className={`whitespace-pre-line ${long && !showAll ? 'line-clamp-3' : ''}`}>{desc}</p>
                          {long && (
                            <button
                              type="button"
                              onClick={() => setExpanded(e => ({ ...e, [item.id]: !showAll }))}
                              aria-expanded={!!showAll}
                              className="mt-0.5 text-xs font-bold text-store-golddark underline"
                            >
                              {showAll ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mt-auto flex items-center gap-2 pt-2">
                        {!soldOut && (
                          <button
                            type="button"
                            onClick={() => addToBag(item)}
                            disabled={maxed}
                            className={`flex h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-bold transition disabled:opacity-50 sm:flex-none ${justAdded === item.id ? 'bg-store-gold text-store-night' : 'bg-store-ink text-store-cream hover:bg-black'}`}
                          >
                            {justAdded === item.id ? 'Added ✓' : maxed ? 'All in bag' : inBag ? `Add more (${inBag} in bag)` : 'Add to bag'}
                          </button>
                        )}
                        {ask && (
                          <a href={ask} target="_blank" rel="noopener noreferrer" aria-label={`Ask about ${item.name} on WhatsApp`} className="flex h-10 items-center justify-center rounded-full border border-store-line px-4 text-sm font-semibold hover:bg-store-sand">
                            Ask
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {footer}

      {count > 0 && (
        <button
          onClick={() => { setView('bag'); window.scrollTo(0, 0) }}
          className="fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-full bg-store-ink px-6 py-4 text-store-cream shadow-2xl hover:bg-black"
        >
          <span className="text-sm font-semibold">{count} {count === 1 ? 'piece' : 'pieces'} · {formatRupees(subtotal)}</span>
          <span className="font-bold text-store-gold">View bag →</span>
        </button>
      )}

      {viewer && (
        <PhotoViewer photos={photosOf(viewer.item)} start={viewer.index} title={viewer.item.name} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}
