// UPI payment links. Leave amountPaise out to let the customer type any amount.
export function upiLink({ upiId, payee, amountPaise, note }: {
  upiId: string | null | undefined
  payee: string
  amountPaise?: number
  note?: string
}): string | null {
  if (!upiId) return null
  const params: [string, string][] = [
    ['pa', upiId],
    ['pn', payee || 'Shop'],
    ...(amountPaise ? [['am', (amountPaise / 100).toFixed(2)] as [string, string]] : []),
    ['tn', note ?? ''],
    ['cu', 'INR'],
  ]
  return 'upi://pay?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}

export const UPI_RE = /^[A-Za-z0-9._-]{2,200}@[A-Za-z]{2,64}$/
