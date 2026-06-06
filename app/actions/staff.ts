'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function inviteStaff(email: string) {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('id').single()
  if (!business) throw new Error('No business found')

  const admin = adminClient()

  // Check if already a member
  const { data: existing } = await admin
    .from('business_users')
    .select('id')
    .eq('business_id', business.id)
    .eq('email', email.toLowerCase())
    .single()

  if (existing) throw new Error('This person already has access')

  // Supabase sends the invite email and creates the auth user
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${appUrl}/accept-invite` }
  )

  if (inviteError) throw new Error(inviteError.message)

  // Link to business — same table as everyone else
  const { error } = await admin.from('business_users').insert({
    business_id: business.id,
    user_id: inviteData.user.id,
    email: email.toLowerCase(),
  })

  if (error) throw new Error(error.message)

  revalidatePath('/settings')
}

export async function removeUser(businessUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('business_users').delete().eq('id', businessUserId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}
