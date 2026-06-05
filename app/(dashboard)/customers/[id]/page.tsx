import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CUSTOMER_LABELS, INACTIVE_THRESHOLDS } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ArrowLeft, Phone, Calendar, Hash } from 'lucide-react'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('business_id', business.id)
    .single()

  if (!customer) notFound()

  const { data: visits } = await supabase
    .from('visits')
    .select('*')
    .eq('customer_id', id)
    .eq('business_id', business.id)
    .order('visited_at', { ascending: false })

  const threshold = INACTIVE_THRESHOLDS[business.type as keyof typeof INACTIVE_THRESHOLDS]
  const label = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS]

  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - threshold)
  const thresholdStr = thresholdDate.toISOString().split('T')[0]

  const lastVisit = visits?.length ? visits[0].visited_at : null
  const isActive = lastVisit ? lastVisit >= thresholdStr : false

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {label}s
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">{customer.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {customer.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Since {formatDate(customer.created_at)}
            </span>
          </div>
        </div>
        <Badge
          className={
            isActive
              ? 'bg-[#F15A24]/10 text-[#F15A24] border-0 text-sm'
              : 'bg-amber-50 text-amber-700 border-0 text-sm'
          }
        >
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="shadow-none border border-gray-200">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-gray-500 font-medium">Total Visits</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" />
              <span className="text-2xl font-bold text-gray-900">{visits?.length ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border border-gray-200">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-gray-500 font-medium">Last Visit</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm font-semibold text-gray-900">
              {lastVisit ? formatDate(lastVisit) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none border border-gray-200">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-gray-500 font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-sm font-semibold text-gray-900">
              {isActive ? `Within ${threshold} days` : `${threshold}+ days ago`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Visit History</h2>
        </div>
        {!visits?.length ? (
          <p className="text-center py-12 text-gray-400 text-sm">No visits recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visits.map(visit => (
              <div key={visit.id} className="px-4 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{visit.service}</p>
                    {visit.notes && (
                      <p className="text-sm text-gray-500 mt-0.5">{visit.notes}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-400 flex-shrink-0 ml-4">
                    {formatDate(visit.visited_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
