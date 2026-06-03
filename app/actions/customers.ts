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

  const { error } = await supabase.from('customers').insert({
    business_id: business.id,
    name: name.trim(),
    phone: phone.trim(),
  })

  if (error) throw new Error(error.message)

  revalidatePath('/customers')
}
