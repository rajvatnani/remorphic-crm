'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Business } from '@/types'
import { cn } from '@/lib/utils'
import { navItems as buildNavItems } from '@/lib/modules'
import { Settings, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Sidebar({ business }: { business: Business }) {
  const pathname = usePathname()

  const navItems = buildNavItems(business)
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 flex flex-col z-40" style={{ backgroundColor: '#18181b' }}>
      <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <a
            href="https://remorphic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F15A24' }}
            title="Remorphic"
          >
            <span className="text-white font-bold text-base">R</span>
          </a>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{business.name}</p>
            <p className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.35)' }}>{business.type}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <span
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer',
                pathname === href
                  ? 'text-white'
                  : 'hover:text-white'
              )}
              style={
                pathname === href
                  ? { backgroundColor: '#F15A24' }
                  : { color: 'rgba(255,255,255,0.45)' }
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="p-3 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href="/settings">
          <span
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer',
              pathname === '/settings' ? 'text-white' : 'hover:text-white'
            )}
            style={
              pathname === '/settings'
                ? { backgroundColor: '#F15A24' }
                : { color: 'rgba(255,255,255,0.45)' }
            }
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Settings
          </span>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start text-sm font-medium"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
