'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteItem, setItemArchived } from '@/app/actions/orders'
import { formatRupees } from '@/lib/money'
import type { Item, ItemCategory } from '@/types'
import ItemDialog from './item-dialog'
import CategoriesDialog from './categories-dialog'
import StockDialog from './stock-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Search, Tags, Copy, Archive, ArchiveRestore } from 'lucide-react'

export default function ItemList({
  items,
  categories,
  businessId,
  defaultLowStock,
}: {
  items: Item[]
  categories: ItemCategory[]
  businessId: string
  defaultLowStock: number
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [duplicating, setDuplicating] = useState<Item | null>(null)
  const archivedCount = items.filter(i => i.archived).length
  const isLow = (i: Item) => i.stock != null && i.stock <= (i.low_stock_level ?? defaultLowStock)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [managing, setManaging] = useState(false)
  const [stockFor, setStockFor] = useState<string | null>(null)
  const stockItem = items.find(i => i.id === stockFor) ?? null
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
      if (Boolean(i.archived) !== showArchived) return false
      if (categoryFilter === 'none' && i.category_id) return false
      if (categoryFilter !== 'all' && categoryFilter !== 'none' && i.category_id !== categoryFilter) return false
      return !q || i.name.toLowerCase().includes(q) || (i.code ?? '').toLowerCase().includes(q) || (i.wholesaler ?? '').toLowerCase().includes(q)
    })
  }, [items, search, categoryFilter, showArchived])

  async function handleArchive(item: Item, archived: boolean) {
    const res = await setItemArchived(item.id, archived)
    if (!res.ok) alert(res.error)
    else router.refresh()
  }

  async function handleDelete(item: Item) {
    if (!window.confirm(`Delete ${item.name} for good? Its stock history goes too; past orders keep their copy. To just hide it, use Archive instead.`)) return
    const res = await deleteItem(item.id)
    if (!res.ok) alert(res.error)
    else router.refresh()
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Items</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length - archivedCount} items{archivedCount ? ` · ${archivedCount} archived` : ''}</p>
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
          placeholder="Search by name, code or wholesaler…"
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
      {archivedCount > 0 && (
        <button
          onClick={() => setShowArchived(a => !a)}
          className={`h-9 px-3 rounded-lg text-sm font-medium ${showArchived ? 'bg-gray-900 text-white' : 'border border-input text-gray-600 hover:bg-gray-50'}`}
        >
          {showArchived ? 'Back to items' : `Archived (${archivedCount})`}
        </button>
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
                  {items.length === 0 ? 'No items yet. Add what you sell.' : showArchived ? 'No archived items match.' : 'No items match.'}
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
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-900">{item.name}</span>
                    {item.wholesaler && <span className="block text-[11px] text-gray-400">{item.wholesaler}</span>}
                  </span>
                  {!item.active && <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Hidden</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-gray-500">{item.code || '—'}</TableCell>
                <TableCell className="text-gray-500">{(item.category_id && categoryName[item.category_id]) || '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatRupees(item.price_paise)}
                  {item.mrp_paise != null && item.mrp_paise > item.price_paise && (
                    <span className="block text-[11px] text-gray-400 line-through">{formatRupees(item.mrp_paise)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-gray-500">{item.cost_paise != null ? formatRupees(item.cost_paise) : '—'}</TableCell>
                <TableCell className="text-right">
                  {item.stock == null ? (
                    <span className="text-gray-400" title="Not tracked. Enter a stock count when editing the item to track it.">—</span>
                  ) : (
                    <button
                      onClick={() => setStockFor(item.id)}
                      title="Adjust stock and see its history"
                      className={`min-w-10 px-2 py-1 rounded-lg border hover:border-[#F15A24] hover:text-[#F15A24] ${item.stock <= 0 ? 'text-red-600 font-medium border-red-200' : isLow(item) ? 'text-amber-700 font-medium border-amber-200 bg-amber-50' : 'border-gray-200'}`}
                    >
                      {item.stock}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Edit item">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDuplicating(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Duplicate, to add a variant fast">
                      <Copy className="h-4 w-4" />
                    </button>
                    {item.archived ? (
                      <button onClick={() => handleArchive(item, false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Restore from archive">
                        <ArchiveRestore className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => handleArchive(item, true)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Archive: hide from the shop, new orders and stock reports, keep its history">
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
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

      {(adding || editing || duplicating) && (
        <ItemDialog
          key={editing?.id ?? (duplicating ? `dup-${duplicating.id}` : 'new')}
          item={editing ?? duplicating}
          duplicate={Boolean(duplicating)}
          businessId={businessId}
          categories={categories}
          defaultLowStock={defaultLowStock}
          onClose={() => { setAdding(false); setEditing(null); setDuplicating(null) }}
        />
      )}
      {stockItem && <StockDialog item={stockItem} onClose={() => setStockFor(null)} />}
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
