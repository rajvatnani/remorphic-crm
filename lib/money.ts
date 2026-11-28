// Money is stored in paise (whole numbers) to avoid rounding errors.

export function formatRupees(paise: number | null | undefined): string {
  const rupees = (paise ?? 0) / 100
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** "1,250.50" → 125050. Empty or invalid → null. */
export function toPaise(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,₹\s]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function toRupeesInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return ''
  return String(paise / 100)
}
