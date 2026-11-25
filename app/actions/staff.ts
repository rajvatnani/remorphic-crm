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

// Returns errors instead of throwing: Next.js hides thrown messages in production.
// The same rules are enforced by RLS, since members can also reach the table directly.
export async function removeUser(businessUserId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in again.' }

  const { data: business } = await supabase.from('businesses').select('id, user_id').single()
  if (!business) return { ok: false, error: 'No business found' }

  const { data: member } = await supabase
    .from('business_users')
    .select('id, user_id')
    .eq('id', businessUserId)
    .eq('business_id', business.id)
    .maybeSingle()

  if (!member) return { ok: false, error: 'This person no longer has access' }
  if (member.user_id === business.user_id) return { ok: false, error: 'The owner cannot be removed' }
  if (member.user_id === user.id) return { ok: false, error: 'You cannot remove yourself' }

  // RLS filters rows silently, so check that one was actually deleted
  const { data: deleted, error } = await supabase
    .from('business_users')
    .delete()
    .eq('id', member.id)
    .select('id')

  if (error || !deleted?.length) return { ok: false, error: 'Failed to remove staff member' }

  revalidatePath('/settings')
  return { ok: true }
}
