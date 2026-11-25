'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function checkIsAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data } = await admin.from('admins').select('user_id').eq('user_id', user.id).single()
  return !!data
}

export async function enterBusinessAsAdmin(businessId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: adminRow } = await admin.from('admins').select('user_id').eq('user_id', user.id).single()
  if (!adminRow) redirect('/admin')
  const cookieStore = await cookies()
  cookieStore.set('admin_biz_id', businessId, { path: '/', httpOnly: true, sameSite: 'lax' })
  redirect('/dashboard')
}

export async function exitAdminView() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_biz_id')
  redirect('/admin')
}

export async function adminSignOut() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_biz_id')
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
