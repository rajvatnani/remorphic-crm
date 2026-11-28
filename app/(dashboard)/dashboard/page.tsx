import { getBusinessContext } from '@/lib/get-business-context'
import { enabledModules } from '@/lib/modules'
import { formatRupees } from '@/lib/money'
import {
  rangeStart, summary, pendingPayments, reorderList, istDay,
  type ReportOrder, type ReportItem,
} from '@/lib/reports'
import DashboardView, { type Stat } from './dashboard-view'
import {
  Users, UserCheck, UserX, CalendarDays, UserPlus, Activity, Handshake, BellRing,
  ShoppingBag, IndianRupee, TrendingUp, Clock, CalendarCheck, Hourglass,
} from 'lucide-react'

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
      ? supabase.from('items').select('id, name, code, price_paise, cost_paise, stock, active, category_id, low_stock_level, archived, photos, photo_url').eq('business_id', business.id)
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

  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const todo = [
    on.orders && newOrders > 0 ? `${newOrders} new ${newOrders === 1 ? 'order' : 'orders'}` : '',
    on.appointments && (apptsPending ?? 0) > 0 ? `${apptsPending} ${apptsPending === 1 ? 'booking' : 'bookings'} to approve` : '',
    on.leads && (dueTodayCount ?? 0) > 0 ? `${dueTodayCount} follow-up${dueTodayCount === 1 ? '' : 's'} due today` : '',
  ].filter(Boolean)
  const firstName = (business.owner_name ?? '').trim().split(/\s+/)[0] || business.name

  const shareLinks = [
    ...(on.orders && business.shop_enabled ? [{ label: 'Shop', path: `/shop/${business.slug}` }] : []),
    ...(on.appointments && business.slug ? [{ label: 'Online booking', path: `/book/${business.slug}` }] : []),
  ]

  return (
    <DashboardView
      {...{ business, on, label, orderStats, apptStats, customerStats, leadStats, low, shareLinks, greeting, todo, firstName, newOrders, apptsPending }}
    />
  )
}

