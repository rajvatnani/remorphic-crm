'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adjustStock, getStockMoves, type StockMove, type StockReason } from '@/app/actions/orders'
import type { Item } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const REASON_LABEL: Record<StockMove['reason'], string> = {
  order: 'Order',
  order_return: 'Returned from order',
  edit: 'Item edited',
  restock: 'Restock',
  damaged: 'Damaged or lost',
  correction: 'Count correction',
  other: 'Other',
}

const ADD_REASONS: StockReason[] = ['restock', 'correction', 'other']
const REMOVE_REASONS: StockReason[] = ['damaged', 'correction', 'other']

function fmt(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function StockDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const router = useRouter()
  const [moves, setMoves] = useState<StockMove[] | null>(null)
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<StockReason>('restock')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let stale = false
    getStockMoves(item.id).then(m => { if (!stale) setMoves(m) })
    return () => { stale = true }
  }, [item.id, item.stock])

  function pickDirection(d: 'add' | 'remove') {
    setDirection(d)
    setReason(d === 'add' ? 'restock' : 'damaged')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number.parseInt(qty, 10)
    if (!Number.isFinite(n) || n <= 0) { setError('Enter how many.'); return }
    setError(null)
    startTransition(async () => {
      const res = await adjustStock(item.id, direction === 'add' ? n : -n, reason, note)
      if (!res.ok) { setError(res.error ?? 'Could not save.'); return }
      setQty('')
      setNote('')
      router.refresh()
      setMoves(await getStockMoves(item.id))
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stock — {item.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 -mt-1">
          In stock now: <span className={`text-lg font-bold ${(item.stock ?? 0) <= 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.stock}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-gray-200 p-3">
          <div className="flex gap-1">
            {(['add', 'remove'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => pickDirection(d)}
                className={`flex-1 h-8 rounded-lg text-sm font-medium ${direction === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {d === 'add' ? 'Add stock' : 'Remove stock'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" placeholder="How many" aria-label="How many" />
            <select
              value={reason}
              onChange={e => setReason(e.target.value as StockReason)}
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none"
              aria-label="Reason"
            >
              {(direction === 'add' ? ADD_REASONS : REMOVE_REASONS).map(r => (
                <option key={r} value={r}>{REASON_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional), e.g. supplier bill no." />
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full bg-[#F15A24] hover:bg-[#d44d1b] text-white">
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>

        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2">History</p>
          {moves === null && <p className="text-sm text-gray-400">Loading…</p>}
          {moves?.length === 0 && <p className="text-sm text-gray-400">No changes recorded yet.</p>}
          {moves && moves.length > 0 && (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {moves.map(m => (
                <div key={m.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-gray-900">
                      {REASON_LABEL[m.reason] ?? m.reason}
                      {m.orders && ` #${m.orders.order_no}`}
                    </p>
                    {m.note && <p className="text-xs text-gray-500 truncate">{m.note}</p>}
                    <p className="text-xs text-gray-400">{fmt(m.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${m.change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.change > 0 ? '+' : ''}{m.change}
                    </p>
                    <p className="text-xs text-gray-400">→ {m.stock_after}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
