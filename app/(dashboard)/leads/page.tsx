import { createClient } from '@/lib/supabase/server'
import AddLeadDialog from './add-lead-dialog'
import LeadList from './lead-list'

export default async function LeadsPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, interest, status, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{leads?.length ?? 0} total</p>
        </div>
        <AddLeadDialog />
      </div>

      <LeadList leads={leads ?? []} />
    </div>
  )
}
