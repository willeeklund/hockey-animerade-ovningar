import { memo } from 'react'
import { RINK, type Field } from '../model/rink'

const R = RINK
const RED = '#c8102e'
const BLUE = '#0b4ea2'

function outline() {
  const hx = R.halfLength
  const hy = R.halfWidth
  const r = R.cornerR
  return `M ${-hx + r} ${-hy} H ${hx - r} A ${r} ${r} 0 0 1 ${hx} ${-hy + r} V ${hy - r} A ${r} ${r} 0 0 1 ${hx - r} ${hy} H ${-hx + r} A ${r} ${r} 0 0 1 ${-hx} ${hy - r} V ${-hy + r} A ${r} ${r} 0 0 1 ${-hx + r} ${-hy} Z`
}

function goalLineSpan(x: number) {
  const ax = Math.abs(x)
  const cornerStart = R.halfLength - R.cornerR
  if (ax <= cornerStart) return R.halfWidth
  const dx = ax - cornerStart
  return R.halfWidth - R.cornerR + Math.sqrt(R.cornerR * R.cornerR - dx * dx)
}

function FaceoffCircle({ x, y }: { x: number; y: number }) {
  const r = R.faceoffR
  const hash = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ sx, sy })))
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="none" stroke={RED} strokeWidth={0.05} />
      <circle cx={x} cy={y} r={0.3} fill={RED} />
      {hash.map(({ sx, sy }) => (
        <line key={`${sx}${sy}`} x1={x + sx * 0.9} x2={x + sx * 0.9} y1={y + sy * r} y2={y + sy * (r + 0.6)} stroke={RED} strokeWidth={0.05} />
      ))}
      {hash.map(({ sx, sy }) => (
        <path
          key={`l${sx}${sy}`}
          d={`M ${x + sx * 0.3} ${y + sy * 0.45} H ${x + sx * 1.2} M ${x + sx * 0.3} ${y + sy * 0.45} V ${y + sy * 1.3}`}
          fill="none"
          stroke={RED}
          strokeWidth={0.05}
        />
      ))}
    </g>
  )
}

function FullRink() {
  return (
    <g>
      <clipPath id="rink-clip">
        <path d={outline()} />
      </clipPath>
      <path d={outline()} fill="var(--ice)" />
      <g clipPath="url(#rink-clip)">
        {[-1, 1].map((s) => {
          const x = s * R.goalLineX
          const span = goalLineSpan(x)
          return <line key={`gl${s}`} x1={x} x2={x} y1={-span} y2={span} stroke={RED} strokeWidth={0.05} />
        })}
        {[-1, 1].map((s) => (
          <rect key={`bl${s}`} x={s * R.blueLineX - 0.15} y={-R.halfWidth} width={0.3} height={R.halfWidth * 2} fill={BLUE} />
        ))}
        <rect x={-0.15} y={-R.halfWidth} width={0.3} height={R.halfWidth * 2} fill={RED} />
        <circle cx={0} cy={0} r={R.faceoffR} fill="none" stroke={BLUE} strokeWidth={0.05} />
        <circle cx={0} cy={0} r={0.15} fill={BLUE} />
        {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <FaceoffCircle key={`fc${sx}${sy}`} x={sx * R.endDotX} y={sy * R.endDotY} />))}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => <circle key={`nd${sx}${sy}`} cx={sx * R.neutralDotX} cy={sy * R.neutralDotY} r={0.3} fill={RED} />),
        )}
      </g>
      <path d={outline()} fill="none" stroke="#1f2937" strokeWidth={0.3} />
    </g>
  )
}

function zoneOutline(f: Field) {
  const hx = f.halfLength
  const hy = f.halfWidth
  const r = f.cornerBottom
  return `M ${-hx} ${-hy} H ${hx} V ${hy - r} A ${r} ${r} 0 0 1 ${hx - r} ${hy} H ${-hx + r} A ${r} ${r} 0 0 1 ${-hx} ${hy - r} Z`
}

function zoneLineSpan(f: Field, y: number) {
  const r = f.cornerBottom
  const dy = y - (f.halfWidth - r)
  if (dy <= 0) return f.halfLength
  return f.halfLength - r + Math.sqrt(r * r - dy * dy)
}

function ZoneRink({ field }: { field: Field }) {
  const hy = field.halfWidth
  const goalLineY = hy - R.endToGoalLine
  const dotY = hy - R.endToDot
  const span = zoneLineSpan(field, goalLineY)
  const c = R.creaseR
  return (
    <g>
      <clipPath id="zone-clip">
        <path d={zoneOutline(field)} />
      </clipPath>
      <path d={zoneOutline(field)} fill="var(--ice)" />
      <g clipPath="url(#zone-clip)">
        <line x1={-span} x2={span} y1={goalLineY} y2={goalLineY} stroke={RED} strokeWidth={0.05} opacity={0.5} />
        <path d={`M ${-c} ${goalLineY} A ${c} ${c} 0 0 1 ${c} ${goalLineY} Z`} fill="#bfe3f7" stroke={RED} strokeWidth={0.05} opacity={0.35} />
        {[-1, 1].map((s) => (
          <FaceoffCircle key={`zf${s}`} x={s * R.endDotY} y={dotY} />
        ))}
      </g>
      <path d={zoneOutline(field)} fill="none" stroke="#1f2937" strokeWidth={0.3} />
    </g>
  )
}

function RinkLinesImpl({ field }: { field: Field }) {
  return field.layout === 'zone' ? <ZoneRink field={field} /> : <FullRink />
}

export const RinkLines = memo(RinkLinesImpl)
