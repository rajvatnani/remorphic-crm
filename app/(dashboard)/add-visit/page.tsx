'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addVisit, addCustomerAndVisit } from '@/app/actions/visits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Business, Customer } from '@/types'
import { CUSTOMER_LABELS } from '@/types'

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

export default function AddVisitPage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [customers, setCustomers] = useState<Pick<Customer, 'id' | 'name' | 'phone'>[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: biz } = await supabase.from('businesses').select('*').single()
      if (!biz) return
      setBusiness(biz)

      const { data: custs } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('business_id', biz.id)
        .order('name')
      setCustomers(custs ?? [])
    }
    load()
  }, [])

  const label = business ? CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS] : 'Customer'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const fd = new FormData(e.currentTarget)

    try {
      if (isNewCustomer) {
        await addCustomerAndVisit(fd)
      } else {
        await addVisit(fd)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPending(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Add Visit</h1>
        <p className="text-sm text-gray-500 mt-1">Record a new visit for a {label.toLowerCase()}</p>
      </div>

      <Card className="shadow-none border border-gray-200">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Customer selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="customer_mode"
                    checked={!isNewCustomer}
                    onChange={() => setIsNewCustomer(false)}
                    className="accent-[#1a8585]"
                  />
                  Existing {label}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="customer_mode"
                    checked={isNewCustomer}
                    onChange={() => setIsNewCustomer(true)}
                    className="accent-[#1a8585]"
                  />
                  New {label}
                </label>
              </div>

              {!isNewCustomer ? (
                <div className="space-y-2">
                  <Label htmlFor="customer_id">{label}</Label>
                  <input type="hidden" name="customer_id" value={customerId} />
                  <Select
                    value={customerId}
                    onValueChange={(v) => { if (v !== null) setCustomerId(v) }}
                  >
                    <SelectTrigger id="customer_id" className="w-full">
                      <SelectValue placeholder={`Select a ${label.toLowerCase()}…`} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — {c.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">New {label} details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new_customer_name">Full Name</Label>
                      <Input
                        id="new_customer_name"
                        name="new_customer_name"
                        placeholder="Jane Smith"
                        required={isNewCustomer}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new_customer_phone">Phone</Label>
                      <Input
                        id="new_customer_phone"
                        name="new_customer_phone"
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        required={isNewCustomer}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Visit details */}
            <div className="space-y-2">
              <Label htmlFor="service">Service</Label>
              <Input
                id="service"
                name="service"
                placeholder="e.g. Haircut, Checkup, Personal Training"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visited_at">Visit Date</Label>
              <Input
                id="visited_at"
                name="visited_at"
                type="date"
                defaultValue={todayDate()}
                max={todayDate()}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any notes about this visit…"
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-[#1a8585] hover:bg-[#156e6e] text-white"
              disabled={pending || (!isNewCustomer && !customerId)}
            >
              {pending ? 'Saving…' : 'Save Visit'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
