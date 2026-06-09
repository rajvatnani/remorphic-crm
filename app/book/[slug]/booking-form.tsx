'use client'

import { useState, useEffect, useTransition } from 'react'
import { getSlotAvailability, sendBookingOtp, verifyBookingOtp, createOnlineBooking } from '@/app/actions/online-booking'
import { CUSTOMER_LABELS } from '@/types'
import type { BusinessType } from '@/types'
import { ChevronLeft, ChevronRight, CheckCircle, CalendarDays, Clock } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

function generateSlots(config: { start_time: string; end_time: string; slot_duration: number }) {
  const slots: string[] = []
  const [sh, sm] = config.start_time.split(':').map(Number)
  const [eh, em] = config.end_time.split(':').map(Number)
  let mins = sh * 60 + sm
  const end = eh * 60 + em
  while (mins < end) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
    mins += config.slot_duration
  }
  return slots
}

function fmtSlot(slot: string) {
  const [h, m] = slot.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`
}

function fmtDate(dateStr: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', opts)
}

const TYPE_EMOJI: Record<BusinessType, string> = {
  clinic: '🏥',
  salon: '✂️',
  gym: '💪',
  other: '🏢',
}

// ── component ────────────────────────────────────────────────────────────────

type Step = 'pick' | 'details' | 'otp' | 'done'

interface Config {
  slot_duration: number
  max_per_slot: number
  start_time: string
  end_time: string
  open_days: number[]
}

interface Business {
  id: string
  name: string
  type: string
  slug: string
  phone: string
}

export default function BookingForm({
  business,
  config,
}: {
  business: Business
  config: Config | null
}) {
  const today = localDateStr(new Date())
  const [date, setDate] = useState(today)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Load slot availability when date changes
  useEffect(() => {
    if (!config) return
    setLoadingSlots(true)
    getSlotAvailability(business.id, date).then(counts => {
      setSlotCounts(counts)
      setLoadingSlots(false)
    })
  }, [date, business.id, config])

  if (!config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-sm border border-orange-100 p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">{TYPE_EMOJI[business.type as BusinessType] ?? '🏢'}</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{business.name}</h1>
          <p className="text-gray-500">Online booking isn't available yet. Please contact us directly.</p>
        </div>
      </div>
    )
  }

  const slots = generateSlots(config)

  // 7-day strip starting from weekOffset * 7 days
  const stripStart = addDays(today, weekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i))

  const dayOfWeek = (d: string) => new Date(d + 'T00:00:00').getDay()
  const isClosed = (d: string) => !config.open_days.includes(dayOfWeek(d))

  function handleDateSelect(d: string) {
    if (isClosed(d)) return
    setDate(d)
    setSelectedSlot(null)
    setError(null)
  }

  function handleSlotSelect(slot: string) {
    setSelectedSlot(slot)
    setError(null)
  }

  function handleContinueToDetails() {
    if (!selectedSlot) { setError('Please pick a time slot first.'); return }
    setStep('details')
    setError(null)
  }

  function handleSendOtp() {
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!phone.trim()) { setError('Please enter your phone number.'); return }
    setError(null)
    startTransition(async () => {
      const res = await sendBookingOtp(phone, business.id)
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      setStep('otp')
    })
  }

  function handleVerifyOtp() {
    if (otpCode.length !== 6) { setError('Enter the 6-digit code.'); return }
    setError(null)
    startTransition(async () => {
      const res = await verifyBookingOtp(phone, otpCode, business.id)
      if (!res.ok) { setError(res.error ?? 'Verification failed.'); return }
      const bookRes = await createOnlineBooking({
        businessId: business.id,
        businessName: business.name,
        businessPhone: business.phone,
        name,
        phone,
        date,
        slot: selectedSlot!,
      })
      if (!bookRes.ok) { setError(bookRes.error ?? 'Booking failed.'); return }
      setStep('done')
    })
  }

  const label = CUSTOMER_LABELS[business.type as BusinessType] ?? 'Customer'

  // ── STEP: DONE ─────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
          <p className="text-gray-500 mb-6">
            Your booking request at <span className="font-semibold text-gray-800">{business.name}</span> for{' '}
            <span className="font-semibold text-gray-800">
              {fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' })} at {fmtSlot(selectedSlot!)}
            </span>{' '}
            has been submitted.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
            We'll send you a WhatsApp confirmation once it's approved.
          </div>
        </div>
      </div>
    )
  }

  // ── STEP: OTP ──────────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50 flex items-start justify-center p-4 pt-16">
        <div className="bg-white rounded-3xl shadow-md p-8 max-w-sm w-full">
          <button onClick={() => { setStep('details'); setOtpCode(''); setError(null) }} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-6">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Verify your phone</h2>
          <p className="text-gray-500 text-sm mb-8">
            We sent a 6-digit code to <span className="font-medium text-gray-800">{phone}</span> via SMS.
          </p>

          <div className="space-y-2 mb-6">
            <label className="text-sm font-medium text-gray-700">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '')); setError(null) }}
              placeholder="000000"
              className="w-full h-14 rounded-2xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-center text-2xl font-bold tracking-[0.5em] transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mb-4">{error}</p>
          )}

          <button
            onClick={handleVerifyOtp}
            disabled={pending || otpCode.length !== 6}
            className="w-full h-12 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-50"
            style={{ backgroundColor: '#F15A24' }}
          >
            {pending ? 'Verifying…' : 'Confirm Booking'}
          </button>

          <button
            onClick={() => { setOtpCode(''); startTransition(async () => { await sendBookingOtp(phone, business.id) }) }}
            className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Resend code
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: DETAILS ──────────────────────────────────────────────────────────
  if (step === 'details') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50 flex items-start justify-center p-4 pt-16">
        <div className="bg-white rounded-3xl shadow-md p-8 max-w-sm w-full">
          <button onClick={() => { setStep('pick'); setError(null) }} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-6">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Your details</h2>

          {/* Selected slot summary */}
          <div className="flex items-center gap-2 mt-3 mb-8 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
            <CalendarDays className="w-4 h-4 shrink-0" style={{ color: '#F15A24' }} />
            <span className="text-sm font-medium text-gray-700">
              {fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtSlot(selectedSlot!)}
            </span>
          </div>

          <div className="space-y-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(null) }}
                placeholder={label}
                className="w-full h-12 px-4 rounded-2xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm transition-colors"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(null) }}
                placeholder="+1 555 000 0000"
                className="w-full h-12 px-4 rounded-2xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm transition-colors"
              />
              <p className="text-xs text-gray-400">We'll send a verification code via SMS</p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mb-4">{error}</p>
          )}

          <button
            onClick={handleSendOtp}
            disabled={pending}
            className="w-full h-12 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-50"
            style={{ backgroundColor: '#F15A24' }}
          >
            {pending ? 'Sending code…' : 'Send WhatsApp Code →'}
          </button>
        </div>
      </div>
    )
  }

  // ── STEP: PICK ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-rose-50">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Business header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{TYPE_EMOJI[business.type as BusinessType] ?? '🏢'}</div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{business.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">Pick a date and time below</p>
        </div>

        {/* Date strip */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-600">
              {fmtDate(stripStart, { month: 'long', year: 'numeric' })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
                disabled={weekOffset === 0}
                className="p-1.5 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(d => {
              const closed = isClosed(d)
              const selected = d === date
              const isToday = d === today
              const dow = new Date(d + 'T00:00:00')
              return (
                <button
                  key={d}
                  onClick={() => handleDateSelect(d)}
                  disabled={closed}
                  className={`flex flex-col items-center py-2.5 px-1 rounded-2xl transition-all ${
                    selected
                      ? 'text-white shadow-md scale-105'
                      : closed
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-orange-50'
                  }`}
                  style={selected ? { backgroundColor: '#F15A24' } : undefined}
                >
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {dow.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                  </span>
                  <span className={`text-lg font-bold leading-tight mt-0.5 ${isToday && !selected ? 'text-[#F15A24]' : ''}`}>
                    {dow.getDate()}
                  </span>
                  {isToday && !selected && (
                    <span className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#F15A24' }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Slots */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-600">
              Available times — {fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {loadingSlots ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-11 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map(slot => {
                const count = slotCounts[slot] ?? 0
                const full = count >= config.max_per_slot
                const chosen = slot === selectedSlot
                return (
                  <button
                    key={slot}
                    onClick={() => !full && handleSlotSelect(slot)}
                    disabled={full}
                    className={`h-11 rounded-2xl text-sm font-semibold transition-all ${
                      chosen
                        ? 'text-white shadow-md scale-[1.03]'
                        : full
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        : 'bg-white border-2 border-orange-200 text-gray-700 hover:border-[#F15A24] hover:bg-orange-50'
                    }`}
                    style={chosen ? { backgroundColor: '#F15A24' } : undefined}
                  >
                    {fmtSlot(slot)}
                  </button>
                )
              })}
            </div>
          )}

          {!loadingSlots && slots.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">No slots configured for this day.</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mb-4">{error}</p>
        )}

        <button
          onClick={handleContinueToDetails}
          disabled={!selectedSlot}
          className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-lg transition-all disabled:opacity-40 disabled:shadow-none disabled:scale-100 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: '#F15A24' }}
        >
          {selectedSlot ? `Book ${fmtSlot(selectedSlot)} →` : 'Select a time to continue'}
        </button>
      </div>
    </div>
  )
}
