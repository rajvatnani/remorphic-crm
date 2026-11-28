import Link from 'next/link'
import type { enabledModules } from '@/lib/modules'
import type { ReportItem } from '@/lib/reports'
import ShareLinks from './share-links'
import Toran from './toran'
import { ShoppingBag, Hourglass, Camera, Plus, type LucideIcon } from 'lucide-react'

export interface Stat {
  title: string
  value: string | number
  icon: LucideIcon
  color: string
  bg: string
  note?: string
  href?: string
}

// Festive pastel tiles, one tone per position (from Remorphic Saathi)
const TONES = [
  'bg-fest-ranisoft text-fest-ranidark',
  'bg-fest-marigoldsoft text-[#6b4300]',
  'bg-fest-leafsoft text-[#0a5230]',
  'bg-fest-skysoft text-[#0f4470]',
]

function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(({ title, value, icon: Icon, note, href }, i) => {
        const tile = (
          <div className={`flex h-full flex-col gap-3 rounded-3xl p-4 transition ${TONES[i % TONES.length]} ${href ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70">
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-friendly text-3xl font-bold leading-none tabular-nums">{value}</span>
              <span className="mt-1 block text-sm font-bold">{title}</span>
              {note && <span className="mt-0.5 block text-xs opacity-75">{note}</span>}
            </span>
          </div>
        )
        return href ? <Link key={title} href={href} className="rounded-3xl">{tile}</Link> : <div key={title}>{tile}</div>
      })}
    </div>
  )
}

function SectionTitle({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between mt-8 mb-3 first:mt-0">
      <h2 className="font-friendly text-2xl font-bold text-fest-ink">{children}</h2>
      {href && <Link href={href} className="text-sm font-bold text-fest-rani underline">{linkLabel}</Link>}
    </div>
  )
}

export type DashboardViewProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  business: any
  on: ReturnType<typeof enabledModules>
  label: string
  orderStats: Stat[]
  apptStats: Stat[]
  customerStats: Stat[]
  leadStats: Stat[]
  low: ReportItem[]
  shareLinks: { label: string; path: string }[]
  greeting: string
  todo: string[]
  firstName: string
  newOrders: number
  apptsPending: number | null
}

/** The dashboard itself, from figures already worked out */
export default function DashboardView({ business, on, label, orderStats, apptStats, customerStats, leadStats, low, shareLinks, greeting, todo, firstName, newOrders, apptsPending }: DashboardViewProps) {
  return (
    <div className="min-h-full bg-fest-cream text-fest-ink">
    <div className="p-4 sm:p-6 max-w-6xl">
      <section className="relative overflow-hidden rounded-[2rem] bg-fest-plum px-5 pb-6 pt-20 text-white sm:px-8 sm:pb-8 mb-6">
        <Toran />
        <p className="text-sm font-bold text-fest-marigold">{greeting}</p>
        <h1 className="mt-0.5 font-friendly text-4xl font-extrabold sm:text-5xl">Namaste, {firstName}!</h1>
        <p className="mt-1 text-lg text-white/85">
          {todo.length ? `${todo.join(' · ')} waiting for you.` : 'All caught up. Nothing waiting.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {on.orders && newOrders > 0 && (
            <Link href="/orders" className="inline-flex items-center gap-2 rounded-full bg-fest-marigold px-5 py-3 font-bold text-fest-plumdeep hover:bg-[#ffc44d]">
              <ShoppingBag className="h-5 w-5" /> See new orders
            </Link>
          )}
          {on.appointments && (apptsPending ?? 0) > 0 && (
            <Link href="/appointments" className="inline-flex items-center gap-2 rounded-full bg-fest-marigold px-5 py-3 font-bold text-fest-plumdeep hover:bg-[#ffc44d]">
              <Hourglass className="h-5 w-5" /> Approve bookings
            </Link>
          )}
          {on.orders && (
            <Link
              href="/items"
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-bold ${todo.length ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-fest-marigold text-fest-plumdeep hover:bg-[#ffc44d]'}`}
            >
              <Camera className="h-5 w-5" /> Add an item
            </Link>
          )}
          {on.orders && (
            <Link href="/orders" className="hidden md:inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 font-bold text-white hover:bg-white/25">
              <Plus className="h-5 w-5" /> Note an order
            </Link>
          )}
          {!on.orders && (
            <Link href="/customers" className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 font-bold text-white hover:bg-white/25">
              <Plus className="h-5 w-5" /> Add a {label.toLowerCase()}
            </Link>
          )}
        </div>
      </section>

      {on.orders && (
        <>
          <SectionTitle href="/orders" linkLabel="All orders →">Orders</SectionTitle>
          <StatGrid stats={orderStats} />

          <div className="mt-4 rounded-3xl border border-fest-line bg-white p-5" style={{ boxShadow: '0 2px 0 #F1E0C2' }}>
            <h3 className="font-friendly text-lg font-bold mb-3">Share your links</h3>
            {shareLinks.length ? (
              <ShareLinks links={shareLinks} businessName={business.name} />
            ) : (
              <p className="text-sm text-fest-ink/60">
                Turn on the shop link in <Link href="/settings" className="font-bold text-fest-rani underline">Settings → Features</Link> to let customers order themselves.
              </p>
            )}
          </div>

          <SectionTitle href="/items" linkLabel="All items">Running low</SectionTitle>
          {low.length === 0 ? (
            <p className="rounded-3xl border border-fest-line bg-white p-5 text-sm">Stock looks good. Nothing is running low.</p>
          ) : (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {low.slice(0, 12).map(i => {
                const photo = (i as ReportItem & { photos?: string[]; photo_url?: string | null }).photos?.[0]
                  ?? (i as ReportItem & { photo_url?: string | null }).photo_url
                const out = (i.stock ?? 0) <= 0
                return (
                  <li key={i.id} className="w-36 shrink-0">
                    <Link href="/items" className="block overflow-hidden rounded-3xl border border-fest-line bg-white" style={{ boxShadow: '0 2px 0 #F1E0C2' }}>
                      <span className="relative block aspect-square bg-fest-marigoldsoft">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                        <span className={`absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs font-bold ${out ? 'bg-fest-rani text-white' : 'bg-fest-marigold text-fest-plumdeep'}`}>
                          {out ? 'Finished' : `${i.stock} left`}
                        </span>
                      </span>
                      <span className="block p-3">
                        {i.code && <span className="block text-xs font-bold text-fest-plum">{i.code}</span>}
                        <span className="line-clamp-2 font-friendly font-bold leading-tight">{i.name}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {on.appointments && (
        <>
          <SectionTitle href="/appointments" linkLabel="Appointments →">Appointments</SectionTitle>
          <StatGrid stats={apptStats} />
          {!on.orders && shareLinks.length > 0 && (
            <div className="mt-4 max-w-xl rounded-3xl border border-fest-line bg-white p-5" style={{ boxShadow: '0 2px 0 #F1E0C2' }}>
              <h3 className="font-friendly text-lg font-bold mb-3">Share your booking link</h3>
              <ShareLinks links={shareLinks} businessName={business.name} />
            </div>
          )}
        </>
      )}

      <SectionTitle>{label}s</SectionTitle>
      <StatGrid stats={customerStats} />

      {on.leads && (
        <>
          <SectionTitle>Leads</SectionTitle>
          <StatGrid stats={leadStats} />
        </>
      )}
    </div>
    </div>
  )
}
