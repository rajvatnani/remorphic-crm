'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteCustomer } from '@/app/actions/customers'
import EditCustomerDialog from './edit-customer-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHead, toggleSort, type SortState } from '@/components/ui/sortable-table-head'
import { Search, Trash2 } from 'lucide-react'

interface CustomerRow {
  id: string
  name: string
  phone: string
  gender: 'male' | 'female' | 'other' | null
  dob: string | null
  lastVisit: string | null
  isActive: boolean
  totalVisits: number
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type SortKey = 'name' | 'phone' | 'lastVisit' | 'status' | 'visits'

function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

type StatusFilter = 'all' | 'active' | 'inactive'

export default function CustomerList({ customers, label }: { customers: CustomerRow[]; label: string }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'name', direction: 'asc' })
  const router = useRouter()

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This will also remove their visit history. This cannot be undone.`)) {
      return
    }
    setDeletingId(id)
    try {
      await deleteCustomer(id)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to delete ${label.toLowerCase()}`)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers.filter(c => {
      if (statusFilter === 'active' && !c.isActive) return false
      if (statusFilter === 'inactive' && c.isActive) return false
      if (!query) return true
      return c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query)
    })
  }, [customers, search, statusFilter])

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name': return cmp(a.name, b.name) * dir
        case 'phone': return cmp(a.phone, b.phone) * dir
        case 'lastVisit': return cmp(a.lastVisit ?? '', b.lastVisit ?? '') * dir
        case 'status': return (Number(a.isActive) - Number(b.isActive)) * dir
        case 'visits': return (a.totalVisits - b.totalVisits) * dir
      }
    })
  }, [filtered, sort])

  function handleSort(key: SortKey) {
    setSort(s => toggleSort(s, key))
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}s by name or phone…`}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            autoComplete="off"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <SortableHead label="Name" sortKey="name" sort={sort} onSort={handleSort} />
              <SortableHead label="Phone" sortKey="phone" sort={sort} onSort={handleSort} />
              <SortableHead label="Last Visit" sortKey="lastVisit" sort={sort} onSort={handleSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <SortableHead label="Visits" sortKey="visits" sort={sort} onSort={handleSort} className="text-center" />
              <TableCell className="h-10 px-2" />
              <TableCell className="h-10 px-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  {customers.length === 0
                    ? `No ${label.toLowerCase()}s yet. Add your first one!`
                    : search
                      ? `No ${label.toLowerCase()}s match "${search}".`
                      : `No ${label.toLowerCase()}s match the selected status.`}
                </TableCell>
              </TableRow>
            )}
            {sorted.map(row => (
              <TableRow key={row.id} className="hover:bg-gray-50">
                <TableCell>
                  <span className="font-medium text-gray-900">{row.name}</span>
                </TableCell>
                <TableCell className="text-gray-600">{row.phone}</TableCell>
                <TableCell className="text-gray-600">{formatDate(row.lastVisit)}</TableCell>
                <TableCell>
                  <Badge
                    variant={row.isActive ? 'default' : 'secondary'}
                    className={
                      row.isActive
                        ? 'bg-[#F15A24]/10 text-[#F15A24] hover:bg-[#F15A24]/20 border-0'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-0'
                    }
                  >
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-gray-600">{row.totalVisits}</TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/customers/${row.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-orange-50"
                    style={{ color: '#F15A24', borderColor: '#F15A24' }}
                  >
                    View Visits →
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <EditCustomerDialog customer={row} label={label} />
                    <button
                      onClick={() => handleDelete(row.id, row.name)}
                      disabled={deletingId === row.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title={`Delete ${label.toLowerCase()}`}
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
