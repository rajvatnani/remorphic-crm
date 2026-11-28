'use client'

import { useState, useEffect } from 'react'
import FeaturesCard from './features-card'
import type { ModuleKey } from '@/lib/modules'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { saveAppointmentConfig } from '@/app/actions/appointments'
import { inviteStaff, removeUser } from '@/app/actions/staff'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { normalizePhone } from '@/lib/phone'
import { DAY_NAMES } from '@/types'
import type { BusinessTypeRecord } from '@/types'
import { CheckCircle, Trash2, UserPlus, Upload, X } from 'lucide-react'

interface StaffMember {
  id: string
  user_id: string
  email: string
  created_at: string
}

export default function SettingsPage() {
  // Which features are on, reported by the Features card
  const [modules, setModules] = useState<Record<ModuleKey, boolean> | null>(null)
  // Business profile
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('other')
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeRecord[]>([])
  const [inactiveThresholdDays, setInactiveThresholdDays] = useState('60')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessSlug, setBusinessSlug] = useState('')
  const [address, setAddress] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [pricePerSlot, setPricePerSlot] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [galleryPhotos, setGalleryPhotos] = useState<{ id: string; url: string }[]>([])
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [servicesOffered, setServicesOffered] = useState('')
  const [paymentQrUrl, setPaymentQrUrl] = useState('')
  const [qrUploading, setQrUploading] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [profilePending, setProfilePending] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Appointment config
  const [slotDuration, setSlotDuration] = useState('30')
  const [maxPerSlot, setMaxPerSlot] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [apptPending, setApptPending] = useState(false)
  const [apptSaved, setApptSaved] = useState(false)
  const [apptError, setApptError] = useState<string | null>(null)

  // Staff
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffError, setStaffError] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePending, setInvitePending] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)

  const router = useRouter()

  async function loadStaff(businessId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('business_users')
      .select('id, user_id, email, created_at')
      .eq('business_id', businessId)
      .order('created_at')
    if (error) {
      setStaffError('Could not load staff members. Please refresh the page.')
      return
    }
    setStaffError(null)
    setStaffList(data)
  }

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: types } = await supabase.from('business_types').select('*').order('label')
      if (types) setBusinessTypes(types)

      const { data: biz } = await supabase.from('businesses').select('*').single()
      if (!biz) return
      setBusinessId(biz.id)
      setOwnerUserId(biz.user_id)
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      setBusinessName(biz.name)
      setBusinessType(biz.type)
      setBusinessPhone(biz.phone ?? '')
      setInactiveThresholdDays(String(biz.inactive_threshold_days))
      setBusinessSlug(biz.slug ?? '')
      setAddress(biz.address ?? '')
      setMapsUrl((biz as any).maps_url ?? '')
      setPhotoUrl(biz.photo ?? '')
      setPricePerSlot(biz.price_per_slot != null ? String(biz.price_per_slot) : '')
      setServicesOffered((biz as any).services_offered ?? '')
      setPaymentQrUrl((biz as any).payment_qr ?? '')

      const { data: gallery } = await supabase
        .from('business_gallery')
        .select('id, url')
        .eq('business_id', biz.id)
        .order('created_at')
      setGalleryPhotos(gallery ?? [])

      const { data: cfg } = await supabase
        .from('appointment_config')
        .select('*')
        .eq('business_id', biz.id)
        .single()
      if (cfg) {
        setSlotDuration(String(cfg.slot_duration))
        setMaxPerSlot(String(cfg.max_per_slot))
        setStartTime(cfg.start_time.slice(0, 5))
        setEndTime(cfg.end_time.slice(0, 5))
        setOpenDays(cfg.open_days)
      }

      await loadStaff(biz.id)
    }
    load()
  }, [])

  function toggleDay(day: number) {
    setOpenDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setGalleryUploading(true)
    const supabase = createClient()
    const { data: biz } = await supabase.from('businesses').select('id').single()
    if (biz) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${biz.id}/gallery/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('business-photos').upload(path, file)
      if (!error) {
        const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(path)
        const { data: row } = await supabase
          .from('business_gallery')
          .insert({ business_id: biz.id, url: urlData.publicUrl })
          .select('id')
          .single()
        if (row) setGalleryPhotos(prev => [...prev, { id: row.id, url: urlData.publicUrl }])
      }
    }
    setGalleryUploading(false)
    e.target.value = ''
  }

  async function handleGalleryDelete(photoId: string) {
    const supabase = createClient()
    await supabase.from('business_gallery').delete().eq('id', photoId)
    setGalleryPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setQrUploading(true)
    const supabase = createClient()
    const { data: biz } = await supabase.from('businesses').select('id').single()
    if (biz) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${biz.id}/payment-qr.${ext}`
      const { error } = await supabase.storage.from('business-photos').upload(path, file, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(path)
        setPaymentQrUrl(urlData.publicUrl)
      }
    }
    setQrUploading(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    const supabase = createClient()
    const { data: biz } = await supabase.from('businesses').select('id').single()
    if (biz) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${biz.id}/photo.${ext}`
      const { error } = await supabase.storage.from('business-photos').upload(path, file, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(path)
        setPhotoUrl(urlData.publicUrl)
      }
    }
    setPhotoUploading(false)
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    const threshold = parseInt(inactiveThresholdDays, 10)
    if (!Number.isFinite(threshold) || threshold < 1) {
      setProfileError('Inactivity threshold must be a positive number of days')
      return
    }
    if (!businessId) {
      setProfileError('Your business has not loaded yet. Please refresh the page.')
      return
    }
    setProfilePending(true)
    setProfileError(null)
    setProfileSaved(false)
    const supabase = createClient()
    const selectedType = businessTypes.find(t => t.id === businessType)
    const parsedPrice = pricePerSlot.trim() ? parseFloat(pricePerSlot) : null
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({
        name: businessName.trim(),
        type: businessType,
        // Leave the label alone if the list of types did not load
        ...(selectedType ? { customer_label: selectedType.customer_label } : {}),
        phone: normalizePhone(businessPhone),
        inactive_threshold_days: threshold,
        address: address.trim() || null,
        maps_url: mapsUrl.trim() || null,
        photo: photoUrl || null,
        price_per_slot: parsedPrice != null && !isNaN(parsedPrice) ? parsedPrice : null,
        services_offered: servicesOffered.trim() || null,
        payment_qr: paymentQrUrl || null,
      })
      .eq('id', businessId)
      .select('id')
    if (error) {
      setProfileError(error.message)
    } else if (!updated.length) {
      setProfileError('Nothing was saved. You may no longer have access to this business.')
    } else {
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
      router.refresh()
    }
    setProfilePending(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInvitePending(true)
    setInviteError(null)
    setInviteSent(false)
    try {
      await inviteStaff(inviteEmail.trim())
      setInviteSent(true)
      setInviteEmail('')
      setTimeout(() => setInviteSent(false), 4000)
      const supabase = createClient()
      const { data: biz } = await supabase.from('businesses').select('id').single()
      if (biz) await loadStaff(biz.id)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInvitePending(false)
    }
  }

  async function handleRemoveStaff(staffId: string) {
    setStaffError(null)
    try {
      const res = await removeUser(staffId)
      if (!res.ok) { setStaffError(res.error ?? 'Failed to remove staff member'); return }
      setStaffList(prev => prev.filter(s => s.id !== staffId))
    } catch {
      setStaffError('Failed to remove staff member')
    }
  }

  async function handleApptSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApptPending(true)
    setApptError(null)
    setApptSaved(false)
    const fd = new FormData()
    fd.set('slot_duration', slotDuration)
    fd.set('max_per_slot', maxPerSlot)
    fd.set('start_time', startTime)
    fd.set('end_time', endTime)
    openDays.forEach(d => fd.append('open_days', String(d)))
    try {
      await saveAppointmentConfig(fd)
      setApptSaved(true)
      setTimeout(() => setApptSaved(false), 3000)
    } catch (err) {
      setApptError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setApptPending(false)
    }
  }

  const currentLabel = businessTypes.find(t => t.id === businessType)?.customer_label ?? 'Customer'
  const suggestedThreshold = businessTypes.find(t => t.id === businessType)?.inactive_threshold_days

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="mb-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business profile and appointment configuration</p>
      </div>

      <FeaturesCard
        onModulesChange={setModules}
        extras={{
          appointments: (
            <>
              {/* Appointment Config */}
              <div className="space-y-3 pt-1">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Appointment Slots</h3>
                  <p className="text-xs text-gray-500">Define how your calendar is divided into bookable slots.</p>
                </div>
                <div>
                  <form onSubmit={handleApptSave} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Slot Duration</Label>
                        <Select value={slotDuration} onValueChange={(v) => { if (v !== null) setSlotDuration(v) }}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="45">45 minutes</SelectItem>
                            <SelectItem value="60">60 minutes</SelectItem>
                            <SelectItem value="90">90 minutes</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max_per_slot">Max Bookings Per Slot</Label>
                        <Input
                          id="max_per_slot"
                          type="number"
                          min={1}
                          max={50}
                          value={maxPerSlot}
                          onChange={e => setMaxPerSlot(e.target.value)}
                          required
                        />
                        <p className="text-xs text-gray-400">e.g. 2 for 2 pickleball courts</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start_time">Opening Time</Label>
                        <Input id="start_time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end_time">Closing Time</Label>
                        <Input id="end_time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Open Days</Label>
                      <div className="flex gap-2 flex-wrap">
                        {DAY_NAMES.map((name, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleDay(i)}
                            className="w-12 h-10 rounded-lg text-sm font-medium border transition-colors"
                            style={
                              openDays.includes(i)
                                ? { backgroundColor: '#F15A24', color: '#fff', borderColor: '#F15A24' }
                                : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
                            }
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {apptError && (
                      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{apptError}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <Button type="submit" className="text-white" style={{ backgroundColor: '#F15A24' }} disabled={apptPending}>
                        {apptPending ? 'Saving…' : 'Save Slot Config'}
                      </Button>
                      {apptSaved && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                          <CheckCircle className="h-4 w-4" /> Saved!
                        </span>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Online Booking */}
              {businessSlug && (
                <div className="space-y-3 pt-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Online Booking Link</h3>
                    <p className="text-xs text-gray-500">Share this link with customers so they can book appointments directly.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700">
                        {typeof window !== 'undefined' ? `${window.location.origin}/book/${businessSlug}` : `/book/${businessSlug}`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/book/${businessSlug}`)
                          setUrlCopied(true)
                          setTimeout(() => setUrlCopied(false), 2000)
                        }}
                      >
                        {urlCopied ? '✓ Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Gallery */}
              <div className="space-y-3 pt-1">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Gallery</h3>
                  <p className="text-xs text-gray-500">Photos shown on your public booking page.</p>
                </div>
                <div className="space-y-4">
                  {galleryPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {galleryPhotos.map(photo => (
                        <div key={photo.id} className="relative group">
                          <img src={photo.url} alt="Gallery" className="w-full h-28 object-cover rounded-xl border border-gray-200" />
                          <button
                            type="button"
                            onClick={() => handleGalleryDelete(photo.id)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <input type="file" accept="image/*" onChange={handleGalleryUpload} className="hidden" id="gallery_upload" />
                    <label
                      htmlFor="gallery_upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      {galleryUploading ? 'Uploading…' : 'Add Photo'}
                    </label>
                    <p className="text-xs text-gray-400 mt-1.5">Add multiple photos one at a time.</p>
                  </div>
                </div>
              </div>
            </>
          ),
        }}
      />

      {/* Business Profile */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Business Profile</CardTitle>
          <CardDescription>
            The business type controls what your customers are called throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business_name">Business Name</Label>
              <Input
                id="business_name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_phone">Owner WhatsApp Number</Label>
              <Input
                id="business_phone"
                type="tel"
                value={businessPhone}
                onChange={e => setBusinessPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                required
              />
              <p className="text-xs text-gray-400">
                Receives a WhatsApp notification when someone books from your public booking page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, City"
              />
              <p className="text-xs text-gray-400">Shown on your public booking page.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maps_url">Google Maps URL</Label>
              <Input
                id="maps_url"
                type="url"
                value={mapsUrl}
                onChange={e => setMapsUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
              />
              <p className="text-xs text-gray-400">Paste your Google Maps link. Shown as a directions button on your booking page.</p>
            </div>

            <div className="space-y-2">
              <Label>Business Photo</Label>
              {photoUrl && (
                <img src={photoUrl} alt="Business" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
              )}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo_upload"
                />
                <label
                  htmlFor="photo_upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {photoUploading ? 'Uploading…' : photoUrl ? 'Change Photo' : 'Upload Photo'}
                </label>
                {photoUrl && (
                  <button type="button" onClick={() => setPhotoUrl('')} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400">Square images work best. Shown on your public booking page.</p>
            </div>

            {modules?.appointments !== false && (
              <>
            <div className="space-y-2">
              <Label htmlFor="price_per_slot">Price per Slot (₹)</Label>
              <Input
                id="price_per_slot"
                type="number"
                min={0}
                step={0.01}
                value={pricePerSlot}
                onChange={e => setPricePerSlot(e.target.value)}
                placeholder="500"
                className="max-w-40"
              />
              <p className="text-xs text-gray-400">Shown on your public booking page. Leave blank to hide.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="services_offered">Services Offered</Label>
              <Input
                id="services_offered"
                value={servicesOffered}
                onChange={e => setServicesOffered(e.target.value)}
                placeholder="Haircut, Beard Trim, Facial, Head Massage"
              />
              <p className="text-xs text-gray-400">Comma-separated. Customers can select services when booking online.</p>
            </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Business Type</Label>
              <Select
                value={businessType}
                onValueChange={v => { if (v) setBusinessType(v) }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map(bt => (
                    <SelectItem key={bt.id} value={bt.id}>
                      {bt.label} — customers called &quot;{bt.customer_label}s&quot;
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Currently: your customers are called <span className="font-medium text-gray-600">"{currentLabel}s"</span> everywhere in the app
              </p>
            </div>

            {modules?.visits !== false && (
            <div className="space-y-2">
              <Label htmlFor="inactive_threshold_days">Inactivity Threshold (days)</Label>
              <Input
                id="inactive_threshold_days"
                type="number"
                min={1}
                value={inactiveThresholdDays}
                onChange={e => setInactiveThresholdDays(e.target.value)}
                required
                className="max-w-32"
              />
              <p className="text-xs text-gray-400">
                A {currentLabel.toLowerCase()} is marked inactive after this many days without a visit.
                {suggestedThreshold != null && ` Suggested for ${currentLabel.toLowerCase()}s: ${suggestedThreshold} days.`}
              </p>
            </div>
            )}

            {profileError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{profileError}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" className="text-white" style={{ backgroundColor: '#F15A24' }} disabled={profilePending}>
                {profilePending ? 'Saving…' : 'Save Profile'}
              </Button>
              {profileSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="h-4 w-4" /> Saved!
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Payment QR */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Payment QR Code</CardTitle>
          <CardDescription>Shown on your booking page, shop orders and invoices so customers can pay. Save profile after uploading.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentQrUrl && (
            <div className="flex items-start gap-4">
              <img src={paymentQrUrl} alt="Payment QR" className="w-32 h-32 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1" />
              <button type="button" onClick={() => setPaymentQrUrl('')} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                Remove
              </button>
            </div>
          )}
          <div>
            <input type="file" accept="image/*" onChange={handleQrUpload} className="hidden" id="qr_upload" />
            <label
              htmlFor="qr_upload"
              className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {qrUploading ? 'Uploading…' : paymentQrUrl ? 'Replace QR' : 'Upload QR Code'}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Staff Members */}
      <Card className="shadow-none border border-gray-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Staff Members</CardTitle>
          <CardDescription>
            Invite team members to access this business. They&apos;ll get a link to set their password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Invite form */}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="flex-1"
            />
            <Button type="submit" className="text-white gap-2" style={{ backgroundColor: '#F15A24' }} disabled={invitePending}>
              <UserPlus className="h-4 w-4" />
              {invitePending ? 'Sending…' : 'Invite'}
            </Button>
          </form>

          {inviteError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{inviteError}</p>
          )}
          {inviteSent && (
            <p className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle className="h-4 w-4" /> Invite sent! They&apos;ll receive an email with a link.
            </p>
          )}

          {staffError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{staffError}</p>
          )}

          {/* Staff list */}
          {staffList.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mt-2">
              {staffList.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {s.email}
                      {s.user_id === ownerUserId && <span className="ml-2 text-xs font-normal text-gray-500">Owner</span>}
                      {s.user_id === currentUserId && <span className="ml-2 text-xs font-normal text-gray-500">You</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      Added {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {s.user_id !== ownerUserId && s.user_id !== currentUserId && (
                    <button
                      onClick={() => handleRemoveStaff(s.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove staff member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {staffList.length === 0 && !staffError && (
            <p className="text-sm text-gray-400 text-center py-4">No staff members yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
