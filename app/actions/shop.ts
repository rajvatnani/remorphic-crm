'use server'

import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { normalizePhone, isValidPhone } from '@/lib/phone'
import { sendWhatsApp } from '@/lib/whatsapp'
import { formatRupees } from '@/lib/money'
import { imageType } from '@/lib/image-check'
import { sendEmail, escapeHtml, EMAIL_RE } from '@/lib/email'
import { randomUUID } from 'node:crypto'

// Public pages: everything from the browser is untrusted, and the anon key
// cannot read items or orders, so these run with the service role and
// return only what the shop page shows.

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[0-9a-f]{32}$/

export interface ShopItem {
  id: string
  name: string
  code: string | null
  description: string | null
  price_paise: number
  stock: number | null
  photo_url: string | null
  category_id: string | null
}

export interface ShopCategory {
  id: string
  name: string
}

export interface ShopBusiness {
  id: string
  name: string
  slug: string
  address: string | null
  photo: string | null
  phone: string | null
  payment_qr: string | null
}

export async function getShopData(slug: string): Promise<{ business: ShopBusiness; items: ShopItem[]; categories: ShopCategory[] } | null> {
  const admin = adminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, name, slug, address, photo, phone, payment_qr, orders_enabled, shop_enabled')
    .eq('slug', String(slug))
    .maybeSingle()
  if (!business || !business.orders_enabled || !business.shop_enabled) return null

  const [{ data: items }, { data: categories }] = await Promise.all([
    admin
      .from('items')
      .select('id, name, code, description, price_paise, stock, photo_url, category_id')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('name'),
    admin
      .from('item_categories')
      .select('id, name')
      .eq('business_id', business.id)
      .order('position')
      .order('name'),
  ])

  const { orders_enabled: _o, shop_enabled: _s, ...pub } = business
  void _o; void _s
  const list = (items ?? []) as ShopItem[]
  return {
    business: pub as ShopBusiness,
    items: list,
    // Only categories that have something on sale
    categories: ((categories ?? []) as ShopCategory[]).filter(c => list.some(i => i.category_id === c.id)),
  }
}

function keyedHash(value: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(value).digest('hex')
}

export type PlaceOrderResult =
  | { ok: true; token: string }
  | { ok: false; error: string; stockItem?: string; available?: number }

export async function placeShopOrder(input: {
  businessId: string
  name: string
  phone: string
  address: string
  note: string
  lines: { item_id: string; qty: number }[]
}): Promise<PlaceOrderResult> {
  // Collapse whitespace so a name cannot add lines to the owner's message
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const phone = normalizePhone(String(input.phone ?? ''))
  const address = String(input.address ?? '').trim().slice(0, 500)
  const note = String(input.note ?? '').trim().slice(0, 300)

  if (!name) return { ok: false, error: 'Please enter your name.' }
  if (!isValidPhone(phone)) return { ok: false, error: 'Please enter a valid mobile number.' }
  if (!UUID_RE.test(String(input.businessId))) return { ok: false, error: 'This shop is not available.' }

  const lines = (Array.isArray(input.lines) ? input.lines : [])
    .slice(0, 50)
    .filter(l => UUID_RE.test(String(l?.item_id)))
    .map(l => ({ item_id: String(l.item_id), qty: Math.floor(Number(l.qty)) }))
    .filter(l => l.qty > 0)
  if (!lines.length) return { ok: false, error: 'Your cart is empty.' }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim()
  const admin = adminClient()
  const { data, error } = await admin.rpc('place_shop_order', {
    p_business_id: input.businessId,
    p_name: name,
    p_phone: phone,
    p_address: address,
    p_note: note,
    p_lines: lines,
    p_ip_hash: ip ? keyedHash(`ip:${ip}`) : null,
  })

  if (error || !data) {
    console.error('[Shop] place_shop_order failed:', error?.code)
    return { ok: false, error: 'Could not place your order. Please try again.' }
  }

  switch (data.result) {
    case 'ok':
      break
    case 'closed':
      return { ok: false, error: 'This shop is not taking orders right now.' }
    case 'limited':
      return { ok: false, error: 'Too many orders from this number. Please try again in a few minutes.' }
    case 'unavailable':
      return { ok: false, error: 'An item in your cart is no longer available. Please remove it and try again.' }
    case 'stock':
      return {
        ok: false,
        error: data.available > 0
          ? `Only ${data.available} of ${data.item} left. Please lower the quantity.`
          : `${data.item} is sold out. Please remove it from your cart.`,
        stockItem: data.item,
        available: data.available,
      }
    default:
      return { ok: false, error: 'Your cart is empty.' }
  }

  // Tell the owner on WhatsApp and by email. The order stands whether or not these are sent.
  const [{ data: business }, { data: order }] = await Promise.all([
    admin.from('businesses').select('name, phone, order_alert_email').eq('id', input.businessId).single(),
    admin.from('orders').select('order_no, order_items(name, qty, price_paise)').eq('id', data.order_id).single(),
  ])
  if (business && order) {
    const lines = order.order_items as { name: string; qty: number; price_paise: number }[]
    const total = lines.reduce((s, l) => s + l.qty * l.price_paise, 0)

    const alerts: Promise<unknown>[] = []
    if (business.phone) {
      const list = lines.map(l => `• ${l.qty} × ${l.name}`).join('\n')
      alerts.push(sendWhatsApp(
        business.phone,
        `🛍️ New shop order #${order.order_no}\n\n*${name}* (${phone})\n${list}\nTotal ${formatRupees(total)}\n\nOpen Custozo → Orders to confirm.`
      ))
    }
    if (business.order_alert_email && EMAIL_RE.test(business.order_alert_email)) {
      alerts.push(sendEmail(business.order_alert_email, ...orderEmail({
        businessName: business.name, orderNo: order.order_no, name, phone, address, note, lines, total,
      })))
    }
    await Promise.all(alerts)
  }

  return { ok: true, token: data.token }
}

