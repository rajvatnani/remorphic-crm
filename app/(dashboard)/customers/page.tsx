import { createClient } from '@/lib/supabase/server'
import { INACTIVE_THRESHOLDS, CUSTOMER_LABELS } from '@/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import AddCustomerDialog from './add-customer-dialog'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function CustomersPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const threshold = INACTIVE_THRESHOLDS[business.type as keyof typeof INACTIVE_THRESHOLDS]
  const label = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS]

  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - threshold)
  const thresholdStr = thresholdDate.toISOString().split('T')[0]

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, created_at, visits(visited_at)')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  const rows = (customers ?? []).map(c => {
    const visits = c.visits as { visited_at: string }[]
    const lastVisit = visits.length
      ? visits.reduce((latest, v) =>
          v.visited_at > latest ? v.visited_at : latest,
          visits[0].visited_at
        )
      : null
    const isActive = lastVisit ? lastVisit >= thresholdStr : false
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      lastVisit,
      isActive,
      totalVisits: visits.length,
    }
  })

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{label}s</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} total</p>
        </div>
        <AddCustomerDialog label={label} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="font-medium">Name</TableHead>
              <TableHead className="font-medium">Phone</TableHead>
              <TableHead className="font-medium">Last Visit</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium text-right">Total Visits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-gray-400">
                  No {label.toLowerCase()}s yet. Add your first one!
                </TableCell>
              </TableRow>
            )}
            {rows.map(row => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-gray-50">
                <TableCell>
                  <Link href={`/customers/${row.id}`} className="font-medium text-gray-900 hover:text-[#1a8585]">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-gray-600">{row.phone}</TableCell>
                <TableCell className="text-gray-600">{formatDate(row.lastVisit)}</TableCell>
                <TableCell>
                  <Badge
                    variant={row.isActive ? 'default' : 'secondary'}
                    className={
                      row.isActive
                        ? 'bg-[#1a8585]/10 text-[#1a8585] hover:bg-[#1a8585]/20 border-0'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-0'
                    }
                  >
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-gray-600">{row.totalVisits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
