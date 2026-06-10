'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

async function getBusiness(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: business } = await supabase.from('businesses').select('id').single()
  if (!business) throw new Error('No business found')
  return business
}

export async function addLead(formData: FormData) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const interest = (formData.get('interest') as string)?.trim() || null
  const status = (formData.get('status') as string)?.trim() || 'new'

  const { error } = await supabase.from('leads').insert({
    business_id: business.id,
    name: name.trim(),
    phone: normalizePhone(phone),
    interest,
    status,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/leads')
}

export async function updateLead(leadId: string, formData: FormData) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const interest = (formData.get('interest') as string)?.trim() || null
  const status = (formData.get('status') as string)?.trim() || 'new'

  const { error } = await supabase
    .from('leads')
    .update({
      name: name.trim(),
      phone: normalizePhone(phone),
      interest,
      status,
    })
    .eq('id', leadId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath('/leads')
  revalidatePath(`/leads/${leadId}`)
}

export async function deleteLead(leadId: string) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', leadId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath('/leads')
}

export async function addInteraction(leadId: string, formData: FormData) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const type = formData.get('type') as string
  const notes = (formData.get('notes') as string)?.trim() || null
  const occurredAt = (formData.get('occurred_at') as string)?.trim() || undefined
  const durationMinutes = (formData.get('duration_minutes') as string)?.trim()
  const location = (formData.get('location') as string)?.trim() || null
  const amount = (formData.get('amount') as string)?.trim()
  const followUpDate = (formData.get('follow_up_date') as string)?.trim() || null

  const { error } = await supabase.from('lead_interactions').insert({
    lead_id: leadId,
    business_id: business.id,
    type,
    notes,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    duration_minutes: durationMinutes ? Number(durationMinutes) : null,
    location,
    amount: amount ? Number(amount) : null,
    follow_up_date: followUpDate,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/leads/${leadId}`)
}

export async function updateInteraction(interactionId: string, leadId: string, formData: FormData) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const type = formData.get('type') as string
  const notes = (formData.get('notes') as string)?.trim() || null
  const occurredAt = (formData.get('occurred_at') as string)?.trim() || undefined
  const durationMinutes = (formData.get('duration_minutes') as string)?.trim()
  const location = (formData.get('location') as string)?.trim() || null
  const amount = (formData.get('amount') as string)?.trim()
  const followUpDate = (formData.get('follow_up_date') as string)?.trim() || null

  const { error } = await supabase
    .from('lead_interactions')
    .update({
      type,
      notes,
      ...(occurredAt ? { occurred_at: occurredAt } : {}),
      duration_minutes: durationMinutes ? Number(durationMinutes) : null,
      location,
      amount: amount ? Number(amount) : null,
      follow_up_date: followUpDate,
    })
    .eq('id', interactionId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath(`/leads/${leadId}`)
}

export async function deleteInteraction(interactionId: string, leadId: string) {
  const supabase = await createClient()
  const business = await getBusiness(supabase)

  const { error } = await supabase
    .from('lead_interactions')
    .delete()
    .eq('id', interactionId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath(`/leads/${leadId}`)
}
