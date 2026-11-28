export interface BusinessTypeRecord {
  id: string
  label: string
  customer_label: string
  inactive_threshold_days: number
  emoji: string
}

export interface Business {
  id: string
  name: string
  type: string
  owner_name: string
  phone: string
  created_at: string
  user_id: string
  inactive_threshold_days: number
  slug: string
  customer_label: string
  leads_enabled?: boolean
  appointments_enabled?: boolean
  visits_enabled?: boolean
  orders_enabled?: boolean
  shop_enabled?: boolean
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
  payment_screenshot: string | null
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

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface Item {
  id: string
  business_id: string
  name: string
  code: string | null
  description: string | null
  price_paise: number
  cost_paise: number | null
  stock: number | null
  active: boolean
  photo_url?: string | null
  created_at: string
}

export type OrderStatus = 'new' | 'confirmed' | 'ready' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'partial' | 'paid'

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export interface OrderLine {
  id: string
  item_id: string | null
  name: string
  price_paise: number
  cost_paise: number | null
  qty: number
}

export interface Order {
  id: string
  order_no: number
  customer_id: string
  status: OrderStatus
  payment_status: PaymentStatus
  paid_paise: number
  delivery_paise: number
  discount_paise: number
  notes: string | null
  due_date: string | null
  created_at: string
  source?: 'staff' | 'shop'
  address?: string | null
  customers: { id: string; name: string; phone: string } | null
  order_items: OrderLine[]
}

export function orderTotal(o: Pick<Order, 'delivery_paise' | 'discount_paise' | 'order_items'>): number {
  const lines = o.order_items.reduce((sum, l) => sum + l.price_paise * l.qty, 0)
  return Math.max(lines + o.delivery_paise - o.discount_paise, 0)
}
