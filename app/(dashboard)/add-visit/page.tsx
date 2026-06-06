'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addVisit, addCustomerAndVisit } from '@/app/actions/visits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Business, Customer } from '@/types'
import { CUSTOMER_LABELS } from '@/types'
import { Search, X } from 'lucide-react'

function todayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AddVisitPage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [customers, setCustomers] = useState<Pick<Customer, 'id' | 'name' | 'phone'>[]>([])
  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

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

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const label = business ? CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS] : 'Customer'

  const filtered = query.trim().length > 0
    ? customers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
      ).slice(0, 8)
    : []

  function selectCustomer(c: Pick<Customer, 'id' | 'name' | 'phone'>) {
    setCustomerId(c.id)
    setSelectedName(c.name)
    setQuery(c.name)
    setShowSuggestions(false)
  }

  function clearCustomer() {
    setCustomerId('')
    setSelectedName('')
    setQuery('')
  }

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
        <h1 className="font-heading font-heading text-4xl font-extrabold text-gray-900 tracking-tight tracking-tight">Add Visit</h1>
        <p className="text-sm text-gray-500 mt-1">Record a new visit for a {label.toLowerCase()}</p>
      </div>

      <Card className="shadow-none border border-gray-200">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Customer mode toggle */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="radio"
                  name="customer_mode"
                  checked={!isNewCustomer}
                  onChange={() => { setIsNewCustomer(false); clearCustomer() }}
                  className="accent-[#F15A24]"
                />
                Existing {label}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="radio"
                  name="customer_mode"
                  checked={isNewCustomer}
                  onChange={() => { setIsNewCustomer(true); clearCustomer() }}
                  className="accent-[#F15A24]"
                />
                New {label}
              </label>
            </div>

            {/* Existing customer search */}
            {!isNewCustomer && (
              <div className="space-y-2">
                <Label>{label}</Label>
                <input type="hidden" name="customer_id" value={customerId} />
                <div ref={searchRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={query}
                      onChange={e => {
                        setQuery(e.target.value)
                        setCustomerId('')
                        setSelectedName('')
                        setShowSuggestions(true)
                      }}
                      onFocus={() => { if (query) setShowSuggestions(true) }}
                      placeholder={`Search by name or phone…`}
                      className="w-full h-9 pl-9 pr-9 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      autoComplete="off"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={clearCustomer}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Suggestions dropdown */}
                  {showSuggestions && filtered.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {filtered.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => selectCustomer(c)}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="font-medium text-sm text-gray-900">{c.name}</span>
                          <span className="text-sm text-gray-400">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* No results */}
                  {showSuggestions && query.trim().length > 0 && filtered.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
                      No {label.toLowerCase()}s found
                    </div>
                  )}
                </div>

                {/* Selected customer confirmation */}
                {selectedName && customerId && (
                  <p className="text-xs text-[#F15A24] font-medium">✓ {selectedName} selected</p>
                )}
              </div>
            )}

            {/* New customer fields */}
            {isNewCustomer && (
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
              className="w-full bg-[#F15A24] hover:bg-[#d44d1b] text-white"
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
