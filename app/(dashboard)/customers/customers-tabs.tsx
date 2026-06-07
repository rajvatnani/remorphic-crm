'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteCustomer } from '@/app/actions/customers'
import EditCustomerDialog from './edit-customer-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

interface VisitRow {
  id: string
  service: string
  visitedAt: string
  notes: string | null
  customerId: string
  customerName: string
  customerPhone: string
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatVisitDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dateNDaysAgo(n: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const PERIODS = [
  { value: 'daily', label: 'Daily', sinceDaysAgo: 0 },
  { value: 'weekly', label: 'Weekly', sinceDaysAgo: 6 },
  { value: 'monthly', label: 'Monthly', sinceDaysAgo: 29 },
] as const

function VisitLog({ visits, label }: { visits: VisitRow[]; label: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('daily')

  const filtered = useMemo(() => {
    const config = PERIODS.find(p => p.value === period)!
    const sinceStr = dateNDaysAgo(config.sinceDaysAgo)
    return visits.filter(v => v.visitedAt >= sinceStr)
  }, [visits, period])

  return (
    <div>
      <Tabs value={period} onValueChange={value => setPeriod(value as typeof period)}>
        <TabsList className="mb-4">
          {PERIODS.map(p => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-sm text-gray-500 mb-3">
        {filtered.length} visit{filtered.length === 1 ? '' : 's'}{' '}
        {period === 'daily' ? 'today' : period === 'weekly' ? 'in the last 7 days' : 'in the last 30 days'}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="font-medium">Date</TableHead>
              <TableHead className="font-medium">{label}</TableHead>
              <TableHead className="font-medium">Phone</TableHead>
              <TableHead className="font-medium">Service</TableHead>
              <TableHead className="font-medium">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                  No visits in this period.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(visit => (
              <TableRow key={visit.id} className="hover:bg-gray-50">
                <TableCell className="text-gray-600 whitespace-nowrap">{formatVisitDate(visit.visitedAt)}</TableCell>
                <TableCell>
                  <Link href={`/customers/${visit.customerId}`} className="font-medium text-gray-900 hover:underline">
                    {visit.customerName}
                  </Link>
                </TableCell>
                <TableCell className="text-gray-600">{visit.customerPhone}</TableCell>
                <TableCell className="text-gray-600">{visit.service}</TableCell>
                <TableCell className="text-gray-500">{visit.notes || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function CustomerList({ customers, label }: { customers: CustomerRow[]; label: string }) {
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
    if (!query) return customers
    return customers.filter(
      c => c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query)
    )
  }, [customers, search])

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="font-medium">Name</TableHead>
              <TableHead className="font-medium">Phone</TableHead>
              <TableHead className="font-medium">Last Visit</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium text-center">Visits</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  {customers.length === 0
                    ? `No ${label.toLowerCase()}s yet. Add your first one!`
                    : `No ${label.toLowerCase()}s match "${search}".`}
                </TableCell>
              </TableRow>
            )}
            {filtered.map(row => (
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

export default function CustomersTabs({
  label,
  customers,
  visits,
}: {
  label: string
  customers: CustomerRow[]
  visits: VisitRow[]
}) {
  return (
    <Tabs defaultValue="list">
      <TabsList className="mb-4">
        <TabsTrigger value="list">{label}s</TabsTrigger>
        <TabsTrigger value="visits">Visit Log</TabsTrigger>
      </TabsList>
      <TabsContent value="list">
        <CustomerList customers={customers} label={label} />
      </TabsContent>
      <TabsContent value="visits">
        <VisitLog visits={visits} label={label} />
      </TabsContent>
    </Tabs>
  )
}
