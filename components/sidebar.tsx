'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Business } from '@/types'
import { CUSTOMER_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  Megaphone,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Sidebar({ business }: { business: Business }) {
  const pathname = usePathname()
  const customerLabel = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS] + 's'

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leads', label: 'Leads', icon: UserPlus },
    { href: '/customers', label: customerLabel, icon: Users },
    { href: '/appointments', label: 'Appointments', icon: CalendarDays },
    { href: '/visits', label: 'Visit Log', icon: ClipboardList },
    { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  ]
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 flex flex-col z-40" style={{ backgroundColor: '#fff', borderRight: '1px solid #e5e7eb' }}>
      <div className="p-6" style={{ borderBottom: '1px solid #e5e7eb' }}>
        <div className="flex items-center gap-3">
          <a
            href="https://remorphic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F15A24' }}
            title="Remorphic"
          >
            <span className="text-white font-bold text-base">R</span>
          </a>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{business.name}</p>
            <p className="text-xs text-gray-500 capitalize">{business.type}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <span
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                pathname === href ? 'text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              style={pathname === href ? { backgroundColor: '#F15A24' } : {}}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="p-3 space-y-0.5" style={{ borderTop: '1px solid #e5e7eb' }}>
        <Link href="/settings">
          <span
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
              pathname === '/settings' ? 'text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
            style={pathname === '/settings' ? { backgroundColor: '#F15A24' } : {}}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Settings
          </span>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
