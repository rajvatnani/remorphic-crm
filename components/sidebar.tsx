'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Business } from '@/types'
import { cn } from '@/lib/utils'
import { navItems as buildNavItems } from '@/lib/modules'
import Toran from '@/app/(dashboard)/dashboard/toran'
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
    <aside className="fixed inset-y-0 left-0 w-64 flex flex-col z-40 overflow-hidden bg-fest-plumdeep">
      <Toran />
      <div className="p-5 pt-16 border-b border-white/10">
        <div className="flex items-center gap-3">
          <a
            href="https://remorphic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-fest-marigold"
            title="Remorphic"
          >
            <span className="text-fest-plumdeep font-friendly font-extrabold text-lg">R</span>
          </a>
          <div className="min-w-0">
            <p className="font-friendly font-bold text-white text-base leading-tight truncate">{business.name}</p>
            <p className="text-xs capitalize text-fest-marigold/80">{business.type}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <span
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer',
                pathname === href
                  ? 'bg-fest-marigold text-fest-plumdeep'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="p-3 space-y-1 border-t border-white/10">
        <Link href="/settings">
          <span
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer',
              pathname === '/settings' ? 'bg-fest-marigold text-fest-plumdeep' : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            Settings
          </span>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start px-4 text-sm font-bold text-white/50 hover:bg-white/10 hover:text-white"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
