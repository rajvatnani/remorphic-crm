import { createClient } from '@/lib/supabase/server'
import { CUSTOMER_LABELS } from '@/types'
import VisitLog from './visit-log'

export default async function VisitsPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const label = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS]

  const { data: visits } = await supabase
    .from('visits')
    .select('id, service, visited_at, notes, customers(id, name, phone)')
    .eq('business_id', business.id)
    .order('visited_at', { ascending: false })

  const rows = (visits ?? [])
    .filter(v => v.customers)
    .map(v => {
      const customer = v.customers as unknown as { id: string; name: string; phone: string }
      return {
        id: v.id,
        service: v.service,
        visitedAt: v.visited_at,
        notes: v.notes,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
      }
    })

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Visit Log</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} total</p>
        </div>
      </div>

      <VisitLog visits={rows} label={label} />
    </div>
  )
}
