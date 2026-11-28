'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOrder, updateOrder, findOrCreateCustomer, type OrderLineInput } from '@/app/actions/orders'
import { formatRupees, toPaise, toRupeesInput } from '@/lib/money'
import type { Item, ItemCategory, Order } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, X } from 'lucide-react'

export interface CustomerOption {
  id: string
  name: string
  phone: string
}

type Line = OrderLineInput & { key: number }

let lineKey = 0
const blankLine = (): Line => ({ key: ++lineKey, item_id: null, name: '', price: '', qty: '1' })

function linesFrom(order: Order | null): Line[] {
  if (!order?.order_items.length) return [blankLine()]
  return order.order_items.map(l => ({
    key: ++lineKey,
    item_id: l.item_id,
    name: l.name,
    price: toRupeesInput(l.price_paise),
    qty: String(l.qty),
  }))
}

/**
 * New order (order = null) or edit an order's lines and extras.
 * The customer is picked from the list or added by name + mobile number;
 * a number that already belongs to a customer reuses that customer.
 */
export default function OrderDialog({
  open,
  onClose,
  order,
  items,
  customers,
  customerLabel,
  initialCustomerId,
  categories = [],
}: {
  categories?: ItemCategory[]
  open: boolean
  onClose: () => void
  order: Order | null
  items: Item[]
  customers: CustomerOption[]
  customerLabel: string
  initialCustomerId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId ?? null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const [lines, setLines] = useState<Line[]>(() => linesFrom(order))
  const [delivery, setDelivery] = useState(order?.delivery_paise ? toRupeesInput(order.delivery_paise) : '')
  const [discount, setDiscount] = useState(order?.discount_paise ? toRupeesInput(order.discount_paise) : '')
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [dueDate, setDueDate] = useState(order?.due_date ?? '')

  const activeItems = items.filter(i => i.active)
  // Item picker grouped by category, in the business's order
  const itemGroups = [
    ...categories.map(c => ({ label: c.name, items: activeItems.filter(i => i.category_id === c.id) })),
    { label: categories.length ? 'Other' : '', items: activeItems.filter(i => !i.category_id || !categories.some(c => c.id === i.category_id)) },
  ].filter(g => g.items.length)
  const itemOption = (i: Item) => (
    <option key={i.id} value={i.id}>
      {i.name}{i.stock != null ? ` (${i.stock} in stock)` : ''}
    </option>
  )
  const selectedCustomer = customers.find(c => c.id === customerId) ?? null

  const customerMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return []
    return customers
      .filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 6)
  }, [customers, customerQuery])

  const subtotal = lines.reduce((sum, l) => {
    const p = toPaise(l.price) ?? 0
    const q = Number.parseInt(l.qty, 10) || 0
    return sum + p * q
  }, 0)
  const total = Math.max(subtotal + (toPaise(delivery) ?? 0) - (toPaise(discount) ?? 0), 0)

  function updateLine(key: number, patch: Partial<Line>) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function pickItem(key: number, itemId: string) {
    const item = items.find(i => i.id === itemId)
    if (!item) { updateLine(key, { item_id: null }); return }
    updateLine(key, { item_id: item.id, name: item.name, price: toRupeesInput(item.price_paise) })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const input = { lines, delivery, discount, notes, due_date: dueDate }

      if (order) {
        const res = await updateOrder(order.id, input)
        if (!res.ok) { setError(res.error); return }
      } else {
        let cid = customerId
        if (!cid) {
          if (!newCustomer) { setError(`Pick a ${customerLabel.toLowerCase()} or add a new one.`); return }
          const c = await findOrCreateCustomer(newName, newPhone)
          if (!c.ok) { setError(c.error); return }
          cid = c.data!.id
        }
        const res = await createOrder(cid, input)
        if (!res.ok) { setError(res.error); return }
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Edit order #${order.order_no}` : 'New order'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-5 mt-2">
          {/* Customer */}
          {order ? (
            <p className="text-sm text-gray-600">
              {customerLabel}: <span className="font-medium text-gray-900">{order.customers?.name}</span>
              {order.customers?.phone ? ` · ${order.customers.phone}` : ''}
            </p>
          ) : selectedCustomer ? (
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <span className="text-sm">
                <span className="font-medium text-gray-900">{selectedCustomer.name}</span>
                <span className="text-gray-500"> · {selectedCustomer.phone || 'no phone'}</span>
              </span>
              <button type="button" onClick={() => setCustomerId(null)} className="text-xs text-gray-500 hover:text-gray-800">Change</button>
            </div>
          ) : newCustomer ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>New {customerLabel.toLowerCase()}</Label>
                <button type="button" onClick={() => setNewCustomer(false)} className="text-xs text-gray-500 hover:text-gray-800">Pick existing instead</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" />
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Mobile number" type="tel" />
              </div>
              <p className="text-xs text-gray-400">If this number already belongs to a {customerLabel.toLowerCase()}, the order goes to them.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="order_customer">{customerLabel}</Label>
              <Input
                id="order_customer"
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                placeholder="Search by name or phone…"
                autoComplete="off"
              />
              {customerMatches.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {customerMatches.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCustomerId(c.id); setCustomerQuery('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50"
                    >
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-gray-400"> · {c.phone || 'no phone'}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setNewCustomer(true)
                  // Prefill from what was typed
                  if (/\d{5,}/.test(customerQuery)) setNewPhone(customerQuery.trim())
                  else setNewName(customerQuery.trim())
                }}
                className="text-sm font-medium text-[#F15A24] hover:underline"
              >
                + New {customerLabel.toLowerCase()}
              </button>
            </div>
          )}

          {/* Lines */}
          <div className="space-y-2">
            <Label>Items</Label>
            <div className="space-y-2">
              {lines.map(line => (
                <div key={line.key} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6 space-y-1">
                    {activeItems.length > 0 && (
                      <select
                        value={line.item_id ?? ''}
                        onChange={e => pickItem(line.key, e.target.value)}
                        className="w-full h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none"
                      >
                        <option value="">Other (type below)</option>
                        {itemGroups.map(g => g.label
                          ? <optgroup key={g.label} label={g.label}>{g.items.map(itemOption)}</optgroup>
                          : g.items.map(itemOption))}
                        {/* An item hidden since, still on this order */}
                        {line.item_id && !activeItems.some(i => i.id === line.item_id) && (
                          <option value={line.item_id}>{line.name}</option>
                        )}
                      </select>
                    )}
                    {!line.item_id && (
                      <Input
                        value={line.name}
                        onChange={e => updateLine(line.key, { name: e.target.value })}
                        placeholder="Item name"
                        className="h-8"
                      />
                    )}
                  </div>
                  <Input
                    className="col-span-2 h-8"
                    value={line.qty}
                    onChange={e => updateLine(line.key, { qty: e.target.value })}
                    inputMode="numeric"
                    aria-label="Quantity"
                    placeholder="Qty"
                  />
                  <Input
                    className="col-span-3 h-8"
                    value={line.price}
                    onChange={e => updateLine(line.key, { price: e.target.value })}
                    inputMode="decimal"
                    aria-label="Price each in rupees"
                    placeholder="₹ each"
                  />
                  <button
                    type="button"
                    onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== line.key) : [blankLine()]))}
                    className="col-span-1 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 justify-self-center"
                    title="Remove line"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLines(ls => [...ls, blankLine()])} className="inline-flex items-center gap-1 text-sm font-medium text-[#F15A24] hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add another item
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="order_delivery">Delivery ₹</Label>
              <Input id="order_delivery" value={delivery} onChange={e => setDelivery(e.target.value)} inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order_discount">Discount ₹</Label>
              <Input id="order_discount" value={discount} onChange={e => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order_due">Due date</Label>
              <Input id="order_due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="order_notes">Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea id="order_notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Engraving, size, delivery address…" />
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-lg font-bold text-gray-900">{formatRupees(total)}</span>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#F15A24] hover:bg-[#d44d1b] text-white" disabled={pending}>
              {pending ? 'Saving…' : order ? 'Save changes' : 'Create order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
