import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CUSTOMER_LABELS } from '@/types'
import { Users, UserCheck, UserX, CalendarDays, UserPlus, Activity, Handshake, BellRing } from 'lucide-react'

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const threshold = business.inactive_threshold_days
  const label = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS]

  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - threshold)
  const thresholdStr = thresholdDate.toISOString().split('T')[0]

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const today = localDateStr(new Date())

  const [{ data: customers }, { count: visitsThisMonth }, { data: leads }, { count: dueTodayCount }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, visits(visited_at)')
      .eq('business_id', business.id),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .gte('visited_at', monthStart),
    supabase
      .from('leads')
      .select('id, status')
      .eq('business_id', business.id),
    supabase
      .from('lead_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('follow_up_date', today),
  ])

  let activeCount = 0
  let inactiveCount = 0

  for (const customer of customers ?? []) {
    const visits = customer.visits as { visited_at: string }[]
    if (!visits.length) {
      inactiveCount++
      continue
    }
    const lastVisit = visits.reduce((latest, v) =>
      v.visited_at > latest ? v.visited_at : latest,
      visits[0].visited_at
    )
    if (lastVisit >= thresholdStr) {
      activeCount++
    } else {
      inactiveCount++
    }
  }

  const totalCustomers = customers?.length ?? 0

  const totalLeads = leads?.length ?? 0
  const openLeads = (leads ?? []).filter(l => l.status !== 'converted' && l.status !== 'lost').length
  const convertedLeads = (leads ?? []).filter(l => l.status === 'converted').length

  const leadStats = [
    {
      title: 'Total Leads',
      value: totalLeads,
      icon: UserPlus,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    {
      title: 'Open Leads',
      value: openLeads,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Converted Leads',
      value: convertedLeads,
      icon: Handshake,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      title: 'Follow-ups Due Today',
      value: dueTodayCount ?? 0,
      icon: BellRing,
      color: 'text-[#F15A24]',
      bg: 'bg-[#F15A24]/10',
    },
  ]

  const stats = [
    {
      title: `Total ${label}s`,
      value: totalCustomers,
      icon: Users,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    {
      title: `Active ${label}s`,
      value: activeCount,
      icon: UserCheck,
      color: 'text-[#F15A24]',
      bg: 'bg-[#F15A24]/10',
    },
    {
      title: `Inactive ${label}s`,
      value: inactiveCount,
      icon: UserX,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      title: 'Visits This Month',
      value: visitsThisMonth ?? 0,
      icon: CalendarDays,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
  ]

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, {business.owner_name}. Here&apos;s how {business.name} is doing.
          </p>
        </div>
        <a
          href="https://remorphic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-heading text-4xl font-extrabold italic hover:underline"
          style={{ color: '#F15A24' }}
        >
          Trackly
        </a>
      </div>

      <h2 className="font-heading text-lg font-bold text-gray-900 tracking-tight mb-4">{label}s</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ title, value, icon: Icon, color, bg }) => (
          <Card key={title} className="shadow-none border border-gray-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">{value}</p>
              {title.includes('Inactive') && (
                <p className="text-xs text-gray-400 mt-1">
                  No visit in {threshold}+ days
                </p>
              )}
              {title.includes('Active') && (
                <p className="text-xs text-gray-400 mt-1">
                  Visited within {threshold} days
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="font-heading text-lg font-bold text-gray-900 tracking-tight mt-8 mb-4">Leads</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {leadStats.map(({ title, value, icon: Icon, color, bg }) => (
          <Card key={title} className="shadow-none border border-gray-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
