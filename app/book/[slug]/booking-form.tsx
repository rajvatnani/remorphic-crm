'use client'

import { useState, useEffect, useTransition } from 'react'
import { getSlotAvailability, sendBookingOtp, createOnlineBooking } from '@/app/actions/online-booking'
import { ChevronLeft, ChevronRight, CheckCircle, CalendarDays, Clock, MapPin, Upload } from 'lucide-react'

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

const TYPE_EMOJI: Record<string, string> = {
  clinic: '🏥',
  salon: '✂️',
  gym: '💪',
  other: '🏢',
}

const SLOT_GROUPS = [
  { key: 'morning',   label: 'Morning',   emoji: '🌅', test: (h: number) => h >= 0  && h < 12 },
  { key: 'afternoon', label: 'Afternoon', emoji: '☀️', test: (h: number) => h >= 12 && h < 17 },
  { key: 'evening',   label: 'Evening',   emoji: '🌇', test: (h: number) => h >= 17 && h < 21 },
  { key: 'night',     label: 'Night',     emoji: '🌙', test: (h: number) => h >= 21 },
]

function groupSlots(slots: string[]) {
  return SLOT_GROUPS
    .map(g => ({ ...g, slots: slots.filter(s => g.test(Number(s.split(':')[0]))) }))
    .filter(g => g.slots.length > 0)
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
  customer_label: string | null
  address: string | null
  photo: string | null
  price_per_slot: number | null
  payment_qr: string | null
  services_offered: string | null
}

interface GalleryPhoto {
  id: string
  url: string
}

