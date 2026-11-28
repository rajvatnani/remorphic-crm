import type { Business } from '@/types'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  Megaphone,
  CalendarDays,
  ShoppingBag,
  Package,
  type LucideIcon,
} from 'lucide-react'

export type ModuleKey = 'leads' | 'appointments' | 'visits' | 'orders'

export const MODULES: { key: ModuleKey; column: keyof Business; label: string; description: string }[] = [
  { key: 'leads', column: 'leads_enabled', label: 'Leads', description: 'Enquiries, follow-ups and their interactions' },
  { key: 'appointments', column: 'appointments_enabled', label: 'Appointments', description: 'Slots, online booking and approvals' },
  { key: 'visits', column: 'visits_enabled', label: 'Visits', description: 'Visit log and win-back campaigns for lapsed customers' },
  { key: 'orders', column: 'orders_enabled', label: 'Orders and items', description: 'What you sell, customer orders, stock and payments' },
]

// Columns are missing until orders_migration.sql has run: keep today's
// behaviour then (everything on except orders).
export function enabledModules(business: Partial<Business>): Record<ModuleKey, boolean> {
  return {
    leads: business.leads_enabled !== false,
    appointments: business.appointments_enabled !== false,
    visits: business.visits_enabled !== false,
    orders: business.orders_enabled === true,
  }
}

export function navItems(business: Business, short = false): { href: string; label: string; icon: LucideIcon }[] {
  const on = enabledModules(business)
  const customerLabel = (business.customer_label ?? 'Customer') + 's'
  const items: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { href: '/leads', label: 'Leads', icon: UserPlus, show: on.leads },
    { href: '/customers', label: customerLabel, icon: Users, show: true },
    { href: '/appointments', label: short ? 'Appts' : 'Appointments', icon: CalendarDays, show: on.appointments },
    { href: '/visits', label: short ? 'Visits' : 'Visit Log', icon: ClipboardList, show: on.visits },
    { href: '/orders', label: 'Orders', icon: ShoppingBag, show: on.orders },
    { href: '/items', label: 'Items', icon: Package, show: on.orders },
    { href: '/campaigns', label: 'Campaigns', icon: Megaphone, show: on.visits },
  ]
  return items.filter(i => i.show).map(({ href, label, icon }) => ({ href, label, icon }))
}
