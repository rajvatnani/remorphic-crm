import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { INACTIVE_THRESHOLDS, CUSTOMER_LABELS } from '@/types'
import { Users, UserCheck, UserX, CalendarDays } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null

  const threshold = INACTIVE_THRESHOLDS[business.type as keyof typeof INACTIVE_THRESHOLDS]
  const label = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS]

  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - threshold)
  const thresholdStr = thresholdDate.toISOString().split('T')[0]

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const [{ data: customers }, { count: visitsThisMonth }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, visits(visited_at)')
      .eq('business_id', business.id),
    supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .gte('visited_at', monthStart),
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
      color: 'text-[#1a8585]',
      bg: 'bg-[#1a8585]/10',
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {business.owner_name}. Here&apos;s how {business.name} is doing.
        </p>
      </div>

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
              <p className="text-3xl font-bold text-gray-900">{value}</p>
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
    </div>
  )
}
