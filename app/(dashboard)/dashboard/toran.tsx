// A marigold-and-mango-leaf toran hung across the top of the greeting, the
// way a shop door is dressed (from Remorphic Saathi).
export default function Toran() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 top-0 h-16 w-full" aria-hidden="true">
      <defs>
        <pattern id="toran" width="96" height="64" patternUnits="userSpaceOnUse">
          <path d="M0 3 Q48 34 96 3" fill="none" stroke="#FFB41F" strokeWidth="2" />
          <path d="M0 3 C-9 16 -8 30 0 44 C8 30 9 16 0 3z M96 3 C87 16 88 30 96 44 C104 30 105 16 96 3z" fill="#1FA364" />
          <path d="M0 8V38M96 8V38" stroke="#0E6B3F" strokeWidth="1.5" />
          <path d="M48 20 C42 30 42 40 48 50 C54 40 54 30 48 20z" fill="#1FA364" />
          <g fill="#FFB41F">
            <circle cx="16" cy="11.5" r="6" /><circle cx="32" cy="16.5" r="6" />
            <circle cx="64" cy="16.5" r="6" /><circle cx="80" cy="11.5" r="6" />
          </g>
          <circle cx="48" cy="18.5" r="8" fill="#FF6333" />
          <g fill="#E88A00">
            <circle cx="16" cy="11.5" r="2.4" /><circle cx="32" cy="16.5" r="2.4" />
            <circle cx="64" cy="16.5" r="2.4" /><circle cx="80" cy="11.5" r="2.4" />
          </g>
          <circle cx="48" cy="18.5" r="3.2" fill="#FFD27A" />
        </pattern>
      </defs>
      <rect width="100%" height="64" fill="url(#toran)" />
    </svg>
  )
}
