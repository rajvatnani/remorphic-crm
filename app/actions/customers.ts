'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  const { error } = await supabase.from('customers').insert({
    business_id: business.id,
    name: name.trim(),
    phone: phone.trim(),
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
      phone: phone.trim(),
      gender,
      dob,
    })
    .eq('id', customerId)
    .eq('business_id', business.id)

  if (error) throw new Error(error.message)

  revalidatePath('/customers')
  revalidatePath(`/customers/${customerId}`)
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
