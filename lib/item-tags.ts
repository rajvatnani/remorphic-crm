// Tags a business can put on an item, shown on the shop page photo.
// Keys must match the check in supabase/items_details_migration.sql.
export const ITEM_TAGS = [
  { key: 'selling_fast', label: 'Selling fast', style: 'bg-[#F15A24] text-white' },
  { key: 'bestseller', label: 'Bestseller', style: 'bg-[#1D3F8C] text-white' },
  { key: 'new_arrival', label: 'New arrival', style: 'bg-green-600 text-white' },
  { key: 'limited_edition', label: 'Limited edition', style: 'bg-purple-700 text-white' },
  { key: 'handmade', label: 'Handmade', style: 'bg-amber-100 text-amber-900' },
  { key: 'gift_pick', label: 'Gift pick', style: 'bg-pink-100 text-pink-900' },
] as const

export type ItemTagKey = (typeof ITEM_TAGS)[number]['key']

const KEYS = new Set<string>(ITEM_TAGS.map(t => t.key))

/** Known tags only, in the fixed list order */
export function itemTags(keys: readonly string[] | null | undefined) {
  const set = new Set(keys ?? [])
  return ITEM_TAGS.filter(t => set.has(t.key))
}

export function cleanTags(keys: unknown): ItemTagKey[] {
  return Array.isArray(keys) ? ITEM_TAGS.filter(t => keys.includes(t.key)).map(t => t.key) : []
}

export const isTagKey = (k: string): k is ItemTagKey => KEYS.has(k)
