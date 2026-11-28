'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveItem, type ItemInput } from '@/app/actions/orders'
import { describeItemFromPhoto } from '@/app/actions/ai'
import { toRupeesInput } from '@/lib/money'
import { compressImage } from '@/lib/image'
import { createClient } from '@/lib/supabase/client'
import { ITEM_TAGS } from '@/lib/item-tags'
import type { Item, ItemCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, X, Star, Sparkles } from 'lucide-react'

const MAX_PHOTOS = 5

/**
 * Add, edit or duplicate an item. `item` with `duplicate` starts a new item
 * from a copy of it (same details and photos, new code).
 */
export default function ItemDialog({
  item,
  duplicate = false,
  onClose,
  businessId,
  categories,
  defaultLowStock,
  aiReady = false,
}: {
  /** ANTHROPIC_API_KEY is set on the server */
  aiReady?: boolean
  item: Item | null
  duplicate?: boolean
  onClose: () => void
  businessId: string
  categories: ItemCategory[]
  defaultLowStock: number
}) {
  const router = useRouter()
  const editing = item && !duplicate ? item : null
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [photos, setPhotos] = useState<string[]>(
    () => item?.photos?.length ? item.photos : item?.photo_url ? [item.photo_url] : []
  )
  const [tags, setTags] = useState<string[]>(item?.tags ?? [])
  const [uploading, setUploading] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const [aiPending, setAiPending] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)

  async function fillWithAi() {
    const form = formRef.current
    if (!form || !photos[0]) return
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    setError(null)
    setAiNote(null)
    setAiPending(true)
    try {
      const res = await describeItemFromPhoto(photos[0], {
        name: field('name')?.value,
        description: field('description')?.value,
      })
      if (!res.ok) { setError(res.error); return }
      const { name, description, category_id, tags: aiTags } = res.data
      if (field('name')) field('name')!.value = name
      if (field('description')) field('description')!.value = description
      if (category_id && field('category_id')) field('category_id')!.value = category_id
      if (aiTags.length) setTags(t => [...new Set([...t, ...aiTags])])
      setAiNote('Filled in by AI. Check it before saving.')
    } catch {
      setError('AI could not be reached. Please try again.')
    } finally {
      setAiPending(false)
    }
  }

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length)
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setUploading(files.length)
    const supabase = createClient()
    for (const file of files) {
      try {
        const blob = await compressImage(file)
        const path = `${businessId}/items/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('business-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw new Error(upErr.message)
        const url = supabase.storage.from('business-photos').getPublicUrl(path).data.publicUrl
        setPhotos(p => [...p, url].slice(0, MAX_PHOTOS))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload a photo.')
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  function toggleTag(key: string) {
    setTags(t => (t.includes(key) ? t.filter(k => k !== key) : [...t, key]))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '')
    const input: ItemInput = {
      name: get('name'),
      code: get('code'),
      description: get('description'),
      price: get('price'),
      cost: get('cost'),
      mrp: get('mrp'),
      stock: get('stock'),
      low_stock_level: get('low_stock_level'),
      wholesaler: get('wholesaler'),
      category_id: get('category_id') || null,
      active: f.get('active') === 'on',
      tags,
      photos,
    }
    setError(null)
    startTransition(async () => {
      const res = await saveItem(editing?.id ?? null, input)
      if (!res.ok) { setError(res.error); return }
      onClose()
      router.refresh()
    })
  }

  const title = editing ? `Edit ${editing.code ?? 'item'}` : duplicate ? 'Duplicate item' : 'Add item'

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_260px] mt-2">
          {/* Details */}
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="item_name">Item name</Label>
                <Input id="item_name" name="name" defaultValue={item ? `${item.name}${duplicate ? ' (copy)' : ''}` : ''} required maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_code">Code</Label>
                <Input
                  id="item_code"
                  name="code"
                  defaultValue={editing?.code ?? ''}
                  placeholder={editing ? '' : 'Automatic'}
                  className="uppercase placeholder:normal-case"
                  maxLength={30}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item_category">Category</Label>
                <select
                  id="item_category"
                  name="category_id"
                  defaultValue={item?.category_id ?? ''}
                  className="w-full h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
                >
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_wholesaler">Wholesaler <span className="text-gray-400 font-normal">(only you see this)</span></Label>
                <Input id="item_wholesaler" name="wholesaler" defaultValue={item?.wholesaler ?? ''} maxLength={120} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item_cost">Cost ₹</Label>
                <Input id="item_cost" name="cost" inputMode="decimal" defaultValue={toRupeesInput(item?.cost_paise)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_price">Selling ₹</Label>
                <Input id="item_price" name="price" inputMode="decimal" defaultValue={toRupeesInput(item?.price_paise)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_mrp">MRP ₹</Label>
                <Input id="item_mrp" name="mrp" inputMode="decimal" defaultValue={toRupeesInput(item?.mrp_paise)} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item_stock">Stock</Label>
                <Input
                  id="item_stock"
                  name="stock"
                  inputMode="numeric"
                  defaultValue={item?.stock ?? ''}
                  placeholder="Not tracked"
                />
                {editing && editing.stock != null && (
                  <p className="text-[11px] text-gray-400">For a restock or damage, tap the stock number in the list instead, so the reason is recorded.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item_low">Low-stock alert at</Label>
                <Input
                  id="item_low"
                  name="low_stock_level"
                  inputMode="numeric"
                  defaultValue={item?.low_stock_level ?? ''}
                  placeholder={`Shop default (${defaultLowStock})`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item_desc">Description</Label>
              <Textarea id="item_desc" name="description" rows={4} defaultValue={item?.description ?? ''} placeholder="Size, material, care notes" />
            </div>

            <div className="space-y-2">
              <Label>Tags on the shop page</Label>
              <div className="flex flex-wrap gap-2">
                {ITEM_TAGS.map(t => {
                  const on = tags.includes(t.key)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTag(t.key)}
                      aria-pressed={on}
                      className={`px-3 h-8 rounded-full text-sm font-medium border transition-colors ${on ? `${t.style} border-transparent` : 'bg-white text-gray-700 border-fest-line hover:border-gray-300'}`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400">Tap to add or remove. Customers see these on the item photo.</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="h-4 w-4 accent-[#C81E5B]" />
              Show in shop and new orders
            </label>
          </div>

          {/* Photos and save */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-fest-line p-3 space-y-2">
              <p className="text-sm font-medium text-fest-ink">Photos ({photos.length}/{MAX_PHOTOS})</p>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => (
                  <div key={url} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full rounded-lg object-cover border border-fest-line" />
                    {i === 0 ? (
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">Cover</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPhotos(p => [url, ...p.filter(u => u !== url)])}
                        className="absolute bottom-1 left-1 rounded bg-white/90 p-0.5"
                        title="Make cover photo"
                      >
                        <Star className="w-3 h-3 text-gray-700" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPhotos(p => p.filter(u => u !== url))}
                      className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3 text-gray-700" />
                    </button>
                  </div>
                ))}
                {uploading > 0 && Array.from({ length: uploading }).map((_, i) => (
                  <div key={`up${i}`} className="aspect-square rounded-lg bg-gray-100 animate-pulse" />
                ))}
                {photos.length + uploading < MAX_PHOTOS && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-fest-line flex flex-col items-center justify-center text-xs text-gray-500 cursor-pointer hover:border-[#C81E5B] hover:text-[#C81E5B]">
                    <Plus className="w-4 h-4" /> Add
                    <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-gray-400">The first photo is the cover. Tap ★ to make another one the cover.</p>
              <button
                type="button"
                onClick={fillWithAi}
                disabled={!aiReady || !photos.length || aiPending || uploading > 0}
                className="w-full h-10 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'linear-gradient(90deg, #C81E5B, #e0567a)' }}
              >
                <Sparkles className="w-4 h-4" /> {aiPending ? 'Writing…' : 'Fill details from photo with AI'}
              </button>
              <p className="text-[11px] text-gray-500">
                {!aiReady
                  ? 'AI is not set up yet.'
                  : !photos.length
                    ? 'Add a photo, then let AI write the name, description, category and tags.'
                    : 'Uses the cover photo and your AI instructions in Settings.'}
              </p>
              {aiNote && <p className="text-[11px] text-green-700 bg-green-50 rounded px-2 py-1">{aiNote}</p>}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
            <Button type="submit" disabled={pending || uploading > 0} className="w-full h-11 bg-[#C81E5B] hover:bg-[#A81549] text-white">
              {pending ? 'Saving…' : uploading > 0 ? 'Uploading photos…' : 'Save item'}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
