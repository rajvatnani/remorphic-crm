import twilio from 'twilio'

function getClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '')
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

export async function sendWhatsApp(to: string, body: string) {
  try {
    const client = getClient()
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${normalizePhone(to)}`,
      body,
    })
  } catch (err) {
    // Never fail the main operation if WhatsApp fails
    console.error('WhatsApp failed:', err)
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
