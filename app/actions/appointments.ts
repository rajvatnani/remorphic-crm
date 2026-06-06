'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp, visitThankYouMessage, appointmentConfirmMessage } from '@/lib/whatsapp'

export async function bookAppointment(formData: FormData) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  let customerId = formData.get('customer_id') as string

  // If new customer, create them first
  if (!customerId) {
    const name = (formData.get('new_customer_name') as string).trim()
    const phone = (formData.get('new_customer_phone') as string).trim()
    const { data: newCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({ business_id: business.id, name, phone })
      .select('id')
      .single()
    if (customerError) throw new Error(customerError.message)
    customerId = newCustomer.id
  }

  const appointmentDate = formData.get('appointment_date') as string
  const slotTime = formData.get('slot_time') as string

  const { error } = await supabase.from('appointments').insert({
    business_id: business.id,
    customer_id: customerId,
    service: (formData.get('service') as string).trim(),
    appointment_date: appointmentDate,
    slot_time: slotTime,
    notes: (formData.get('notes') as string)?.trim() || null,
    status: 'scheduled',
  })

  if (error) throw new Error(error.message)

  // Send WhatsApp appointment confirmation
  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone')
    .eq('id', customerId)
    .single()

  if (customer) {
    await sendWhatsApp(
      customer.phone,
      appointmentConfirmMessage(customer.name, business.name, appointmentDate, slotTime)
    )
  }

  revalidatePath('/appointments')
  revalidatePath('/customers')
}

export async function confirmAppointment(appointmentId: string) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  const { data: appt } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single()

  if (!appt) throw new Error('Appointment not found')

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      business_id: business.id,
      customer_id: appt.customer_id,
      service: appt.service,
      visited_at: appt.appointment_date,
      notes: appt.notes,
    })
    .select('id')
    .single()

  if (visitError) throw new Error(visitError.message)

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'confirmed', visit_id: visit.id })
    .eq('id', appointmentId)

  if (error) throw new Error(error.message)

  // Send WhatsApp thank-you
  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone')
    .eq('id', appt.customer_id)
    .single()

  if (customer) {
    await sendWhatsApp(
      customer.phone,
      visitThankYouMessage(customer.name, business.name)
    )
  }

  revalidatePath('/appointments')
  revalidatePath('/dashboard')
  revalidatePath('/customers')
  revalidatePath('/campaigns')
}

export async function cancelAppointment(appointmentId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)

  if (error) throw new Error(error.message)
  revalidatePath('/appointments')
}

export async function saveAppointmentConfig(formData: FormData) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id').single()
  if (!business) throw new Error('No business found')

  const openDays = formData.getAll('open_days').map(Number)

  const { error } = await supabase
    .from('appointment_config')
    .upsert(
      {
        business_id: business.id,
        slot_duration: parseInt(formData.get('slot_duration') as string),
        max_per_slot: parseInt(formData.get('max_per_slot') as string),
        start_time: formData.get('start_time') as string,
        end_time: formData.get('end_time') as string,
        open_days: openDays,
      },
      { onConflict: 'business_id' }
    )

  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  revalidatePath('/appointments')
}
