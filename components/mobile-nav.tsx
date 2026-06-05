'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Business } from '@/types'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, CalendarDays, Megaphone, Settings } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/appointments', label: 'Appts', icon: CalendarDays },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function MobileNav({ business }: { business: Business }) {
  const pathname = usePathname()

  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F15A24' }}>
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate max-w-[180px]">
            {business.name}
          </span>
        </div>
      </header>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-40">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex-1">
            <span
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                pathname === href ? '' : 'text-gray-500'
              )}
              style={pathname === href ? { color: '#F15A24' } : {}}
            >
              <Icon className="h-5 w-5" />
              {label}
            </span>
          </Link>
        ))}
      </nav>
    </>
  )
}
