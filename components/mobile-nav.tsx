'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Business } from '@/types'
import { CUSTOMER_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, UserPlus, CalendarDays, ClipboardList, Megaphone, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function MobileNav({ business }: { business: Business }) {
  const pathname = usePathname()
  const router = useRouter()
  const customerLabel = CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS] + 's'
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leads', label: 'Leads', icon: UserPlus },
    { href: '/customers', label: customerLabel, icon: Users },
    { href: '/appointments', label: 'Appts', icon: CalendarDays },
    { href: '/visits', label: 'Visits', icon: ClipboardList },
    { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  ]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <a
            href="https://remorphic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F15A24' }}
            title="Remorphic"
          >
            <span className="text-white font-bold text-sm">R</span>
          </a>
          <span className="font-semibold text-gray-900 text-sm truncate max-w-[160px]">
            {business.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/settings" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            <Settings className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Sign-out confirmation */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMenuOpen(false)}>
          <div className="w-full bg-white rounded-t-2xl shadow-xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-700 mb-3">Sign out of {business.name}?</p>
            <div className="flex gap-2">
              <button onClick={() => setMenuOpen(false)} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">
                Cancel
              </button>
              <button onClick={handleSignOut} className="flex-1 h-11 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: '#F15A24' }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

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
