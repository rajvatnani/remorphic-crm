export type BusinessType = 'clinic' | 'salon' | 'gym' | 'other'

export interface Business {
  id: string
  name: string
  type: BusinessType
  owner_name: string
  phone: string
  created_at: string
  user_id: string
  inactive_threshold_days: number
  slug: string
}

export interface Customer {
  id: string
  business_id: string
  name: string
  phone: string
  gender: 'male' | 'female' | 'other' | null
  dob: string | null
  created_at: string
}

export interface Visit {
  id: string
  customer_id: string
  business_id: string
  service: string
  visited_at: string
  notes: string | null
  created_at: string
}

export interface AppointmentConfig {
  id: string
  business_id: string
  slot_duration: number
  max_per_slot: number
  start_time: string
  end_time: string
  open_days: number[]
}

export interface Appointment {
  id: string
  business_id: string
  customer_id: string
  service: string
  appointment_date: string
  slot_time: string
  status: 'pending' | 'scheduled' | 'confirmed' | 'cancelled'
  notes: string | null
  visit_id: string | null
  created_at: string
}

export interface AppointmentWithCustomer extends Appointment {
  customers: { name: string; phone: string }
}

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'

export interface Lead {
  id: string
  business_id: string
  name: string
  phone: string
  interest: string | null
  status: LeadStatus
  created_at: string
}

export type InteractionType = 'call' | 'meeting' | 'site_visit' | 'offer' | 'follow_up' | 'other'

export interface LeadInteraction {
  id: string
  lead_id: string
  business_id: string
  type: InteractionType
  notes: string | null
  occurred_at: string
  duration_minutes: number | null
  location: string | null
  amount: number | null
  follow_up_date: string | null
  created_at: string
}

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
]

export const INTERACTION_TYPES: { value: InteractionType; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'offer', label: 'Offer' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'other', label: 'Other' },
]

export const CUSTOMER_LABELS: Record<BusinessType, string> = {
  clinic: 'Patient',
  salon: 'Client',
  gym: 'Member',
  other: 'Customer',
}

export const INACTIVE_THRESHOLDS: Record<BusinessType, number> = {
  clinic: 90,
  salon: 45,
  gym: 30,
  other: 60,
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
