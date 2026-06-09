'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  bookAppointment,
  confirmAppointment,
  cancelAppointment,
  approveBooking,
  declineBooking,
} from '@/app/actions/appointments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AppointmentConfig, AppointmentWithCustomer, Business } from '@/types'
import { CUSTOMER_LABELS, DAY_NAMES } from '@/types'
import { ChevronLeft, ChevronRight, Plus, Check, X, Search, Clock } from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr() {
  return localDateStr(new Date())
}

function generateSlots(config: AppointmentConfig): string[] {
  const slots: string[] = []
  const [sh, sm] = config.start_time.split(':').map(Number)
  const [eh, em] = config.end_time.split(':').map(Number)
  let mins = sh * 60 + sm
  const endMins = eh * 60 + em
  while (mins < endMins) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    mins += config.slot_duration
  }
  return slots
}

function formatSlotTime(slot: string) {
  const [h, m] = slot.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

function getDayOfWeek(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').getDay()
}

// ─── status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed')
    return <Badge className="bg-green-50 text-green-700 border-0 text-xs">Confirmed</Badge>
  if (status === 'cancelled')
    return <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Cancelled</Badge>
  if (status === 'pending')
    return <Badge className="bg-purple-50 text-purple-700 border-0 text-xs">Pending Approval</Badge>
  return <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">Scheduled</Badge>
}

// ─── add booking dialog ──────────────────────────────────────────────────────

