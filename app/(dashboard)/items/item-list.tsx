'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveItem, deleteItem, type ItemInput } from '@/app/actions/orders'
import { formatRupees, toRupeesInput } from '@/lib/money'
import { compressImage } from '@/lib/image'
import { createClient } from '@/lib/supabase/client'
import type { Item, ItemCategory } from '@/types'
import CategoriesDialog from './categories-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Search, ImagePlus, Package, Tags } from 'lucide-react'

function ItemDialog({ item, open, onClose, businessId, categories }: { item: Item | null; open: boolean; onClose: () => void; businessId: string; categories: ItemCategory[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [photo, setPhoto] = useState<string | null>(item?.photo_url ?? null)
  const [uploading, setUploading] = useState(false)

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const blob = await compressImage(file)
      const supabase = createClient()
      const path = `${businessId}/items/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from('business-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw new Error(upErr.message)
      setPhoto(supabase.storage.from('business-photos').getPublicUrl(path).data.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.')
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const input: ItemInput = {
      name: String(f.get('name') ?? ''),
      code: String(f.get('code') ?? ''),
      description: String(f.get('description') ?? ''),
      price: String(f.get('price') ?? ''),
      cost: String(f.get('cost') ?? ''),
      stock: String(f.get('stock') ?? ''),
      active: f.get('active') === 'on',
      photo_url: photo,
      category_id: String(f.get('category_id') ?? '') || null,
    }
    setError(null)
    startTransition(async () => {
      const res = await saveItem(item?.id ?? null, input)
      if (!res.ok) { setError(res.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add item'}</DialogTitle>
        </DialogHeader>
        {/* key resets the form when a different item is opened */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="flex items-center gap-3">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-300" />
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F15A24] cursor-pointer hover:underline">
              <ImagePlus className="w-4 h-4" />
              {uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" disabled={uploading} />
            </label>
            {photo && !uploading && (
              <button type="button" onClick={() => setPhoto(null)} className="text-xs text-gray-400 hover:text-red-600">Remove</button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="item_name">Name</Label>
              <Input id="item_name" name="name" defaultValue={item?.name} placeholder="e.g. Silver bowl, 6 inch" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item_code">Code <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="item_code" name="code" defaultValue={item?.code ?? ''} placeholder="GS-101" />
            </div>
          </div>
          {categories.length > 0 && (
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
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item_price">Selling price ₹</Label>
              <Input id="item_price" name="price" inputMode="decimal" defaultValue={toRupeesInput(item?.price_paise)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item_cost">Cost ₹ <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="item_cost" name="cost" inputMode="decimal" defaultValue={toRupeesInput(item?.cost_paise)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item_stock">In stock <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="item_stock" name="stock" inputMode="numeric" defaultValue={item?.stock ?? ''} placeholder="Not tracked" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item_desc">Description <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea id="item_desc" name="description" rows={2} defaultValue={item?.description ?? ''} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
            On sale (shown in your shop and available for new orders)
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#F15A24] hover:bg-[#d44d1b] text-white" disabled={pending || uploading}>
              {pending ? 'Saving…' : 'Save item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ItemList({
  items,
  categories,
  businessId,
}: {
  items: Item[]
  categories: ItemCategory[]
  businessId: string
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [managing, setManaging] = useState(false)
  const categoryName = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const itemCounts: Record<string, number> = {}
  for (const i of items) if (i.category_id) itemCounts[i.category_id] = (itemCounts[i.category_id] ?? 0) + 1

  const router = useRouter()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      if (categoryFilter === 'none' && i.category_id) return false
      if (categoryFilter !== 'all' && categoryFilter !== 'none' && i.category_id !== categoryFilter) return false
      return !q || i.name.toLowerCase().includes(q) || (i.code ?? '').toLowerCase().includes(q)
    })
  }, [items, search, categoryFilter])

  async function handleDelete(item: Item) {
    if (!window.confirm(`Delete ${item.name}? Past orders keep their copy of it.`)) return
    const res = await deleteItem(item.id)
    if (!res.ok) alert(res.error)
    else router.refresh()
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Items</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setManaging(true)} className="gap-2">
            <Tags className="h-4 w-4" /> Categories
          </Button>
          <Button onClick={() => setAdding(true)} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white gap-2">
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative max-w-sm flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring"
        />
      </div>
      {categories.length > 0 && (
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">No category</option>
        </select>
      )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  {items.length === 0 ? 'No items yet. Add what you sell.' : 'No items match.'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(item => (
              <TableRow key={item.id} className={item.active ? '' : 'opacity-50'}>
                <TableCell>
                  <div className="flex items-center gap-3">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gray-50 shrink-0" />
                  )}
                  <span className="font-medium text-gray-900">{item.name}</span>
                  {!item.active && <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Hidden</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-gray-500">{item.code || '—'}</TableCell>
                <TableCell className="text-gray-500">{(item.category_id && categoryName[item.category_id]) || '—'}</TableCell>
                <TableCell className="text-right">{formatRupees(item.price_paise)}</TableCell>
                <TableCell className="text-right text-gray-500">{item.cost_paise != null ? formatRupees(item.cost_paise) : '—'}</TableCell>
                <TableCell className={`text-right ${item.stock != null && item.stock <= 0 ? 'text-red-600 font-medium' : ''}`}>
                  {item.stock ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Edit item">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(adding || editing) && (
        <ItemDialog
          key={editing?.id ?? 'new'}
          item={editing}
          open
          businessId={businessId}
          categories={categories}
          onClose={() => { setAdding(false); setEditing(null) }}
        />
      )}
      {managing && (
        <CategoriesDialog
          key={categories.map(c => c.id + c.name).join()}
          categories={categories}
          itemCounts={itemCounts}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  )
}
