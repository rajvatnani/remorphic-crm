'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp, visitThankYouMessage } from '@/lib/whatsapp'

export async function addVisit(formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  const customerId = formData.get('customer_id') as string

  const { error } = await supabase.from('visits').insert({
    business_id: business.id,
    customer_id: customerId,
    service: (formData.get('service') as string).trim(),
    visited_at: formData.get('visited_at') as string,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (error) throw new Error(error.message)

  // Send SMS thank-you
  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone')
    .eq('id', customerId)
    .single()

  if (customer) {
    await sendWhatsApp(customer.phone, visitThankYouMessage(customer.name, business.name))
  }

  revalidatePath('/dashboard')
  revalidatePath('/customers')
  revalidatePath('/campaigns')
  redirect('/dashboard')
}

export async function addCustomerAndVisit(formData: FormData) {
  const supabase = await createClient()

  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  const customerName = (formData.get('new_customer_name') as string).trim()
  const customerPhone = (formData.get('new_customer_phone') as string).trim()

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({ business_id: business.id, name: customerName, phone: customerPhone })
    .select('id')
    .single()

  if (customerError) throw new Error(customerError.message)

  const { error: visitError } = await supabase.from('visits').insert({
    business_id: business.id,
    customer_id: customer.id,
    service: (formData.get('service') as string).trim(),
    visited_at: formData.get('visited_at') as string,
    notes: (formData.get('notes') as string)?.trim() || null,
  })

  if (visitError) throw new Error(visitError.message)

  // Send SMS thank-you
  await sendWhatsApp(customerPhone, visitThankYouMessage(customerName, business.name))

  revalidatePath('/dashboard')
  revalidatePath('/customers')
  revalidatePath('/campaigns')
  redirect('/dashboard')
}