function AddBookingDialog({
  open,
  onClose,
  slotTime,
  date,
  customers,
  label,
  onBooked,
}: {
  open: boolean
  onClose: () => void
  slotTime: string
  date: string
  customers: { id: string; name: string; phone: string }[]
  label: string
  onBooked: () => void
}) {
  const [isNew, setIsNew] = useState(false)
  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setIsNew(false); setQuery(''); setCustomerId('')
      setSelectedName(''); setError(null); setShowSuggestions(false)
    }
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim().length > 0
    ? customers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
      ).slice(0, 8)
    : []

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isNew && !customerId) { setError(`Please select a ${label.toLowerCase()}`); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (!isNew) fd.set('customer_id', customerId)
    fd.set('slot_time', slotTime)
    fd.set('appointment_date', date)

    startTransition(async () => {
      try {
        await bookAppointment(fd)
        onBooked()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book Appointment — {formatSlotTime(slotTime)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">

          {/* Toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="radio" checked={!isNew} onChange={() => { setIsNew(false); setQuery(''); setCustomerId(''); setSelectedName('') }} className="accent-[#F15A24]" />
              Existing {label}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="radio" checked={isNew} onChange={() => setIsNew(true)} className="accent-[#F15A24]" />
              New {label}
            </label>
          </div>

          {/* Existing customer search */}
          {!isNew && (
            <div className="space-y-2">
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setCustomerId(''); setSelectedName(''); setShowSuggestions(true) }}
                    onFocus={() => { if (query) setShowSuggestions(true) }}
                    placeholder={`Search ${label.toLowerCase()} by name or phone…`}
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    autoComplete="off"
                  />
                </div>
                {showSuggestions && filtered.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {filtered.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => { setCustomerId(c.id); setSelectedName(c.name); setQuery(c.name); setShowSuggestions(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-sm text-gray-900">{c.name}</span>
                        <span className="text-sm text-gray-400">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedName && <p className="text-xs font-medium" style={{ color: '#F15A24' }}>✓ {selectedName} selected</p>}
            </div>
          )}

          {/* New customer fields */}
          {isNew && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new_customer_name">Name</Label>
                  <Input id="new_customer_name" name="new_customer_name" placeholder="Jane Smith" required={isNew} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_customer_phone">Phone</Label>
                  <Input id="new_customer_phone" name="new_customer_phone" type="tel" placeholder="+1 555 000 0000" required={isNew} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <Input id="service" name="service" placeholder="e.g. Checkup, Haircut, Court 1" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Any notes…" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 text-white" style={{ backgroundColor: '#F15A24' }} disabled={pending}>
              {pending ? 'Booking…' : 'Book Appointment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [date, setDate] = useState(todayStr())
  const [business, setBusiness] = useState<Business | null>(null)
  const [config, setConfig] = useState<AppointmentConfig | null>(null)
  const [appointments, setAppointments] = useState<AppointmentWithCustomer[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [dialogSlot, setDialogSlot] = useState<string | null>(null)
  const [actionPending, startTransition] = useTransition()

  const supabase = createClient()

  async function loadBase() {
    const { data: biz } = await supabase.from('businesses').select('*').single()
    if (!biz) return
    setBusiness(biz)

    const [{ data: cfg }, { data: custs }, { count: pc }] = await Promise.all([
      supabase.from('appointment_config').select('*').eq('business_id', biz.id).single(),
      supabase.from('customers').select('id, name, phone').eq('business_id', biz.id).order('name'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('status', 'pending'),
    ])

    setConfig(cfg ?? null)
    setCustomers(custs ?? [])
    setPendingCount(pc ?? 0)
  }

  async function loadAppointments(d: string) {
    setLoading(true)
    const { data: biz } = await supabase.from('businesses').select('id').single()
    if (!biz) return
    const { data } = await supabase
      .from('appointments')
      .select('*, customers(name, phone)')
      .eq('business_id', biz.id)
      .eq('appointment_date', d)
      .order('slot_time')
    setAppointments((data as AppointmentWithCustomer[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadBase() }, [])
  useEffect(() => { loadAppointments(date) }, [date])

  const label = business ? CUSTOMER_LABELS[business.type as keyof typeof CUSTOMER_LABELS] : 'Customer'
  const slots = config ? generateSlots(config) : []
  const dayOfWeek = getDayOfWeek(date)
  const isClosed = config ? !config.open_days.includes(dayOfWeek) : false

  const bySlot: Record<string, AppointmentWithCustomer[]> = {}
  for (const a of appointments) {
    const key = a.slot_time.slice(0, 5)
    if (!bySlot[key]) bySlot[key] = []
    bySlot[key].push(a)
  }

  function handleConfirm(id: string) {
    startTransition(async () => {
      await confirmAppointment(id)
      await loadAppointments(date)
    })
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelAppointment(id)
      await loadAppointments(date)
    })
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      await approveBooking(id)
      await loadBase()
      await loadAppointments(date)
    })
  }

  function handleDecline(id: string) {
    startTransition(async () => {
      await declineBooking(id)
      await loadBase()
      await loadAppointments(date)
    })
  }

  const isToday = date === todayStr()

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate(date)}</p>
        </div>
        {!config && (
          <a href="/settings" className="text-sm font-medium" style={{ color: '#F15A24' }}>
            ⚙ Configure slots first →
          </a>
        )}
      </div>

      {/* Pending bookings banner */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold shrink-0">
            {pendingCount}
          </span>
          <p className="text-sm font-medium text-purple-800">
            {pendingCount === 1 ? '1 online booking request' : `${pendingCount} online booking requests`} waiting for your approval — navigate to the relevant date to approve.
          </p>
        </div>
      )}

      {/* Date navigator */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setDate(d => addDays(d, -1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 outline-none focus:border-orange-400"
        />
        <button
          onClick={() => setDate(d => addDays(d, 1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
        {!isToday && (
          <button
            onClick={() => setDate(todayStr())}
            className="px-3 h-9 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
        )}
      </div>

      {/* No config */}
      {!config && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Clock className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="font-medium text-amber-800">Appointment slots not configured</p>
          <p className="text-sm text-amber-600 mt-1">
            Go to <a href="/settings" className="underline font-medium">Settings</a> to set your slot duration, capacity, and working hours.
          </p>
        </div>
      )}

      {/* Closed day */}
      {config && isClosed && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="font-medium text-gray-700">{DAY_NAMES[dayOfWeek]}s are marked as closed</p>
          <p className="text-sm text-gray-500 mt-1">No appointment slots available. You can still navigate to other days.</p>
        </div>
      )}

      {/* Slots */}
      {config && !isClosed && (
        <div className="space-y-3">
          {loading && (
            <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
          )}
          {!loading && slots.map(slot => {
            const booked = bySlot[slot] ?? []
            const active = booked.filter(a => a.status !== 'cancelled')
            const full = active.length >= config.max_per_slot

            return (
              <div key={slot} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Slot header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 text-sm w-24">
                      {formatSlotTime(slot)}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      full
                        ? 'bg-red-50 text-red-600'
                        : active.length > 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-green-50 text-green-600'
                    }`}>
                      {active.length}/{config.max_per_slot} booked
                    </span>
                  </div>
                  {!full && (
                    <button
                      onClick={() => setDialogSlot(slot)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-orange-50"
                      style={{ color: '#F15A24', borderColor: '#F15A24' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Booking
                    </button>
                  )}
                </div>

                {/* Bookings in this slot */}
                {booked.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {booked.map(appt => (
                      <div
                        key={appt.id}
                        className={`flex items-center justify-between px-4 py-3 ${appt.status === 'cancelled' ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">
                              {appt.customers.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {appt.service} · {appt.customers.phone}
                            </p>
                            {appt.notes && (
                              <p className="text-xs text-gray-400 mt-0.5 italic">{appt.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                          <StatusBadge status={appt.status} />
                          {appt.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(appt.id)}
                                disabled={actionPending}
                                title="Approve booking"
                                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleDecline(appt.id)}
                                disabled={actionPending}
                                title="Decline booking"
                                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Decline
                              </button>
                            </>
                          )}
                          {appt.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => handleConfirm(appt.id)}
                                disabled={actionPending}
                                title="Confirm visit"
                                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirm Visit
                              </button>
                              <button
                                onClick={() => handleCancel(appt.id)}
                                disabled={actionPending}
                                title="Cancel appointment"
                                className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add booking dialog */}
      <AddBookingDialog
        open={dialogSlot !== null}
        onClose={() => setDialogSlot(null)}
        slotTime={dialogSlot ?? '09:00'}
        date={date}
        customers={customers}
        label={label}
        onBooked={() => loadAppointments(date)}
      />
    </div>
  )
}