export interface ShopOrderView {
  order_no: number
  status: string
  payment_status: string
  paid_paise: number
  delivery_paise: number
  discount_paise: number
  address: string | null
  notes: string | null
  created_at: string
  customer_name: string
  lines: { name: string; qty: number; price_paise: number }[]
  business: ShopBusiness
  has_screenshot: boolean
}

/** The customer's own order page, found by its unguessable token */
export async function getShopOrder(slug: string, token: string): Promise<ShopOrderView | null> {
  if (!TOKEN_RE.test(String(token))) return null
  const admin = adminClient()
  const { data: order } = await admin
    .from('orders')
    .select('order_no, status, payment_status, paid_paise, delivery_paise, discount_paise, address, notes, created_at, business_id, payment_screenshot, customers(name), order_items(name, qty, price_paise)')
    .eq('public_token', token)
    .maybeSingle()
  if (!order) return null

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, slug, address, photo, phone, payment_qr')
    .eq('id', order.business_id)
    .single()
  if (!business || business.slug !== slug) return null

  const customer = order.customers as unknown as { name: string } | null
  return {
    order_no: order.order_no,
    status: order.status,
    payment_status: order.payment_status,
    paid_paise: order.paid_paise,
    delivery_paise: order.delivery_paise,
    discount_paise: order.discount_paise,
    address: order.address,
    notes: order.notes,
    created_at: order.created_at,
    customer_name: customer?.name ?? '',
    lines: order.order_items as ShopOrderView['lines'],
    business: business as ShopBusiness,
    has_screenshot: Boolean(order.payment_screenshot),
  }
}

// Keep below the server action body limit in next.config.ts
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024

/**
 * The customer's payment screenshot for their order, sent from the order
 * page. Replaces an earlier one. The business checks it and records the
 * payment itself; nothing is marked paid here.
 */
export async function uploadOrderPaymentScreenshot(token: string, upload: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!TOKEN_RE.test(String(token))) return { ok: false, error: 'Order not found.' }
  const file = upload?.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Please choose a screenshot.' }
  if (file.size > MAX_SCREENSHOT_BYTES) return { ok: false, error: 'The screenshot must be smaller than 3 MB.' }

  const bytes = Buffer.from(await file.arrayBuffer())
  const type = imageType(bytes)
  if (!type) return { ok: false, error: 'The screenshot must be a JPG, PNG or WebP image.' }

  const admin = adminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, order_no, status, payment_status, payment_screenshot, payment_screenshot_at, business_id, customers(name)')
    .eq('public_token', token)
    .maybeSingle()
  if (!order) return { ok: false, error: 'Order not found.' }
  if (order.status === 'cancelled') return { ok: false, error: 'This order was cancelled.' }
  if (order.payment_status === 'paid') return { ok: false, error: 'This order is already marked as paid.' }
  // A slow drip of replacements is fine; a flood is not
  if (order.payment_screenshot_at && Date.now() - new Date(order.payment_screenshot_at).getTime() < 30_000) {
    return { ok: false, error: 'Please wait a moment before sending another screenshot.' }
  }

  const path = `${String(order.business_id).toLowerCase()}/orders/${randomUUID()}.${type.ext}`
  const { error: upErr } = await admin.storage
    .from('payment-screenshots')
    .upload(path, bytes, { contentType: type.mime })
  if (upErr) {
    console.error('[Shop] screenshot upload failed')
    return { ok: false, error: 'Could not save the screenshot. Please try again.' }
  }

  const { error } = await admin
    .from('orders')
    .update({ payment_screenshot: path, payment_screenshot_at: new Date().toISOString() })
    .eq('id', order.id)
  if (error) {
    await admin.storage.from('payment-screenshots').remove([path])
    return { ok: false, error: 'Could not save the screenshot. Please try again.' }
  }
  if (order.payment_screenshot) {
    await admin.storage.from('payment-screenshots').remove([order.payment_screenshot])
  }

  // Tell the owner. The screenshot stands whether or not this is sent.
  const { data: business } = await admin.from('businesses').select('phone').eq('id', order.business_id).single()
  if (business?.phone) {
    const customer = order.customers as unknown as { name: string } | null
    await sendWhatsApp(
      business.phone,
      `💳 Payment screenshot for order #${order.order_no}${customer?.name ? ` from *${customer.name.replace(/\s+/g, ' ')}*` : ''}.\n\nOpen Custozo → Orders to check it and record the payment.`
    )
  }

  return { ok: true }
}

