import { getBusinessContext } from '@/lib/get-business-context'
import { LEAD_STATUSES, INTERACTION_TYPES, type LeadStatus, type InteractionType } from '@/types'
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
import { ArrowLeft } from 'lucide-react'
import AddInteractionDialog from '../add-interaction-dialog'

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-0',
  contacted: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-0',
  qualified: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-0',
  converted: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-0',
  lost: 'bg-red-50 text-red-700 hover:bg-red-100 border-0',
}

const STATUS_LABELS: Record<LeadStatus, string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s.value, s.label])
) as Record<LeadStatus, string>

const TYPE_LABELS: Record<InteractionType, string> = Object.fromEntries(
  INTERACTION_TYPES.map(t => [t.value, t.label])
) as Record<InteractionType, string>

export default async function DueInteractionsPage() {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx

  const today = localDateStr(new Date())

  const { data: interactions } = await supabase
    .from('lead_interactions')
    .select('id, type, notes, occurred_at, follow_up_date, leads(id, name, phone, status)')
    .eq('business_id', business.id)
    .eq('follow_up_date', today)
    .order('occurred_at', { ascending: false })

  type DueRow = { id: string; type: InteractionType; notes: string | null; occurredAt: string; lead: { id: string; name: string; phone: string; status: LeadStatus } }
  const rows: DueRow[] = (interactions ?? []).flatMap((i: any) => {
    const lead = i.leads as unknown as { id: string; name: string; phone: string; status: LeadStatus } | null
    if (!lead) return []
    return [{
      id: i.id,
      type: i.type as InteractionType,
      notes: i.notes as string | null,
      occurredAt: i.occurred_at as string,
      lead,
    }]
  })

  return (
    <div className="p-6 max-w-5xl">
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-fest-ink mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leads
      </Link>

      <div className="mb-6">
        <h1 className="font-heading font-heading text-4xl font-extrabold text-fest-ink tracking-tight tracking-tight">Due Today</h1>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} follow-up{rows.length === 1 ? '' : 's'} scheduled for today
        </p>
      </div>

      <div className="phone-cards bg-white rounded-3xl border border-fest-line overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-fest-cream hover:bg-fest-cream">
              <TableHead className="font-medium">Lead</TableHead>
              <TableHead className="font-medium">Phone</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium">From Interaction</TableHead>
              <TableHead className="font-medium">Notes</TableHead>
              <TableCell className="h-10 px-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                  No follow-ups due today.
                </TableCell>
              </TableRow>
            )}
            {rows.map(row => (
              <TableRow key={row.id} className="hover:bg-fest-cream">
                <TableCell>
                  <Link href={`/leads?open=${row.lead.id}`} className="font-medium text-fest-ink hover:underline" title="Open in Leads">
                    {row.lead.name}
                  </Link>
                </TableCell>
                <TableCell className="text-gray-600">{row.lead.phone}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLES[row.lead.status]}>
                    {STATUS_LABELS[row.lead.status]}
                  </Badge>
                </TableCell>
                <TableCell data-label="From" className="text-gray-600">{TYPE_LABELS[row.type]}</TableCell>
                <TableCell data-label="Notes" className="text-gray-500">{row.notes || '—'}</TableCell>
                <TableCell className="phone-actions text-right">
                  <div className="flex items-center justify-end gap-1">
                    <AddInteractionDialog leadId={row.lead.id} leadName={row.lead.name} compact />
                    <Link
                      href={`/leads?open=${row.lead.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-fest-ranisoft whitespace-nowrap"
                      style={{ color: '#C81E5B', borderColor: '#C81E5B' }}
                    >
                      History →
                    </Link>
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
