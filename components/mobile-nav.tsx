'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Business } from '@/types'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, PlusCircle, Megaphone } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/add-visit', label: 'Add Visit', icon: PlusCircle },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
]

export default function MobileNav({ business }: { business: Business }) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#1a8585] flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate max-w-[180px]">
            {business.name}
          </span>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-40">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex-1">
            <span
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors',
                pathname === href ? 'text-[#1a8585]' : 'text-gray-500'
              )}
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
