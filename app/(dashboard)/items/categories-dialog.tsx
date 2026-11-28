'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCategory, deleteCategory, reorderCategories } from '@/app/actions/orders'
import type { ItemCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowUp, ArrowDown, Trash2, Check, Link2 } from 'lucide-react'

export default function CategoriesDialog({
  categories,
  itemCounts,
  shopPath = null,
  onClose,
}: {
  categories: ItemCategory[]
  itemCounts: Record<string, number>
  shopPath?: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [names, setNames] = useState<Record<string, string>>(
    () => Object.fromEntries(categories.map(c => [c.id, c.name]))
  )

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      after?.()
      router.refresh()
    })
  }

  function move(index: number, by: number) {
    const ids = categories.map(c => c.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id)
    run(() => reorderCategories(ids))
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 -mt-1">Your shop shows items grouped in this order.</p>

        <div className="space-y-2 mt-2">
          {categories.length === 0 && <p className="text-sm text-gray-400">No categories yet.</p>}
          {categories.map((c, i) => {
            const changed = (names[c.id] ?? c.name).trim() !== c.name
            return (
              <div key={c.id} className="flex items-center gap-1.5">
                <Input
                  value={names[c.id] ?? c.name}
                  onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value }))}
                  className="h-8 flex-1"
                  aria-label="Category name"
                />
                <span className="text-xs text-gray-400 w-14 text-right">{itemCounts[c.id] ?? 0} items</span>
                {changed ? (
                  <button onClick={() => run(() => saveCategory(c.id, names[c.id]))} disabled={pending} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50" title="Save name">
                    <Check className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button onClick={() => move(i, -1)} disabled={pending || i === 0} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30" title="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={pending || i === categories.length - 1} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30" title="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </>
                )}
                {shopPath && !changed && (
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`${window.location.origin}${shopPath}?category=${c.id}`)
                      setCopied(c.id)
                      setTimeout(() => setCopied(x => (x === c.id ? null : x)), 2000)
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                    title="Copy this category's shop link"
                  >
                    {copied === c.id ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${c.name}? Its items stay, without a category.`)) run(() => deleteCategory(c.id))
                  }}
                  disabled={pending}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Delete category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); run(() => saveCategory(null, newName), () => setNewName('')) }}
          className="flex gap-2 mt-3"
        >
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New category, e.g. Thalis" className="h-9" />
          <Button type="submit" disabled={pending || !newName.trim()} className="bg-[#C81E5B] hover:bg-[#A81549] text-white">Add</Button>
        </form>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
