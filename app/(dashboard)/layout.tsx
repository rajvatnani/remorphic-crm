import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessContext } from '@/lib/get-business-context'
import { exitAdminView } from '@/app/actions/admin'
import Sidebar from '@/components/sidebar'
import MobileNav from '@/components/mobile-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const adminBizId = cookieStore.get('admin_biz_id')?.value

  // Admin with no selected business → send to admin panel
  if (!adminBizId) {
    const adminCl = createAdminClient()
    const { data: adminRow } = await adminCl
      .from('admins').select('user_id').eq('user_id', user.id).single()
    if (adminRow) redirect('/admin')
  }

  const ctx = await getBusinessContext()
  if (!ctx) redirect('/setup')
  const { business, isAdminViewing } = ctx

  return (
    <div className="min-h-screen bg-fest-cream">
      {isAdminViewing && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 px-4 py-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-amber-900">
            Admin view — <span className="font-bold">{business.name}</span>
          </span>
          <form action={exitAdminView}>
            <button type="submit" className="text-amber-900 font-semibold hover:underline">
              ← Exit to admin panel
            </button>
          </form>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={`hidden md:block ${isAdminViewing ? 'mt-8' : ''}`}>
        <Sidebar business={business} />
      </div>

      {/* Mobile nav */}
      <MobileNav business={business} />

      {/* Main content */}
      <main className={`md:ml-64 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 ${isAdminViewing ? 'pt-22 md:pt-8' : 'pt-14 md:pt-0'}`}>
        {children}
      </main>
    </div>
  )
}
