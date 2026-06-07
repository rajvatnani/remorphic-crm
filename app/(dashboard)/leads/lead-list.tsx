'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteLead } from '@/app/actions/leads'
import EditLeadDialog from './edit-lead-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHead, toggleSort, type SortState } from '@/components/ui/sortable-table-head'
import { LEAD_STATUSES, type LeadStatus } from '@/types'
import { Search, Trash2 } from 'lucide-react'

interface LeadRow {
  id: string
  name: string
  phone: string
  interest: string | null
  status: LeadStatus
  created_at: string
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-0',
  contacted: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-0',
  qualified: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-0',
  converted: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-0',
  lost: 'bg-red-50 text-red-700 hover:bg-red-100 border-0',
}

const STATUS_LABELS: Record<LeadStatus, string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s.value, s.label])
) as Record<LeadStatus, string>

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type SortKey = 'name' | 'phone' | 'interest' | 'status' | 'created'

function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export default function LeadList({ leads }: { leads: LeadRow[] }) {
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'created', direction: 'desc' })
  const router = useRouter()

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This will also remove their interaction history. This cannot be undone.`)) {
      return
    }
    setDeletingId(id)
    try {
      await deleteLead(id)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete lead')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return leads
    return leads.filter(
      l =>
        l.name.toLowerCase().includes(query) ||
        l.phone.toLowerCase().includes(query) ||
        (l.interest ?? '').toLowerCase().includes(query)
    )
  }, [leads, search])

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name': return cmp(a.name, b.name) * dir
        case 'phone': return cmp(a.phone, b.phone) * dir
        case 'interest': return cmp(a.interest ?? '', b.interest ?? '') * dir
        case 'status': return cmp(a.status, b.status) * dir
        case 'created': return cmp(a.created_at, b.created_at) * dir
      }
    })
  }, [filtered, sort])

  function handleSort(key: SortKey) {
    setSort(s => toggleSort(s, key))
  }

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search leads by name, phone, or interest…"
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          autoComplete="off"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <SortableHead label="Name" sortKey="name" sort={sort} onSort={handleSort} />
              <SortableHead label="Phone" sortKey="phone" sort={sort} onSort={handleSort} />
              <SortableHead label="Interested In" sortKey="interest" sort={sort} onSort={handleSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <SortableHead label="Added" sortKey="created" sort={sort} onSort={handleSort} />
              <TableCell className="h-10 px-2" />
              <TableCell className="h-10 px-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  {leads.length === 0
                    ? 'No leads yet. Add your first one!'
                    : `No leads match "${search}".`}
                </TableCell>
              </TableRow>
            )}
            {sorted.map(row => (
              <TableRow key={row.id} className="hover:bg-gray-50">
                <TableCell>
                  <span className="font-medium text-gray-900">{row.name}</span>
                </TableCell>
                <TableCell className="text-gray-600">{row.phone}</TableCell>
                <TableCell className="text-gray-600">{row.interest || '—'}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLES[row.status]}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-600">{formatDate(row.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/leads/${row.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-orange-50"
                    style={{ color: '#F15A24', borderColor: '#F15A24' }}
                  >
                    View Interactions →
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <EditLeadDialog lead={row} />
                    <button
                      onClick={() => handleDelete(row.id, row.name)}
                      disabled={deletingId === row.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Delete lead"
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
    </div>
  )
}
