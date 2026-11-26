import twilio from 'twilio'
import { normalizePhone } from '@/lib/phone'

function getClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )
}

// Never log phone numbers or message bodies here: bodies include booking codes.
// Twilio's error messages can quote the number, so log only the error code.
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  // Customers who booked online without a number are stored with ''
  const toNumber = normalizePhone(to ?? '')
  if (!toNumber) return false

  const from = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`
  const toFormatted = `whatsapp:${toNumber}`

  try {
    const client = getClient()
    const msg = await client.messages.create({ from, to: toFormatted, body })
    console.log('[WhatsApp] Sent. SID:', msg.sid, 'Status:', msg.status)
    return true
  } catch (err) {
    const { code, status } = err as { code?: number; status?: number }
    console.error('[WhatsApp] Failed. Code:', code ?? 'unknown', 'Status:', status ?? 'unknown')
    return false
  }
}

export function visitThankYouMessage(customerName: string, businessName: string) {
  return `Hi ${customerName}, thank you for visiting ${businessName} today! We hope to see you again soon.`
}

export function appointmentConfirmMessage(
  customerName: string,
  businessName: string,
  date: string,
  time: string
) {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const formattedTime = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`

  return `Hi ${customerName}, your appointment at ${businessName} is confirmed for ${formattedDate} at ${formattedTime}. See you then!`
}
