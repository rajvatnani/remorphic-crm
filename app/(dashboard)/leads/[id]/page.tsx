import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { LEAD_STATUSES, type LeadStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft, Phone, Calendar, Hash } from 'lucide-react'
import AddInteractionDialog from './add-interaction-dialog'
import InteractionLog, { type InteractionRow } from './interaction-log'

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-gray-100 text-gray-700 border-0 text-sm',
  contacted: 'bg-blue-50 text-blue-700 border-0 text-sm',
  qualified: 'bg-amber-50 text-amber-700 border-0 text-sm',
  converted: 'bg-emerald-50 text-emerald-700 border-0 text-sm',
  lost: 'bg-red-50 text-red-700 border-0 text-sm',
}

const STATUS_LABELS: Record<LeadStatus, string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s.value, s.label])
) as Record<LeadStatus, string>

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('business_id', business.id)
    .single()

  if (!lead) notFound()

  const { data: interactions } = await supabase
    .from('lead_interactions')
    .select('*')
    .eq('lead_id', id)
    .eq('business_id', business.id)
    .order('occurred_at', { ascending: false })

  const rows: InteractionRow[] = (interactions ?? []).map(i => ({
    id: i.id,
    type: i.type,
    notes: i.notes,
    occurredAt: i.occurred_at,
    durationMinutes: i.duration_minutes,
    location: i.location,
    amount: i.amount,
    followUpDate: i.follow_up_date,
  }))

  const lastInteraction = rows.length ? rows[0].occurredAt : null
  const status = lead.status as LeadStatus

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leads
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">{lead.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {lead.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Added {formatDate(lead.created_at)}
            </span>
          </div>
          {lead.interest && (
            <p className="text-sm text-gray-600 mt-2">Interested in: {lead.interest}</p>
          )}
        </div>
        <Badge className={STATUS_STYLES[status]}>
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="shadow-none border border-gray-200">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-gray-500 font-medium">Total Interactions</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" />
              <span className="text-2xl font-bold text-gray-900">{rows.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border border-gray-200">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-gray-500 font-medium">Last Interaction</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm font-semibold text-gray-900">
              {lastInteraction ? formatDate(lastInteraction) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Interaction History</h2>
        <AddInteractionDialog leadId={lead.id} />
      </div>

      <InteractionLog leadId={lead.id} interactions={rows} />
    </div>
  )
}
