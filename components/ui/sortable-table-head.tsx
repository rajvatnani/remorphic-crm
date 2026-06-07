'use client'

import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'

export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  direction: SortDirection
}

export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key !== key) return { key, direction: 'asc' }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

export function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: K
  sort: SortState<K>
  onSort: (key: K) => void
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-gray-900 transition-colors"
      >
        {label}
        {active ? (
          sort.direction === 'asc'
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
        )}
      </button>
    </TableHead>
  )
}
