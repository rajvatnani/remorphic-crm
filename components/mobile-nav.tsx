'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Business } from '@/types'
import { cn } from '@/lib/utils'
import { navItems as buildNavItems } from '@/lib/modules'
import { Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function MobileNav({ business }: { business: Business }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = buildNavItems(business, true)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 h-14 flex items-center justify-between px-4 z-40" style={{ backgroundColor: '#18181b' }}>
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
          <span className="font-semibold text-white text-sm truncate max-w-[160px]">
            {business.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/settings" className="p-2 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Settings className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

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

      <nav className="md:hidden fixed bottom-0 inset-x-0 flex z-40" style={{ backgroundColor: '#18181b', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex-1">
            <span
              className={cn('flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors')}
              style={pathname === href ? { color: '#F15A24' } : { color: 'rgba(255,255,255,0.4)' }}
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
