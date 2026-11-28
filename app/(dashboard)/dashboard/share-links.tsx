'use client'

import { useState } from 'react'
import { Copy, Check, MessageCircle, ExternalLink } from 'lucide-react'

/** Copy, open or share the business's public links on WhatsApp */
export default function ShareLinks({ links, businessName }: { links: { label: string; path: string }[]; businessName: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  if (!links.length) return null
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="space-y-3">
      {links.map(l => {
        const url = `${origin}${l.path}`
        const wa = `https://wa.me/?text=${encodeURIComponent(`${l.label === 'Shop' ? `Browse and order from ${businessName}` : `Book with ${businessName}`}: ${url}`)}`
        return (
          <div key={l.path} className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500">{l.label}</p>
            <code className="block truncate text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">{url || l.path}</code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(url); setCopied(l.path); setTimeout(() => setCopied(c => (c === l.path ? null : c)), 2000) }}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === l.path ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === l.path ? 'Copied' : 'Copy'}
              </button>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-green-200 text-xs font-medium text-green-700 hover:bg-green-50">
                <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
              </a>
              <a href={l.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
