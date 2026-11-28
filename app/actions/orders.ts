'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigured } from '@/lib/email'
import { normalizePhone, isValidPhone } from '@/lib/phone'
import { toPaise } from '@/lib/money'
import type { OrderStatus } from '@/types'

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function getBusiness() {
  const supabase = await createClient()
  const { data: business } = await supabase.from('businesses').select('id').single()
  if (!business) throw new Error('No business found')
  return { supabase, business }
}

function refresh() {
  revalidatePath('/orders')
  revalidatePath('/items')
  revalidatePath('/shop/[slug]', 'page')
  revalidatePath('/customers', 'layout')
}

// ─── items ────────────────────────────────────────────────────────────────────

export interface ItemInput {
  name: string
  code?: string
  description?: string
  price: string
  cost?: string
  stock?: string
  active: boolean
  photo_url?: string | null
  category_id?: string | null
}

// Only photos uploaded to this project's business-photos bucket
function cleanPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/business-photos/`
  return url.startsWith(base) ? url : null
}

function cleanItem(input: ItemInput) {
  const name = String(input.name ?? '').trim().slice(0, 200)
  if (!name) return { error: 'Enter a name.' }
  const price = toPaise(input.price)
  if (price === null || price < 0) return { error: 'Enter a selling price.' }
  const cost = input.cost?.trim() ? toPaise(input.cost) : null
  if (cost !== null && cost < 0) return { error: 'Cost cannot be negative.' }
  const stockText = input.stock?.trim() ?? ''
  const stock = stockText === '' ? null : Number.parseInt(stockText, 10)
  if (stock !== null && !Number.isFinite(stock)) return { error: 'Stock must be a whole number.' }
  return {
    row: {
      name,
      code: input.code?.trim() || null,
      description: input.description?.trim() || null,
      price_paise: price,
      cost_paise: cost,
      stock,
      active: Boolean(input.active),
      photo_url: cleanPhotoUrl(input.photo_url),
      category_id: input.category_id || null,
    },
  }
}

export async function saveItem(itemId: string | null, input: ItemInput): Promise<Result> {
  const cleaned = cleanItem(input)
  if ('error' in cleaned) return { ok: false, error: cleaned.error! }
  const { supabase, business } = await getBusiness()

  const { error } = itemId
    ? await supabase.from('items').update(cleaned.row).eq('id', itemId)
    : await supabase.from('items').insert({ ...cleaned.row, business_id: business.id })
  if (error) return { ok: false, error: error.message }

  refresh()
  return { ok: true }
}

export async function deleteItem(itemId: string): Promise<Result> {
  const { supabase } = await getBusiness()
  // Past orders keep their own copy of the name and price
  const { error } = await supabase.from('items').delete().eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

// ─── categories ───────────────────────────────────────────────────────────────

export async function saveCategory(categoryId: string | null, name: string): Promise<Result> {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!clean) return { ok: false, error: 'Enter a category name.' }
  const { supabase, business } = await getBusiness()

  let error
  if (categoryId) {
    ({ error } = await supabase.from('item_categories').update({ name: clean }).eq('id', categoryId))
  } else {
    const { data: last } = await supabase
      .from('item_categories').select('position').eq('business_id', business.id)
      .order('position', { ascending: false }).limit(1).maybeSingle()
    ;({ error } = await supabase.from('item_categories')
      .insert({ business_id: business.id, name: clean, position: (last?.position ?? -1) + 1 }))
  }
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'You already have a category with that name.' : error.message }
  }
  refresh()
  return { ok: true }
}

export async function deleteCategory(categoryId: string): Promise<Result> {
  const { supabase } = await getBusiness()
  // Its items stay, without a category
  const { error } = await supabase.from('item_categories').delete().eq('id', categoryId)
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

/** Saves the order categories are shown in (ids, first to last) */
export async function reorderCategories(ids: string[]): Promise<Result> {
  const { supabase } = await getBusiness()
  for (const [position, id] of ids.entries()) {
    const { error } = await supabase.from('item_categories').update({ position }).eq('id', id)
    if (error) return { ok: false, error: error.message }
  }
  refresh()
  return { ok: true }
}

// ─── customers ────────────────────────────────────────────────────────────────

/**
 * Customers do not log in, so the phone number identifies them: an existing
 * customer with the same number (last 10 digits) is reused.
 */
export async function findOrCreateCustomer(name: string, phone: string): Promise<Result<{ id: string }>> {
  const cleanName = String(name ?? '').trim()
  const normalized = normalizePhone(String(phone ?? ''))
  if (!cleanName) return { ok: false, error: 'Enter the customer’s name.' }
  if (!normalized || !isValidPhone(normalized)) return { ok: false, error: 'Enter a valid mobile number.' }

  const { supabase, business } = await getBusiness()
  const last10 = normalized.replace(/\D/g, '').slice(-10)

  const { data: candidates } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('business_id', business.id)
    .like('phone', `%${last10}`)
  const match = (candidates ?? []).find(
    (c: { phone: string }) => c.phone.replace(/\D/g, '').slice(-10) === last10
  )
  if (match) return { ok: true, data: { id: match.id } }

  const { data: created, error } = await supabase
    .from('customers')
    .insert({ business_id: business.id, name: cleanName, phone: normalized })
    .select('id')
    .single()
  if (error || !created) return { ok: false, error: error?.message ?? 'Could not add the customer.' }
  revalidatePath('/customers')
  return { ok: true, data: { id: created.id } }
}

// ─── orders ───────────────────────────────────────────────────────────────────

export interface OrderLineInput {
  item_id: string | null
  name: string
  price: string
  qty: string
}

export interface OrderInput {
  lines: OrderLineInput[]
  delivery: string
  discount: string
  notes: string
  due_date: string
}

function cleanOrder(input: OrderInput) {
  const lines = []
  for (const line of input.lines ?? []) {
    const name = String(line.name ?? '').trim()
    if (!name && !line.item_id) continue
    const price = toPaise(line.price)
    const qty = Number.parseInt(String(line.qty), 10)
    if (price === null || price < 0) return { error: `Enter a price for ${name || 'each item'}.` }
    if (!Number.isFinite(qty) || qty <= 0) return { error: `Enter a quantity for ${name || 'each item'}.` }
    lines.push({ item_id: line.item_id || null, name, price_paise: price, qty })
  }
  if (!lines.length) return { error: 'Add at least one item.' }
  const delivery = input.delivery?.trim() ? toPaise(input.delivery) : 0
  const discount = input.discount?.trim() ? toPaise(input.discount) : 0
  if (delivery === null || delivery < 0) return { error: 'Delivery charge must be a positive amount.' }
  if (discount === null || discount < 0) return { error: 'Discount must be a positive amount.' }
  const due = /^\d{4}-\d{2}-\d{2}$/.test(input.due_date ?? '') ? input.due_date : null
  return { lines, delivery, discount, notes: input.notes?.trim() || null, due }
}

export async function createOrder(customerId: string, input: OrderInput): Promise<Result<{ id: string }>> {
  const o = cleanOrder(input)
  if ('error' in o) return { ok: false, error: o.error! }
  const { supabase } = await getBusiness()
  const { data, error } = await supabase.rpc('create_order', {
    p_customer_id: customerId,
    p_lines: o.lines,
    p_delivery_paise: o.delivery,
    p_discount_paise: o.discount,
    p_notes: o.notes,
    p_due_date: o.due,
  })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true, data: { id: data as string } }
}

export async function updateOrder(orderId: string, input: OrderInput): Promise<Result> {
  const o = cleanOrder(input)
  if ('error' in o) return { ok: false, error: o.error! }
  const { supabase } = await getBusiness()
  const { error } = await supabase.rpc('update_order', {
    p_order: orderId,
    p_lines: o.lines,
    p_delivery_paise: o.delivery,
    p_discount_paise: o.discount,
    p_notes: o.notes,
    p_due_date: o.due,
  })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<Result> {
  const { supabase } = await getBusiness()
  const { error } = await supabase.rpc('set_order_status', { p_order: orderId, p_status: status })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

export async function setOrderPayment(orderId: string, paid: string): Promise<Result> {
  const paise = toPaise(paid)
  if (paise === null || paise < 0) return { ok: false, error: 'Enter the amount received.' }
  const { supabase } = await getBusiness()
  const { error } = await supabase.rpc('set_order_payment', { p_order: orderId, p_paid_paise: paise })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

// Looks the file up from an order the caller can see (RLS), so a signed
// link cannot be requested for an arbitrary path.
export async function getOrderScreenshotUrl(orderId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: order } = await supabase
    .from('orders')
    .select('payment_screenshot')
    .eq('id', orderId)
    .maybeSingle()
  const path = order?.payment_screenshot as string | null | undefined
  if (!path) return null
  const { data } = await createAdminClient().storage.from('payment-screenshots').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

// ─── stock ────────────────────────────────────────────────────────────────────

export type StockReason = 'restock' | 'damaged' | 'correction' | 'other'

export async function adjustStock(itemId: string, change: number, reason: StockReason, note: string): Promise<Result> {
  const n = Math.trunc(Number(change))
  if (!Number.isFinite(n) || n === 0) return { ok: false, error: 'Enter how many to add or remove.' }
  const { supabase } = await getBusiness()
  const { error } = await supabase.rpc('adjust_stock', {
    p_item: itemId,
    p_change: n,
    p_reason: reason,
    p_note: String(note ?? '').trim() || null,
  })
  if (error) return { ok: false, error: error.message }
  refresh()
  return { ok: true }
}

export interface StockMove {
  id: string
  change: number
  stock_after: number
  reason: 'order' | 'order_return' | 'edit' | StockReason
  note: string | null
  created_at: string
  orders: { order_no: number } | null
}

export async function getStockMoves(itemId: string): Promise<StockMove[]> {
  const { supabase } = await getBusiness()
  const { data } = await supabase
    .from('stock_moves')
    .select('id, change, stock_after, reason, note, created_at, orders(order_no)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as StockMove[]
}

/** Whether this server can send emails (Resend settings present) */
export async function canSendEmail(): Promise<boolean> {
  return emailConfigured()
}
