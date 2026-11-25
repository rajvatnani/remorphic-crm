/**
 * Normalizes to E.164. Numbers without a country code are assumed Indian (+91).
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`

  const national = digits.startsWith('0') ? digits.slice(1) : digits
  // Longer than a 10-digit national number: the country code is already there
  return national.length > 10 ? `+${national}` : `+91${national}`
}

export function isValidPhone(normalized: string): boolean {
  if (normalized.startsWith('+91')) return /^\+91[1-9]\d{9}$/.test(normalized)
  return /^\+[1-9]\d{7,14}$/.test(normalized)
}
