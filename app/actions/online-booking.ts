'use server'

import { createHmac, randomInt, randomUUID } from 'node:crypto'
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
    .select('id, name, type, slug, customer_label, address, photo, price_per_slot, payment_qr, services_offered')
    .eq('slug', slug)
    .single()
  if (!business) return null

  const [{ data: config }, { data: gallery }] = await Promise.all([
    admin
      .from('appointment_config')
      .select('slot_duration, max_per_slot, start_time, end_time, open_days')
      .eq('business_id', business.id)
      .single(),
    admin
      .from('business_gallery')
      .select('id, url')
      .eq('business_id', business.id)
      .order('created_at'),
  ])

  return { business, config, gallery: gallery ?? [] }
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

// Keep below the server action body limit in next.config.ts
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024

// Trust the file's contents, not the name or type the browser claims
function imageType(bytes: Buffer): { ext: string; mime: string } | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

const SLOT_ERRORS = ['closed', 'past', 'invalid_slot', 'full']

/**
 * Public endpoint: everything from the browser is untrusted. The code, opening
 * hours and slot capacity are all checked in one database transaction, and the
 * owner's phone is looked up here rather than accepted as an argument.
 * The payment screenshot is stored only once the booking has been accepted.
 */
export async function createOnlineBooking({
  businessId,
  name,
  phone,
  code,
  date,
  slot,
  selectedServices,
}: {
  businessId: string
  name: string
  phone: string
  code: string
  date: string
  slot: string
  selectedServices?: string[]
}, upload?: FormData): Promise<{
  ok: boolean
  error?: string
  slotUnavailable?: boolean
  screenshotFailed?: boolean
}> {
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

  const services = Array.isArray(selectedServices)
    ? selectedServices.slice(0, 50).map(service => String(service))
    : []

  const file = upload?.get('file')
  let screenshot: { path: string; mime: string; bytes: Buffer } | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { ok: false, error: 'The payment screenshot must be smaller than 3 MB.' }
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const type = imageType(bytes)
    if (!type) {
      return { ok: false, error: 'The payment screenshot must be a JPG, PNG or WebP image.' }
    }
    screenshot = { path: `${businessId.toLowerCase()}/${randomUUID()}.${type.ext}`, mime: type.mime, bytes }
  }

  const admin = adminClient()
  const { data: result, error } = await admin.rpc('create_online_booking', {
    p_business_id: businessId,
    p_phone: normalizedPhone,
    p_code_hash: hashCode(businessId, normalizedPhone, String(code).trim()),
    p_name: cleanName,
    p_date: date,
    p_slot: slot,
    p_services: services,
    p_payment_screenshot: screenshot?.path ?? null,
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

  let screenshotFailed = false
  if (screenshot) {
    const { error: uploadError } = await admin.storage
      .from('payment-screenshots')
      .upload(screenshot.path, screenshot.bytes, { contentType: screenshot.mime })
    if (uploadError) {
      screenshotFailed = true
      console.error('[Booking] screenshot upload failed')
      await admin
        .from('appointments')
        .update({ payment_screenshot: null })
        .eq('business_id', businessId)
        .eq('payment_screenshot', screenshot.path)
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

  return { ok: true, screenshotFailed }
}