export default function BookingForm({
  business,
  config,
  gallery,
}: {
  business: Business
  config: Config | null
  gallery: GalleryPhoto[]
}) {
  const today = localDateStr(new Date())
  const [date, setDate] = useState(() => {
    if (!config) return today
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i)
      if (config.open_days.includes(new Date(d + 'T00:00:00').getDay())) return d
    }
    return today
  })
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotFailed, setScreenshotFailed] = useState(false)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function clearScreenshot() {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    setScreenshot(null)
    setScreenshotPreview(null)
  }

  // Kept in the browser until the booking is confirmed
  function handleScreenshotSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('The payment screenshot must be a JPG, PNG or WebP image.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('The payment screenshot must be smaller than 3 MB.')
      return
    }
    clearScreenshot()
    setError(null)
    setScreenshot(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }

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
          {business.photo ? (
            <img src={business.photo} alt={business.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-4 shadow-md" />
          ) : (
            <div className="text-5xl mb-4">{TYPE_EMOJI[business.type] ?? '🏢'}</div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{business.name}</h1>
          {business.address && (
            <p className="flex items-center justify-center gap-1 text-gray-400 text-sm mb-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />{business.address}
            </p>
          )}
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
  const isPastDate = (d: string) => d < today

  function isPastSlot(slot: string) {
    if (date !== today) return false
    const now = new Date()
    const [h, m] = slot.split(':').map(Number)
    return h * 60 + m <= now.getHours() * 60 + now.getMinutes()
  }

  function handleDateSelect(d: string) {
    if (isClosed(d) || isPastDate(d)) return
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
    setNotice(null)
    // A code already sent to this number still works (e.g. after the first slot
    // was taken), and the OTP step offers a resend if it has expired.
    if (codeSentTo === phone.trim()) { setStep('otp'); return }
    startTransition(async () => {
      const res = await sendBookingOtp(phone, business.id)
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      setCodeSentTo(phone.trim())
      setStep('otp')
    })
  }

  function handleResendOtp() {
    setOtpCode('')
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await sendBookingOtp(phone, business.id)
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      setNotice('New code sent.')
    })
  }

  function handleVerifyOtp() {
    if (otpCode.length !== 6) { setError('Enter the 6-digit code.'); return }
    setError(null)
    setNotice(null)
    startTransition(async () => {
      let upload: FormData | undefined
      if (screenshot) {
        upload = new FormData()
        upload.set('file', screenshot)
      }
      const res = await createOnlineBooking({
        businessId: business.id,
        name,
        phone,
        code: otpCode,
        date,
        slot: selectedSlot!,
        selectedServices,
      }, upload)
      if (!res.ok) {
        setError(res.error ?? 'Booking failed.')
        if (res.slotUnavailable) {
          setSelectedSlot(null)
          setStep('pick')
          setSlotCounts(await getSlotAvailability(business.id, date))
        }
        return
      }
      setScreenshotFailed(Boolean(res.screenshotFailed))
      setStep('done')
    })
  }

  const label = business.customer_label ?? 'Customer'

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
          {screenshotFailed && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3">
              Your payment screenshot could not be saved. Please send it to {business.name} directly.
            </p>
          )}
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
            We sent a 6-digit code to <span className="font-medium text-gray-800">{phone}</span> via WhatsApp.
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

          {notice && (
            <p className="text-sm text-green-700 bg-green-50 px-4 py-2 rounded-xl mb-4">{notice}</p>
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
            onClick={handleResendOtp}
            disabled={pending}
            className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
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

          {/* Payment QR */}
          {business.payment_qr && (
            <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4 mb-6">
              <p className="text-sm font-semibold text-gray-800 mb-3">Pre-pay your booking fee</p>
              <img src={business.payment_qr} alt="Payment QR" className="w-44 h-44 object-contain mx-auto rounded-xl bg-white p-2 mb-3" />
              <p className="text-xs text-gray-500 text-center mb-4">Scan the QR code to pay your booking fee in advance</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Upload payment screenshot <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {screenshotPreview ? (
                  <div className="flex items-center gap-3 mt-1">
                    <img src={screenshotPreview} alt="Payment proof" className="w-16 h-16 object-cover rounded-xl border border-orange-200" />
                    <div>
                      <p className="text-xs text-green-600 font-medium mb-1">✓ Screenshot added</p>
                      <button type="button" onClick={clearScreenshot} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-orange-200 rounded-2xl px-4 py-3 hover:bg-orange-50/50 transition-colors mt-1">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleScreenshotSelect} className="hidden" />
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Tap to add screenshot</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Services */}
          {(() => {
            const services = (business.services_offered ?? '').split(',').map(s => s.trim()).filter(Boolean)
            if (!services.length) return null
            return (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Services <span className="text-gray-400 font-normal">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {services.map(svc => {
                    const active = selectedServices.includes(svc)
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => setSelectedServices(prev =>
                          prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
                        )}
                        className="px-4 py-2 rounded-2xl text-sm font-medium border-2 transition-all"
                        style={active
                          ? { backgroundColor: '#F15A24', borderColor: '#F15A24', color: '#fff' }
                          : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#374151' }
                        }
                      >
                        {svc}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

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
              <label className="text-sm font-medium text-gray-700">WhatsApp number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(null) }}
                placeholder="98765 43210"
                className="w-full h-12 px-4 rounded-2xl border-2 border-gray-200 focus:border-[#F15A24] outline-none text-sm transition-colors"
              />
              <p className="text-xs text-gray-400">We'll send a verification code to this number via WhatsApp</p>
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
          {business.photo ? (
            <img src={business.photo} alt={business.name} className="w-24 h-24 rounded-full object-cover mx-auto mb-3 shadow-md border-2 border-white" />
          ) : (
            <div className="text-5xl mb-3">{TYPE_EMOJI[business.type] ?? '🏢'}</div>
          )}
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{business.name}</h1>
          {business.address && (
            <p className="flex items-center justify-center gap-1 text-gray-500 text-sm mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />{business.address}
            </p>
          )}
          {business.price_per_slot != null && (
            <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-orange-100 text-[#F15A24]">
              ₹{business.price_per_slot} per slot
            </span>
          )}
          <p className="text-gray-400 mt-2 text-sm">Pick a date and time below</p>
        </div>

        {/* Gallery */}
        {gallery.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {gallery.map(photo => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt="Gallery"
                  className="w-44 h-32 object-cover rounded-2xl flex-shrink-0 shadow-sm"
                />
              ))}
            </div>
          </div>
        )}

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
              const closed = isClosed(d) || isPastDate(d)
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

          {isClosed(date) ? (
            <p className="text-center text-gray-400 text-sm py-6">
              {fmtDate(date, { weekday: 'long' })} is closed for bookings. Please pick another day.
            </p>
          ) : loadingSlots ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-11 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">No slots configured for this day.</p>
          ) : (
            <div className="space-y-5">
              {groupSlots(slots).map(group => (
                <div key={group.key}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {group.emoji} {group.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.slots.map(slot => {
                      const count = slotCounts[slot] ?? 0
                      const full = count >= config.max_per_slot || isPastSlot(slot)
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
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mb-4">{error}</p>
        )}

        <button
          onClick={handleContinueToDetails}
          disabled={!selectedSlot || isClosed(date)}
          className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-lg transition-all disabled:opacity-40 disabled:shadow-none disabled:scale-100 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: '#F15A24' }}
        >
          {selectedSlot ? `Book ${fmtSlot(selectedSlot)} →` : 'Select a time to continue'}
        </button>
      </div>
    </div>
  )
}
