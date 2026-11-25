import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type BusinessContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  business: any
  isAdminViewing: boolean
}

export async function getBusinessContext(): Promise<BusinessContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const adminBizId = cookieStore.get('admin_biz_id')?.value

  if (adminBizId) {
    const adminCl = createAdminClient()
    const { data: adminRow } = await adminCl
      .from('admins').select('user_id').eq('user_id', user.id).single()
    if (adminRow) {
      const { data: business } = await adminCl
        .from('businesses').select('*').eq('id', adminBizId).single()
      if (business) return { supabase: adminCl, business, isAdminViewing: true }
    }
  }

  const { data: business } = await supabase.from('businesses').select('*').single()
  if (!business) return null
  return { supabase, business, isAdminViewing: false }
}
