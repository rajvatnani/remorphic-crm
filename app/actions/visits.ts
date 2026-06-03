'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function addVisit(formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .single()

  if (!business) throw new Error('No business found')

  const customerId = formData.get('customer_id') as string
  const service = formData.get('service') as string
  const visitedAt = formData.get('visited_at') as string
  const notes = formData.get('notes') as string

  const { error } = await supabase.from('visits').insert({
    business_id: business.id,
    customer_id: customerId,
    service: service.trim(),
    visited_at: visitedAt,
    notes: notes?.trim() || null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  revalidatePath('/customers')
  revalidatePath('/campaigns')
  redirect('/dashboard')
}

export async function addCustomerAndVisit(formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .single()

  if (!business) throw new Error('No business found')

  const customerName = formData.get('new_customer_name') as string
  const customerPhone = formData.get('new_customer_phone') as string
  const service = formData.get('service') as string
  const visitedAt = formData.get('visited_at') as string
  const notes = formData.get('notes') as string

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      business_id: business.id,
      name: customerName.trim(),
      phone: customerPhone.trim(),
    })
    .select('id')
    .single()

  if (customerError) throw new Error(customerError.message)

  const { error: visitError } = await supabase.from('visits').insert({
    business_id: business.id,
    customer_id: customer.id,
    service: service.trim(),
    visited_at: visitedAt,
    notes: notes?.trim() || null,
  })

  if (visitError) throw new Error(visitError.message)

  revalidatePath('/dashboard')
  revalidatePath('/customers')
  revalidatePath('/campaigns')
  redirect('/dashboard')
}
