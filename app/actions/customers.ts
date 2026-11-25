'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function addCustomer(formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .single()

  if (!business) throw new Error('No business found')

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const gender = (formData.get('gender') as string)?.trim() || null
  const dob = (formData.get('dob') as string)?.trim() || null

  const normalizedPhone = normalizePhone(phone)

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', business.id)
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (existing) throw new Error('A customer with this phone number already exists.')

  const { error } = await supabase.from('customers').insert({
    business_id: business.id,
    name: name.trim(),
    phone: normalizedPhone,
    gender,
    dob,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/customers')
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .single()

  if (!business) throw new Error('No business found')

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const gender = (formData.get('gender') as string)?.trim() || null
  const dob = (formData.get('dob') as string)?.trim() || null

  const { error } = await supabase
    .from('customers')
    .update({
      name: name.trim(),
      phone: normalizePhone(phone),
      gender,
      dob,
    })
    .eq('id', customerId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath('/customers')
  revalidatePath(`/customers/${customerId}`)
}

export async function nudgeCustomer(customerId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) return { ok: false, error: 'Business not found' }

  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone, nudge_sent_at')
    .eq('id', customerId)
    .eq('business_id', business.id)
    .single()
  if (!customer) return { ok: false, error: 'Customer not found' }

  if (customer.nudge_sent_at) {
    const daysSince = (Date.now() - new Date(customer.nudge_sent_at as string).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 7) return { ok: false, error: 'A nudge was already sent to this customer within the last 7 days.' }
  }

  await sendWhatsApp(
    customer.phone,
    `Hi ${customer.name}! It's been a while since you visited ${business.name}. We'd love to see you again! 🙏`
  )

  await supabase
    .from('customers')
    .update({ nudge_sent_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('business_id', business.id)

  return { ok: true }
}

export async function deleteCustomer(customerId: string) {
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .single()

  if (!business) throw new Error('No business found')

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath('/customers')
}