export interface InvoiceView {
  order_no: number
  status: string
  created_at: string
  delivered_at: string | null
  payment_status: string
  paid_paise: number
  delivery_paise: number
  discount_paise: number
  address: string | null
  customer: { name: string; phone: string }
  lines: { name: string; qty: number; price_paise: number }[]
  business: { name: string; address: string | null; phone: string | null; photo: string | null; gstin: string | null; invoice_note: string | null; payment_qr: string | null }
}

/**
 * Invoice for an order, by its unguessable token. Built from the order each
 * time it is opened; only confirmed, ready or delivered orders have one.
 */
export async function getInvoice(token: string): Promise<InvoiceView | null> {
  if (!TOKEN_RE.test(String(token))) return null
  const admin = adminClient()
  const { data: order } = await admin
    .from('orders')
    .select('order_no, status, created_at, delivered_at, payment_status, paid_paise, delivery_paise, discount_paise, address, business_id, customers(name, phone), order_items(name, qty, price_paise)')
    .eq('public_token', token)
    .maybeSingle()
  if (!order || !['confirmed', 'ready', 'delivered'].includes(order.status)) return null

  const { data: business } = await admin
    .from('businesses')
    .select('name, address, phone, photo, gstin, invoice_note, payment_qr')
    .eq('id', order.business_id)
    .single()
  if (!business) return null

  const { business_id: _b, customers, order_items, ...rest } = order
  void _b
  return {
    ...rest,
    customer: (customers as unknown as { name: string; phone: string } | null) ?? { name: '', phone: '' },
    lines: order_items as InvoiceView['lines'],
    business,
  }
}

function orderEmail(o: {
  businessName: string
  orderNo: number
  name: string
  phone: string
  address: string
  note: string
  lines: { name: string; qty: number; price_paise: number }[]
  total: number
}): [string, string, string] {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const subject = `New order #${o.orderNo} for ${formatRupees(o.total)} from ${o.name}`
  const rows = o.lines.map(l =>
    `<tr><td style="padding:4px 12px 4px 0">${l.qty} × ${escapeHtml(l.name)}</td><td style="padding:4px 0;text-align:right">${formatRupees(l.qty * l.price_paise)}</td></tr>`
  ).join('')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<p style="font-size:18px;font-weight:bold;margin:0 0 12px">New order #${o.orderNo} at ${escapeHtml(o.businessName)}</p>
<p style="margin:0 0 12px"><b>${escapeHtml(o.name)}</b> · ${escapeHtml(o.phone)}${o.address ? `<br>${escapeHtml(o.address)}` : ''}${o.note ? `<br><i>${escapeHtml(o.note)}</i>` : ''}</p>
<table style="border-collapse:collapse;margin:0 0 12px">${rows}<tr><td style="padding:8px 12px 0 0;font-weight:bold;border-top:1px solid #ddd">Total</td><td style="padding:8px 0 0;text-align:right;font-weight:bold;border-top:1px solid #ddd">${formatRupees(o.total)}</td></tr></table>
${appUrl ? `<p><a href="${appUrl}/orders" style="color:#F15A24;font-weight:bold">Open Orders to confirm</a></p>` : '<p>Open Custozo → Orders to confirm.</p>'}
</div>`
  const text = [
    `New order #${o.orderNo} at ${o.businessName}`,
    `${o.name} · ${o.phone}`,
    o.address, o.note,
    ...o.lines.map(l => `${l.qty} x ${l.name}: ${formatRupees(l.qty * l.price_paise)}`),
    `Total ${formatRupees(o.total)}`,
    appUrl ? `${appUrl}/orders` : 'Open Custozo > Orders to confirm.',
  ].filter(Boolean).join('\n')
  return [subject, html, text]
}
