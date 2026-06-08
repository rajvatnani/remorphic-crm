import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import AddLeadDialog from './add-lead-dialog'
import LeadList from './lead-list'
import ExportCsvButton from '@/components/export-csv-button'
import { LEAD_STATUSES, type LeadStatus } from '@/types'

const STATUS_LABELS: Record<LeadStatus, string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s.value, s.label])
) as Record<LeadStatus, string>

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default async function LeadsPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const today = localDateStr(new Date())

  const [{ data: leads }, { count: dueCount }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, phone, interest, status, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('lead_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('follow_up_date', today),
  ])

  const csvRows = (leads ?? []).map(l => [
    l.name,
    l.phone,
    l.interest ?? '',
    l.created_at.split('T')[0],
    STATUS_LABELS[l.status as LeadStatus],
  ])

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{leads?.length ?? 0} total</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportCsvButton
            filenamePrefix="leads"
            headers={['Name', 'Phone', 'Interested In', 'Added Date', 'Status']}
            rows={csvRows}
          />
          <Link
            href="/leads/due"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <BellRing className="h-4 w-4" />
            Due Today
            {!!dueCount && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#F15A24] text-white text-xs font-semibold">
                {dueCount}
              </span>
            )}
          </Link>
          <AddLeadDialog />
        </div>
      </div>

      <LeadList leads={leads ?? []} />
    </div>
  )
}
