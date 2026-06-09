'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/whatsapp'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '')
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

export async function getPublicBookingData(slug: string) {
  const admin = adminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, type, slug, phone')
    .eq('slug', slug)
    .single()
  if (!business) return null

  const { data: config } = await admin
    .from('appointment_config')
    .select('slot_duration, max_per_slot, start_time, end_time, open_days')
    .eq('business_id', business.id)
    .single()

  return { business, config }
}

export async function getSlotAvailability(
  businessId: string,
  date: string
): Promise<Record<string, number>> {
  const admin = adminClient()
  const { data } = await admin
    .from('appointments')
    .select('slot_time')
    .eq('business_id', businessId)
    .eq('appointment_date', date)
    .neq('status', 'cancelled')

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const key = (row.slot_time as string).slice(0, 5)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export async function sendBookingOtp(
  phone: string,
  businessId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = adminClient()
  const normalizedPhone = normalizePhone(phone)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await admin.from('booking_otps').delete()
    .eq('phone', normalizedPhone)
    .eq('business_id', businessId)

  const { error } = await admin.from('booking_otps').insert({
    phone: normalizedPhone,
    business_id: businessId,
    code,
    expires_at: expiresAt,
  })

  if (error) return { ok: false, error: 'Could not send code. Please try again.' }

  await sendWhatsApp(
    normalizedPhone,
    `Your booking code is: *${code}*\n\nExpires in 10 minutes.`
  )
  return { ok: true }
}

export async function verifyBookingOtp(
  phone: string,
  code: string,
  businessId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = adminClient()
  const normalizedPhone = normalizePhone(phone)

  const { data: otp } = await admin
    .from('booking_otps')
    .select('id, code, expires_at')
    .eq('phone', normalizedPhone)
    .eq('business_id', businessId)
    .eq('verified', false)
    .single()

  if (!otp) return { ok: false, error: 'No pending code found. Please request a new one.' }

  if (new Date(otp.expires_at) < new Date()) {
    await admin.from('booking_otps').delete().eq('id', otp.id)
    return { ok: false, error: 'Code expired. Please request a new one.' }
  }
  if (otp.code !== code.trim()) return { ok: false, error: 'Incorrect code. Please try again.' }

  await admin.from('booking_otps').update({ verified: true }).eq('id', otp.id)
  return { ok: true }
}

export async function createOnlineBooking({
  businessId,
  businessName,
  businessPhone,
  name,
  phone,
  date,
  slot,
}: {
  businessId: string
  businessName: string
  businessPhone: string
  name: string
  phone: string
  date: string
  slot: string
}): Promise<{ ok: boolean; error?: string }> {
  const admin = adminClient()
  const normalizedPhone = normalizePhone(phone)

  const { data: otp } = await admin
    .from('booking_otps')
    .select('id')
    .eq('phone', normalizedPhone)
    .eq('business_id', businessId)
    .eq('verified', true)
    .gte('expires_at', new Date().toISOString())
    .single()

  if (!otp) return { ok: false, error: 'Phone verification expired. Please start over.' }

  let customerId: string
  const { data: existing } = await admin
    .from('customers')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('phone', normalizedPhone)
    .single()

  if (existing) {
    customerId = existing.id
  } else {
    const { data: newCustomer, error: ce } = await admin
      .from('customers')
      .insert({ business_id: businessId, name: name.trim(), phone: normalizedPhone })
      .select('id')
      .single()
    if (ce) return { ok: false, error: 'Failed to save your info. Please try again.' }
    customerId = newCustomer.id
  }

  const nameNote =
    existing && existing.name.toLowerCase() !== name.trim().toLowerCase()
      ? `Booked online as: ${name.trim()}`
      : null

  const { error: ae } = await admin.from('appointments').insert({
    business_id: businessId,
    customer_id: customerId,
    service: 'Appointment',
    appointment_date: date,
    slot_time: slot,
    status: 'pending',
    notes: nameNote,
  })

  if (ae) return { ok: false, error: 'Failed to save booking. Please try again.' }

  await admin.from('booking_otps').delete().eq('id', otp.id)

  const fDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const [h, m] = slot.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const fTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`

  await sendWhatsApp(
    businessPhone,
    `📅 New booking request!\n\n*${existing?.name ?? name.trim()}* (${normalizedPhone}) wants to book on *${fDate} at ${fTime}*.\n\nOpen Remorphic CRM to approve or decline.`
  )

  return { ok: true }
}
