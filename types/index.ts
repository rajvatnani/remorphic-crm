export type BusinessType = 'clinic' | 'salon' | 'gym' | 'other'

export interface Business {
  id: string
  name: string
  type: BusinessType
  owner_name: string
  phone: string
  created_at: string
  user_id: string
}

export interface Customer {
  id: string
  business_id: string
  name: string
  phone: string
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
