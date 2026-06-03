import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'
import MobileNav from '@/components/mobile-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .single()

  if (!business) redirect('/setup')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar business={business} />
      </div>

      {/* Mobile nav */}
      <MobileNav business={business} />

      {/* Main content */}
      <main className="md:ml-64 pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
