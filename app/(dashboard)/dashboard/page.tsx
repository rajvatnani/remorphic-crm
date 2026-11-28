import Link from 'next/link'
import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import { formatRupees } from '@/lib/money'
import {
  rangeStart, summary, pendingPayments, reorderList, istDay,
  type ReportOrder, type ReportItem,
} from '@/lib/reports'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ShareLinks from './share-links'
import {
  Users, UserCheck, UserX, CalendarDays, UserPlus, Activity, Handshake, BellRing,
  ShoppingBag, IndianRupee, TrendingUp, Clock, CalendarCheck, Hourglass,
  type LucideIcon,
} from 'lucide-react'

interface Stat {
  title: string
  value: string | number
  icon: LucideIcon
  color: string
  bg: string
  note?: string
  href?: string
}

function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ title, value, icon: Icon, color, bg, note, href }) => {
        const card = (
          <Card className={`shadow-none border border-gray-200 h-full ${href ? 'hover:border-[#F15A24] transition-colors' : ''}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-3xl font-extrabold text-gray-900 tracking-tight tabular-nums">{value}</p>
              {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
            </CardContent>
          </Card>
        )
        return href ? <Link key={title} href={href}>{card}</Link> : <div key={title}>{card}</div>
      })}
    </div>
  )
}

function SectionTitle({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between mt-8 mb-4 first:mt-0">
      <h2 className="font-heading text-lg font-bold text-gray-900 tracking-tight">{children}</h2>
      {href && <Link href={href} className="text-sm font-medium text-[#F15A24] hover:underline">{linkLabel}</Link>}
    </div>
  )
}

export default async function DashboardPage() {
  const ctx = await getBusinessContext()
  if (!ctx) return null
  const { supabase, business } = ctx
  const on = enabledModules(business)

  const threshold = business.inactive_threshold_days
  const label = business.customer_label ?? 'Customer'
  const today = istDay(new Date())
  const monthStart = rangeStart('month')!
  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - threshold)
  const thresholdStr = istDay(thresholdDate)

  const none = Promise.resolve({ data: null, count: null })
  const [
    { data: customers },
    { count: visitsThisMonth },
    { data: leads },
    { count: dueTodayCount },
    { data: orderRows },
    { data: itemRows },
    { count: apptsToday },
    { count: apptsPending },
  ] = await Promise.all([
    supabase.from('customers').select(on.visits ? 'id, visits(visited_at)' : 'id').eq('business_id', business.id),
    on.visits
      ? supabase.from('visits').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('visited_at', monthStart)
      : none,
    on.leads ? supabase.from('leads').select('id, status').eq('business_id', business.id) : none,
    on.leads
      ? supabase.from('lead_interactions').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('follow_up_date', today)
      : none,
    on.orders
      ? supabase
          .from('orders')
          .select('id, order_no, status, source, seen_at, created_at, paid_paise, delivery_paise, discount_paise, delivery_cost_paise, payment_status, customer_id, customers(id, name, phone), order_items(item_id, name, qty, price_paise, cost_paise)')
          .eq('business_id', business.id)
          .neq('status', 'cancelled')
      : none,
    on.orders
      ? supabase.from('items').select('id, name, code, price_paise, cost_paise, stock, active, category_id, low_stock_level, archived').eq('business_id', business.id)
      : none,
    on.appointments
      ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('appointment_date', today).neq('status', 'cancelled')
      : none,
    on.appointments
      ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'pending')
      : none,
  ])

  // ── orders ──
  const orders = (orderRows ?? []) as (ReportOrder & { source?: string; seen_at?: string | null })[]
  const items = (itemRows ?? []) as ReportItem[]
  const month = summary(orders, monthStart)
  const pending = pendingPayments(orders)
  const toCollect = pending.reduce((s, p) => s + p.due, 0)
  const newOrders = orders.filter(o => o.status === 'new').length
  const unseen = orders.filter(o => o.status === 'new' && o.source === 'shop' && !o.seen_at).length
  const low = reorderList(items, business.default_low_stock ?? 2)

  const orderStats: Stat[] = [
    { title: 'New orders', value: newOrders, icon: ShoppingBag, color: 'text-[#F15A24]', bg: 'bg-[#F15A24]/10', note: unseen ? `${unseen} not opened yet` : 'Waiting to be confirmed', href: '/orders' },
    { title: 'Sales this month', value: formatRupees(month.sales), icon: IndianRupee, color: 'text-blue-600', bg: 'bg-blue-50', note: `${month.orders} order${month.orders === 1 ? '' : 's'}`, href: '/reports?range=month' },
    { title: 'Profit this month', value: formatRupees(month.profit), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', note: month.linesWithoutCost ? 'Some items have no cost price' : undefined, href: '/reports?range=month' },
    { title: 'Yet to be paid', value: formatRupees(toCollect), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', note: `${pending.length} order${pending.length === 1 ? '' : 's'}`, href: '/reports' },
  ]

  // ── customers ──
  let activeCount = 0
  let inactiveCount = 0
  if (on.visits) {
    for (const customer of customers ?? []) {
      const visits = (customer as { visits?: { visited_at: string }[] }).visits ?? []
      const last = visits.reduce((latest, v) => (v.visited_at > latest ? v.visited_at : latest), '')
      if (last && last >= thresholdStr) activeCount++
      else inactiveCount++
    }
  }
  const customerStats: Stat[] = [
    { title: `Total ${label}s`, value: customers?.length ?? 0, icon: Users, color: 'text-gray-600', bg: 'bg-gray-100', href: '/customers' },
    ...(on.visits
      ? [
          { title: `Active ${label}s`, value: activeCount, icon: UserCheck, color: 'text-[#F15A24]', bg: 'bg-[#F15A24]/10', note: `Visited within ${threshold} days` },
          { title: `Inactive ${label}s`, value: inactiveCount, icon: UserX, color: 'text-amber-600', bg: 'bg-amber-50', note: `No visit in ${threshold}+ days`, href: '/campaigns' },
          { title: 'Visits This Month', value: visitsThisMonth ?? 0, icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50', href: '/visits' },
        ]
      : []),
  ]

  // ── leads ──
  const leadList = (leads ?? []) as { status: string }[]
  const leadStats: Stat[] = [
    { title: 'Total Leads', value: leadList.length, icon: UserPlus, color: 'text-gray-600', bg: 'bg-gray-100', href: '/leads' },
    { title: 'Open Leads', value: leadList.filter(l => l.status !== 'converted' && l.status !== 'lost').length, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Converted Leads', value: leadList.filter(l => l.status === 'converted').length, icon: Handshake, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Follow-ups Due Today', value: dueTodayCount ?? 0, icon: BellRing, color: 'text-[#F15A24]', bg: 'bg-[#F15A24]/10', href: '/leads/due' },
  ]

  // ── appointments ──
  const apptStats: Stat[] = [
    { title: 'Appointments today', value: apptsToday ?? 0, icon: CalendarCheck, color: 'text-blue-600', bg: 'bg-blue-50', href: '/appointments' },
    { title: 'Waiting for approval', value: apptsPending ?? 0, icon: Hourglass, color: 'text-purple-600', bg: 'bg-purple-50', note: 'Online booking requests', href: '/appointments' },
  ]

  const shareLinks = [
    ...(on.orders && business.shop_enabled ? [{ label: 'Shop', path: `/shop/${business.slug}` }] : []),
    ...(on.appointments && business.slug ? [{ label: 'Online booking', path: `/book/${business.slug}` }] : []),
  ]

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading text-4xl font-extrabold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, {business.owner_name}. Here&apos;s how {business.name} is doing.
          </p>
        </div>
        <a
          href="https://remorphic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-heading text-4xl font-extrabold italic hover:underline hidden sm:block"
          style={{ color: '#F15A24' }}
        >
          Custozo
        </a>
      </div>

      {on.orders && (
        <>
          <SectionTitle href="/orders" linkLabel="All orders →">Orders</SectionTitle>
          <StatGrid stats={orderStats} />

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <Card className="shadow-none border border-gray-200">
              <CardHeader className="pb-2">
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900">Running low</CardTitle>
                  <Link href="/items" className="text-xs font-medium text-[#F15A24] hover:underline">Items →</Link>
                </div>
              </CardHeader>
              <CardContent>
                {low.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">Nothing is running low.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 text-sm">
                    {low.slice(0, 5).map(i => (
                      <li key={i.id} className="flex justify-between py-1.5">
                        <span className="text-gray-700 truncate">{i.name}</span>
                        <span className={`tabular-nums font-medium ${(i.stock ?? 0) <= 0 ? 'text-red-600' : 'text-amber-700'}`}>
                          {(i.stock ?? 0) <= 0 ? 'Sold out' : `${i.stock} left`}
                        </span>
                      </li>
                    ))}
                    {low.length > 5 && <li className="pt-1.5 text-xs text-gray-400">and {low.length - 5} more in Reports</li>}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none border border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-900">Share your links</CardTitle>
              </CardHeader>
              <CardContent>
                {shareLinks.length ? (
                  <ShareLinks links={shareLinks} businessName={business.name} />
                ) : (
                  <p className="text-sm text-gray-400 py-2">
                    Turn on the shop link in <Link href="/settings" className="underline">Settings → Features</Link> to let customers order themselves.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {on.appointments && (
        <>
          <SectionTitle href="/appointments" linkLabel="Appointments →">Appointments</SectionTitle>
          <StatGrid stats={apptStats} />
          {!on.orders && shareLinks.length > 0 && (
            <Card className="shadow-none border border-gray-200 mt-4 max-w-xl">
              <CardContent className="pt-6"><ShareLinks links={shareLinks} businessName={business.name} /></CardContent>
            </Card>
          )}
        </>
      )}

      <SectionTitle>{label}s</SectionTitle>
      <StatGrid stats={customerStats} />

      {on.leads && (
        <>
          <SectionTitle>Leads</SectionTitle>
          <StatGrid stats={leadStats} />
        </>
      )}
    </div>
  )
}
