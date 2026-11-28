'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

/** Full-screen photo pop-out: arrows, swipe, thumbnails; Esc or tapping the dark area closes it. */
export default function PhotoViewer({
  photos,
  start = 0,
  title,
  onClose,
}: {
  photos: string[]
  start?: number
  title: string
  onClose: () => void
}) {
  const [idx, setIdx] = useState(start)
  const touchX = useRef<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const many = photos.length > 1
  const go = (d: number) => setIdx(i => (i + d + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + photos.length) % photos.length)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, photos.length])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-store-night/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${title}`}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-store-cream" onClick={e => e.stopPropagation()}>
        <span className="truncate font-display text-xl font-semibold">{title}</span>
        <button ref={closeRef} onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center px-4"
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchX.current === null || !many) return
          const dx = e.changedTouches[0].clientX - touchX.current
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          touchX.current = null
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[idx]}
          alt={`${title}, photo ${idx + 1}`}
          className="max-h-[75vh] max-w-full rounded-2xl object-contain"
          onClick={e => e.stopPropagation()}
        />
        {many && (
          <>
            <button onClick={e => { e.stopPropagation(); go(-1) }} className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Previous photo">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={e => { e.stopPropagation(); go(1) }} className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Next photo">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {many && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 py-4" onClick={e => e.stopPropagation()}>
          {photos.map((url, i) => (
            <button
              key={url}
              onClick={() => setIdx(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 ${i === idx ? 'ring-store-gold' : 'ring-transparent opacity-60 hover:opacity-100'}`}
              aria-label={`Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
