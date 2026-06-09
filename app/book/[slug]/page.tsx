import { notFound } from 'next/navigation'
import { getPublicBookingData } from '@/app/actions/online-booking'
import BookingForm from './booking-form'

export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getPublicBookingData(slug)
  if (!data) return notFound()
  return <BookingForm business={data.business} config={data.config} />
}
