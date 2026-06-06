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

  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (!currentUser) throw new Error('Not authenticated')

  const admin = adminClient()

  // Check if already a staff member
  const { data: existing } = await admin
    .from('staff')
    .select('id')
    .eq('business_id', business.id)
    .eq('email', email.toLowerCase())
    .single()

  if (existing) throw new Error('This person is already a staff member')

  // Send invite email — Supabase creates the user and emails them
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: `${appUrl}/accept-invite` }
  )

  if (inviteError) throw new Error(inviteError.message)

  // Link the new user to this business
  const { error: staffError } = await admin.from('staff').insert({
    business_id: business.id,
    user_id: inviteData.user.id,
    email: email.toLowerCase(),
    invited_by: currentUser.id,
  })

  if (staffError) throw new Error(staffError.message)

  revalidatePath('/settings')
}

export async function removeStaff(staffId: string) {
  const supabase = await createClient()

  const { error } = await supabase.from('staff').delete().eq('id', staffId)

  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}
