'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteInteraction } from '@/app/actions/leads'
import EditInteractionDialog from './edit-interaction-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHead, toggleSort, type SortState } from '@/components/ui/sortable-table-head'
import { INTERACTION_TYPES, type InteractionType } from '@/types'
import { Trash2 } from 'lucide-react'

export interface InteractionRow {
  id: string
  type: InteractionType
  notes: string | null
  occurredAt: string
  durationMinutes: number | null
  location: string | null
  amount: number | null
  followUpDate: string | null
}

const TYPE_LABELS: Record<InteractionType, string> = Object.fromEntries(
  INTERACTION_TYPES.map(t => [t.value, t.label])
) as Record<InteractionType, string>

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function followUpBadgeClass(followUpDate: string, today: string) {
  if (followUpDate < today) return 'text-red-600 font-medium'
  if (followUpDate === today) return 'text-[#F15A24] font-medium'
  return 'text-gray-600'
}

function formatDetails(row: InteractionRow) {
  switch (row.type) {
    case 'call':
      return row.durationMinutes != null ? `${row.durationMinutes} min` : '—'
    case 'meeting':
    case 'site_visit':
      return row.location || '—'
    case 'offer':
      return row.amount != null ? row.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'
    default:
      return '—'
  }
}

type SortKey = 'date' | 'type'

function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export default function InteractionLog({ leadId, interactions }: { leadId: string; interactions: InteractionRow[] }) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'date', direction: 'desc' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()
  const today = todayStr()

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...interactions].sort((a, b) => {
      switch (sort.key) {
        case 'date': return cmp(a.occurredAt, b.occurredAt) * dir
        case 'type': return cmp(a.type, b.type) * dir
      }
    })
  }, [interactions, sort])

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this interaction? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await deleteInteraction(id, leadId)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete interaction')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <SortableHead label="Date" sortKey="date" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
            <SortableHead label="Type" sortKey="type" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
            <TableHead className="font-medium">Details</TableHead>
            <TableHead className="font-medium">Notes</TableHead>
            <TableHead className="font-medium">Follow-up</TableHead>
            <TableCell className="h-10 px-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                No interactions logged yet.
              </TableCell>
            </TableRow>
          )}
          {sorted.map(row => (
            <TableRow key={row.id} className="hover:bg-gray-50">
              <TableCell className="text-gray-600 whitespace-nowrap">{formatDate(row.occurredAt)}</TableCell>
              <TableCell>
                <span className="font-medium text-gray-900">{TYPE_LABELS[row.type]}</span>
              </TableCell>
              <TableCell className="text-gray-600">{formatDetails(row)}</TableCell>
              <TableCell className="text-gray-500">{row.notes || '—'}</TableCell>
              <TableCell className={row.followUpDate ? followUpBadgeClass(row.followUpDate, today) : 'text-gray-400'}>
                {row.followUpDate ? formatDate(row.followUpDate) : '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <EditInteractionDialog
                    leadId={leadId}
                    interaction={{
                      id: row.id,
                      type: row.type,
                      notes: row.notes,
                      occurredAt: row.occurredAt,
                      durationMinutes: row.durationMinutes,
                      location: row.location,
                      amount: row.amount,
                      followUpDate: row.followUpDate,
                    }}
                  />
                  <button
                    onClick={() => handleDelete(row.id)}
                    disabled={deletingId === row.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Delete interaction"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
