import { createClient } from '@/lib/supabase/server'
import { INACTIVE_THRESHOLDS, CUSTOMER_LABELS } from '@/types'
import AddCustomerDialog from './add-customer-dialog'
import CustomerList from './customer-list'

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
    .select('id, name, phone, gender, dob, created_at, visits(visited_at)')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  const rows = (customers ?? []).map(c => {
    const customerVisits = c.visits as { visited_at: string }[]
    const lastVisit = customerVisits.length
      ? customerVisits.reduce((latest, v) =>
          v.visited_at > latest ? v.visited_at : latest,
          customerVisits[0].visited_at
        )
      : null
    const isActive = lastVisit ? lastVisit >= thresholdStr : false
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      gender: c.gender as 'male' | 'female' | 'other' | null,
      dob: c.dob as string | null,
      lastVisit,
      isActive,
      totalVisits: customerVisits.length,
    }
  })

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">{label}s</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} total</p>
        </div>
        <AddCustomerDialog label={label} />
      </div>

      <CustomerList label={label} customers={rows} />
    </div>
  )
}
