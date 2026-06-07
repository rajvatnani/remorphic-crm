'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHead, toggleSort, type SortState } from '@/components/ui/sortable-table-head'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

interface VisitRow {
  id: string
  service: string
  visitedAt: string
  notes: string | null
  customerId: string
  customerName: string
  customerPhone: string
}

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr() {
  return localDateStr(new Date())
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

function addMonths(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return localDateStr(d)
}

function startOfWeek(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return localDateStr(d)
}

function startOfMonth(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(1)
  return localDateStr(d)
}

function formatLong(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatShort(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonthYear(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatVisitDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const

type Period = (typeof PERIODS)[number]['value']

function periodRange(period: Period, anchor: string) {
  if (period === 'daily') {
    return { start: anchor, end: anchor, label: formatLong(anchor) }
  }
  if (period === 'weekly') {
    const start = startOfWeek(anchor)
    const end = addDays(start, 6)
    return { start, end, label: `${formatShort(start)} – ${formatShort(end)}, ${end.slice(0, 4)}` }
  }
  const start = startOfMonth(anchor)
  const end = addDays(addMonths(start, 1), -1)
  return { start, end, label: formatMonthYear(anchor) }
}

function stepAnchor(period: Period, anchor: string, dir: 1 | -1) {
  if (period === 'daily') return addDays(anchor, dir)
  if (period === 'weekly') return addDays(anchor, dir * 7)
  return addMonths(anchor, dir)
}

type SortKey = 'date' | 'customer' | 'phone' | 'service'

function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export default function VisitLog({ visits, label }: { visits: VisitRow[]; label: string }) {
  const [period, setPeriod] = useState<Period>('daily')
  const [anchor, setAnchor] = useState(todayStr())
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'date', direction: 'desc' })

  function changePeriod(value: Period) {
    setPeriod(value)
    setAnchor(todayStr())
  }

  const range = useMemo(() => periodRange(period, anchor), [period, anchor])
  const isCurrent = todayStr() >= range.start && todayStr() <= range.end

  const filtered = useMemo(
    () => visits.filter(v => v.visitedAt >= range.start && v.visitedAt <= range.end),
    [visits, range]
  )

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'date': return cmp(a.visitedAt, b.visitedAt) * dir
        case 'customer': return cmp(a.customerName, b.customerName) * dir
        case 'phone': return cmp(a.customerPhone, b.customerPhone) * dir
        case 'service': return cmp(a.service, b.service) * dir
      }
    })
  }, [filtered, sort])

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <Tabs value={period} onValueChange={value => changePeriod(value as Period)}>
          <TabsList>
            {PERIODS.map(p => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Link
          href="/add-visit"
          className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#F15A24] hover:bg-[#d44d1b] text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Visit
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setAnchor(a => stepAnchor(period, a, -1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-[12rem] text-center">{range.label}</span>
        <button
          onClick={() => setAnchor(a => stepAnchor(period, a, 1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
        {!isCurrent && (
          <button
            onClick={() => setAnchor(todayStr())}
            className="px-3 h-8 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {filtered.length} visit{filtered.length === 1 ? '' : 's'}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <SortableHead label="Date" sortKey="date" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
              <SortableHead label={label} sortKey="customer" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
              <SortableHead label="Phone" sortKey="phone" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
              <SortableHead label="Service" sortKey="service" sort={sort} onSort={key => setSort(s => toggleSort(s, key))} />
              <TableHead className="font-medium">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                  No visits in this period.
                </TableCell>
              </TableRow>
            )}
            {sorted.map(visit => (
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
