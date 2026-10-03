import { useMemo } from 'react'

/** Norway, simplified: [longitude, latitude] around the coast and borders. */
const NORWAY: [number, number][] = [
  [11.25, 59.08], [10.95, 59.25], [10.75, 59.62], [10.75, 59.91], [10.45, 59.6], [10.4, 59.2], [10.0, 59.03],
  [9.55, 58.92], [9.2, 58.72], [8.78, 58.45], [8.25, 58.2], [7.95, 58.08], [7.4, 58.0], [7.05, 57.98], [6.6, 58.1],
  [6.1, 58.35], [5.75, 58.6], [5.6, 58.9], [5.85, 59.1], [5.4, 59.35], [5.25, 59.55], [5.5, 59.9], [5.15, 60.15],
  [5.3, 60.39], [5.0, 60.7], [4.95, 61.05], [5.05, 61.45], [5.0, 61.65], [5.25, 62.0], [5.15, 62.2], [5.7, 62.35],
  [6.15, 62.47], [6.8, 62.7], [7.3, 62.85], [7.75, 63.1], [8.4, 63.4], [9.3, 63.65], [9.85, 63.9], [10.4, 64.25],
  [10.9, 64.6], [11.3, 64.9], [12.0, 65.25], [12.25, 65.6], [12.6, 66.1], [13.2, 66.6], [13.8, 67.05], [14.4, 67.28],
  [15.0, 67.6], [15.5, 68.0], [16.2, 68.3], [16.4, 68.6], [17.2, 68.9], [18.0, 69.3], [18.95, 69.65], [19.9, 69.95],
  [21.0, 70.1], [22.2, 70.3], [23.7, 70.66], [24.8, 70.95], [25.8, 71.15], [26.9, 70.95], [27.9, 71.05], [28.8, 70.85],
  [29.8, 70.6], [31.0, 70.37], [30.1, 69.95], [30.3, 69.6], [29.1, 69.0], [28.2, 69.75], [27.7, 70.05], [26.5, 69.9],
  [25.8, 69.4], [24.9, 68.6], [23.4, 68.7], [21.6, 69.25], [20.6, 69.05], [19.6, 68.45], [18.3, 68.5], [17.9, 68.0],
  [16.8, 67.7], [16.3, 67.0], [15.6, 66.4], [14.6, 66.1], [14.0, 65.2], [13.7, 64.6], [14.0, 64.2], [13.1, 63.6],
  [12.15, 63.0], [12.15, 62.4], [12.3, 61.7], [12.8, 61.2], [12.4, 60.6], [12.0, 60.15], [11.8, 59.85], [11.5, 59.4],
]
const LOFOTEN: [number, number][] = [[12.9, 67.85], [13.6, 68.0], [14.6, 68.15], [15.7, 68.45], [15.2, 68.55], [14.2, 68.3], [13.3, 68.1]]

export const STOPS: { name: string; at: [number, number] }[] = [
  { name: 'Oslo', at: [10.75, 59.91] },
  { name: 'Bergen', at: [5.32, 60.39] },
  { name: 'Flåm', at: [7.11, 60.86] },
  { name: 'Geiranger', at: [7.21, 62.1] },
  { name: 'Ålesund', at: [6.15, 62.47] },
  { name: 'Trondheim', at: [10.4, 63.43] },
  { name: 'Lofoten', at: [14.57, 68.23] },
]

const project = ([lon, lat]: [number, number]) => [(lon - 4) * 0.42, 71.4 - lat] as const

/** Catmull–Rom through the stops, sampled densely, so the route can be drawn progressively. */
function routePoints() {
  const p = STOPS.map((s) => project(s.at))
  const out: (readonly [number, number])[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)]
    for (let s = 0; s < 24; s++) {
      const t = s / 24, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(p[p.length - 1])
  return out
}

/** A calm cartographic surface: the country, a faint graticule, and the route PEPO is drawing. */
export function MapSurface({ progress = 0 }: { progress?: number }) {
  const land = useMemo(() => 'M' + NORWAY.map((c) => project(c).map((v) => v.toFixed(3)).join(',')).join(' L') + ' Z', [])
  const islands = useMemo(() => 'M' + LOFOTEN.map((c) => project(c).map((v) => v.toFixed(3)).join(',')).join(' L') + ' Z', [])
  const route = useMemo(() => routePoints(), [])
  const routeD = 'M' + route.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' L')
  const segment = 1 / (STOPS.length - 1)

  return (
    <div className="map-surface">
      <svg viewBox="-0.6 2.1 11 11.9" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Route across Norway">
        <defs>
          <linearGradient id="route-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#40E6FF" />
            <stop offset="1" stopColor="#8B5CFF" />
          </linearGradient>
          <radialGradient id="land-grad" cx="0.35" cy="0.75" r="0.9">
            <stop offset="0" stopColor="#14264C" />
            <stop offset="1" stopColor="#0B1834" />
          </radialGradient>
        </defs>
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`lat${i}`} x1="-1" x2="12.6" y1={i * 2 - 0.4} y2={i * 2 - 0.4} className="map-grid" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`lon${i}`} y1="-0.6" y2="14" x1={i * 2} x2={i * 2} className="map-grid" />
        ))}
        <path d={land} fill="url(#land-grad)" className="map-coast" />
        <path d={islands} fill="url(#land-grad)" className="map-coast" />
        <path d={routeD} className="map-route-shadow" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
        <path d={routeD} className="map-route" stroke="url(#route-grad)" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
        {STOPS.map((s, i) => {
          const [x, y] = project(s.at)
          const reached = progress >= i * segment - 0.001
          const right = s.name === 'Oslo' || s.name === 'Trondheim' || s.name === 'Lofoten'
          return (
            <g key={s.name} className={`map-stop ${reached ? 'is-reached' : ''}`}>
              <circle cx={x} cy={y} r="0.32" className="map-stop-halo" />
              <circle cx={x} cy={y} r="0.11" className="map-stop-dot" />
              <text x={right ? x + 0.32 : x - 0.32} y={y + 0.13} textAnchor={right ? 'start' : 'end'}>
                {s.name}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="map-legend">
        <span>7 days</span>
        <span>≈ 1,900 km</span>
        <span>train · ferry · road</span>
      </div>
    </div>
  )
}
