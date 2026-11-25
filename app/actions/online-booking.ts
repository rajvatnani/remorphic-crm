'use server'

import { createHmac, randomInt } from 'node:crypto'
import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/lib/whatsapp'
import { normalizePhone, isValidPhone } from '@/lib/phone'

const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const SEND_FAILED = 'Could not send code. Please try again.'
const BOOKING_FAILED = 'Failed to save booking. Please try again.'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Keyed, so a leaked booking_otps table cannot be brute-forced offline
function keyedHash(value: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(value).digest('hex')
}

function hashCode(businessId: string, phone: string, code: string) {
  return keyedHash(`otp:${businessId.toLowerCase()}:${phone}:${code}`)
}

export async function getPublicBookingData(slug: string) {
  const admin = adminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, type, slug')
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
  const normalizedPhone = normalizePhone(String(phone))
  if (!isValidPhone(normalizedPhone)) {
    return { ok: false, error: 'Please enter a valid phone number.' }
  }
  if (!UUID_RE.test(String(businessId))) return { ok: false, error: SEND_FAILED }

  const code = String(randomInt(100000, 1000000))
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim()

  const { data: result, error } = await adminClient().rpc('request_booking_otp', {
    p_business_id: businessId,
    p_phone: normalizedPhone,
    p_code_hash: hashCode(businessId, normalizedPhone, code),
    p_ip_hash: ip ? keyedHash(`ip:${ip}`) : null,
  })

  if (error) {
    console.error('[Booking] request_booking_otp failed:', error.code)
    return { ok: false, error: SEND_FAILED }
  }
  if (result === 'cooldown') {
    return { ok: false, error: 'Please wait a minute before requesting another code.' }
  }
  if (result === 'limited') {
    return { ok: false, error: 'Too many codes requested. Please try again in an hour.' }
  }
  if (result !== 'ok') return { ok: false, error: SEND_FAILED }

  const sent = await sendWhatsApp(
    normalizedPhone,
    `Your booking code is: *${code}*\n\nExpires in 10 minutes.`
  )
  return sent ? { ok: true } : { ok: false, error: SEND_FAILED }
}

const BOOKING_ERRORS: Record<string, string> = {
  no_code: 'No pending code found. Please request a new one.',
  expired: 'Code expired. Please request a new one.',
  locked: 'Too many incorrect attempts. Please request a new code.',
  incorrect: 'Incorrect code. Please try again.',
  closed: 'The business is closed on that day. Please pick another date.',
  past: 'That time has already passed. Please pick another slot.',
  invalid_slot: 'That time is not available. Please pick another slot.',
  full: 'That slot was just taken. Please pick another one.',
}

const SLOT_ERRORS = ['closed', 'past', 'invalid_slot', 'full']

/**
 * Public endpoint: everything from the browser is untrusted. The code, opening
 * hours and slot capacity are all checked in one database transaction, and the
 * owner's phone is looked up here rather than accepted as an argument.
 */
export async function createOnlineBooking({
  businessId,
  name,
  phone,
  code,
  date,
  slot,
}: {
  businessId: string
  name: string
  phone: string
  code: string
  date: string
  slot: string
}): Promise<{ ok: boolean; error?: string; slotUnavailable?: boolean }> {
  const normalizedPhone = normalizePhone(String(phone))
  // Collapse whitespace so a name cannot add lines to the owner's message
  const cleanName = String(name).replace(/\s+/g, ' ').trim().slice(0, 80)

  if (!cleanName) return { ok: false, error: 'Please enter your name.' }
  if (
    !UUID_RE.test(String(businessId)) ||
    !DATE_RE.test(String(date)) ||
    !SLOT_RE.test(String(slot)) ||
    !isValidPhone(normalizedPhone)
  ) {
    return { ok: false, error: BOOKING_FAILED }
  }

  const admin = adminClient()
  const { data: result, error } = await admin.rpc('create_online_booking', {
    p_business_id: businessId,
    p_phone: normalizedPhone,
    p_code_hash: hashCode(businessId, normalizedPhone, String(code).trim()),
    p_name: cleanName,
    p_date: date,
    p_slot: slot,
  })

  if (error) {
    console.error('[Booking] create_online_booking failed:', error.code)
    return { ok: false, error: BOOKING_FAILED }
  }
  if (result !== 'ok') {
    return {
      ok: false,
      error: BOOKING_ERRORS[result] ?? BOOKING_FAILED,
      slotUnavailable: SLOT_ERRORS.includes(result),
    }
  }

  const { data: business } = await admin
    .from('businesses')
    .select('phone')
    .eq('id', businessId)
    .single()

  if (business?.phone) {
    const fDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const [h, m] = slot.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const fTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`

    await sendWhatsApp(
      business.phone,
      `📅 New booking request!\n\n*${cleanName}* (${normalizedPhone}) wants to book on *${fDate} at ${fTime}*.\n\nOpen Remorphic CRM to approve or decline.`
    )
  }

  return { ok: true }
}
