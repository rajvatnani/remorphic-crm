'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveItem, deleteItem, type ItemInput } from '@/app/actions/orders'
import { formatRupees, toRupeesInput } from '@/lib/money'
import type { Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'

function ItemDialog({ item, open, onClose }: { item: Item | null; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
        <form key={item?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4 mt-2">
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
            Available to add to new orders
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#F15A24] hover:bg-[#d44d1b] text-white" disabled={pending}>
              {pending ? 'Saving…' : 'Save item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ItemList({ items }: { items: Item[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => i.name.toLowerCase().includes(q) || (i.code ?? '').toLowerCase().includes(q))
  }, [items, search])

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
        <Button onClick={() => setAdding(true)} className="bg-[#F15A24] hover:bg-[#d44d1b] text-white gap-2">
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">In stock</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  {items.length === 0 ? 'No items yet. Add what you sell.' : `No items match "${search}".`}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(item => (
              <TableRow key={item.id} className={item.active ? '' : 'opacity-50'}>
                <TableCell>
                  <span className="font-medium text-gray-900">{item.name}</span>
                  {!item.active && <Badge className="ml-2 bg-gray-100 text-gray-500 border-0 text-xs">Hidden</Badge>}
                </TableCell>
                <TableCell className="text-gray-500">{item.code || '—'}</TableCell>
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

      <ItemDialog item={editing} open={adding || editing !== null} onClose={() => { setAdding(false); setEditing(null) }} />
    </div>
  )
}
