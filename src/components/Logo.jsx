import { useId } from 'react'

// Pointy-top hexagon, center (50,50), circumradius 41
// Vertices: top, upper-right, lower-right, bottom, lower-left, upper-left
const HEX = '50,9 85.5,29.5 85.5,70.5 50,91 14.5,70.5 14.5,29.5'

// Two straight diagonals — both pass through centre (50,50)
// Teal:  (20,34) → (80,66)   Gold:  (20,66) → (80,34)

export default function Logo({ size = 48, dark = true }) {
  const uid = useId().replace(/:/g, '')

  const gold    = dark ? '#C9A84C' : '#96711F'
  const teal    = dark ? '#2DD4BF' : '#0D7A70'
  const hexFill = dark ? 'rgba(201,168,76,0.07)' : 'rgba(150,113,31,0.05)'
  const dotFill = dark ? '#EDE9E3' : '#FDFCFA'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`hc-${uid}`}>
          <polygon points={HEX} />
        </clipPath>
      </defs>

      {/* Hexagon fill */}
      <polygon points={HEX} fill={hexFill} />

      {/* Teal line — upper-left to lower-right */}
      <line
        x1="20" y1="34" x2="80" y2="66"
        stroke={teal}
        strokeWidth="9.5"
        strokeLinecap="round"
        clipPath={`url(#hc-${uid})`}
      />

      {/* Gold line — lower-left to upper-right */}
      <line
        x1="20" y1="66" x2="80" y2="34"
        stroke={gold}
        strokeWidth="9.5"
        strokeLinecap="round"
        clipPath={`url(#hc-${uid})`}
      />

      {/* Hexagon border */}
      <polygon
        points={HEX}
        fill="none"
        stroke={gold}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Center dot — sits above crossing point */}
      <circle cx="50" cy="50" r="5.5" fill={dotFill} />
    </svg>
  )
}
