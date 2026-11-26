'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import { sendWhatsApp, visitThankYouMessage, appointmentConfirmMessage } from '@/lib/whatsapp'

export async function bookAppointment(formData: FormData) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  let customerId = formData.get('customer_id') as string

  // If new customer, create them first
  if (!customerId) {
    const name = (formData.get('new_customer_name') as string).trim()
    const phone = normalizePhone(formData.get('new_customer_phone') as string)
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

  // Send SMS appointment confirmation
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

  // Send SMS thank-you
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

export async function approveBooking(appointmentId: string) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  const { data: appt } = await supabase
    .from('appointments')
    .select('appointment_date, slot_time, customers(name, phone)')
    .eq('id', appointmentId)
    .single()
  if (!appt) throw new Error('Appointment not found')

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'scheduled' })
    .eq('id', appointmentId)
  if (error) throw new Error(error.message)

  const customer = (appt as any).customers
  if (customer) {
    const fDate = new Date(appt.appointment_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
    const [h, m] = (appt.slot_time as string).split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const fTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
    await sendWhatsApp(
      customer.phone,
      `Hi ${customer.name}! Your booking at *${business.name}* on ${fDate} at ${fTime} is confirmed ✅. See you then!`
    )
  }

  revalidatePath('/appointments')
}

export async function declineBooking(appointmentId: string) {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) throw new Error('No business found')

  const { data: appt } = await supabase
    .from('appointments')
    .select('customers(name, phone)')
    .eq('id', appointmentId)
    .single()
  if (!appt) throw new Error('Appointment not found')

  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
  if (error) throw new Error(error.message)

  const customer = (appt as any).customers
  if (customer) {
    await sendWhatsApp(
      customer.phone,
      `Hi ${customer.name}, unfortunately your booking request at *${business.name}* could not be accepted at this time. Please contact us to reschedule.`
    )
  }

  revalidatePath('/appointments')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function formatWhen(date: string, slot: string) {
  const fDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const [h, m] = slot.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${fDate} at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Moves a booking to another date or slot and/or changes its service and
 * notes. The slot must be one the appointments page shows and must have room.
 * A visit already recorded for the booking moves with it.
 */
export async function changeAppointment(
  appointmentId: string,
  changes: { date: string; slot: string; service: string; notes: string; notify: boolean }
): Promise<{ ok: boolean; error?: string; notified?: boolean }> {
  const date = String(changes.date)
  const slot = String(changes.slot).slice(0, 5)
  const service = String(changes.service).trim()
  const notes = String(changes.notes ?? '').trim() || null

  if (!DATE_RE.test(date) || !SLOT_RE.test(slot)) return { ok: false, error: 'Pick a date and time.' }
  if (!service) return { ok: false, error: 'Enter a service.' }

  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id, name').single()
  if (!business) return { ok: false, error: 'No business found.' }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status, appointment_date, slot_time, visit_id, customers(name, phone)')
    .eq('id', appointmentId)
    .single()
  if (!appt) return { ok: false, error: 'Booking not found.' }
  if (appt.status === 'cancelled') return { ok: false, error: 'Cancelled bookings cannot be changed.' }

  const moved = appt.appointment_date !== date || (appt.slot_time as string).slice(0, 5) !== slot

  if (moved) {
    const { data: config } = await supabase
      .from('appointment_config')
      .select('slot_duration, max_per_slot, start_time, end_time, open_days')
      .eq('business_id', business.id)
      .single()
    if (!config) return { ok: false, error: 'Set up appointment slots in Settings first.' }

    const dow = new Date(date + 'T00:00:00').getDay()
    if (!config.open_days.includes(dow)) return { ok: false, error: 'You are closed on that day.' }

    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const offset = toMins(slot) - toMins(config.start_time)
    if (offset < 0 || toMins(slot) >= toMins(config.end_time) || offset % config.slot_duration !== 0) {
      return { ok: false, error: 'That time is not one of your slots.' }
    }

    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('appointment_date', date)
      .eq('slot_time', slot)
      .neq('status', 'cancelled')
      .neq('id', appointmentId)
    if ((count ?? 0) >= config.max_per_slot) return { ok: false, error: 'That slot is full.' }
  }

  const { error } = await supabase
    .from('appointments')
    .update({ appointment_date: date, slot_time: slot, service, notes })
    .eq('id', appointmentId)
  if (error) return { ok: false, error: error.message }

  if (appt.visit_id) {
    await supabase
      .from('visits')
      .update({ visited_at: date, service, notes })
      .eq('id', appt.visit_id)
  }

  // Only worth telling the customer about a new time for a booking still ahead
  let notified = false
  const customer = (appt as unknown as { customers: { name: string; phone: string } | null }).customers
  if (changes.notify && moved && customer && appt.status !== 'confirmed') {
    notified = await sendWhatsApp(
      customer.phone,
      `Hi ${customer.name}, your booking at *${business.name}* has been moved to ${formatWhen(date, slot)}. Please contact us if this doesn't suit you.`
    )
  }

  revalidatePath('/appointments')
  revalidatePath('/customers')
  return { ok: true, notified }
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

// Looks the file up from an appointment the caller can see (RLS), so a signed
// link cannot be requested for an arbitrary path.
export async function getPaymentScreenshotUrl(appointmentId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: appt } = await supabase
    .from('appointments')
    .select('payment_screenshot')
    .eq('id', appointmentId)
    .maybeSingle()

  const stored = appt?.payment_screenshot as string | null | undefined
  if (!stored) return null

  // Older bookings stored a full URL instead of a path
  const path = stored.startsWith('http')
    ? (stored.match(/payment-screenshots\/(.+?)(\?|$)/)?.[1] ?? null)
    : stored
  if (!path) return null

  const { data } = await createAdminClient().storage
    .from('payment-screenshots')
    .createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
