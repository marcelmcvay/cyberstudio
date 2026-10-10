/** Cy's optic: chrome shell-ring segments, an amber slit-pupil lens and one
 * phosphor scan line (the only phosphor in the UI). Shared by Workspace, Chats
 * and the voice control. `tone="black"` is the quieter Chats variant. */
const TICKS = Array.from({ length: 12 }, (_, i) => i)

export default function MakLogo({ size = 64, animated = true, tone = 'pink' }: { size?: number; animated?: boolean; tone?: 'pink' | 'black' }) {
  return (
    <svg className={`mak-logo cy-eye${animated ? ' is-animated' : ''}${tone === 'black' ? ' is-quiet' : ''}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <g className="cy-eye-ring" fill="none" strokeWidth="3.2" strokeLinecap="butt">
        <path d="M50 8 A42 42 0 0 1 89 36" />
        <path d="M92 50 A42 42 0 0 1 64 90" opacity=".55" />
        <path d="M36 90 A42 42 0 0 1 8 52" />
        <path d="M11 36 A42 42 0 0 1 40 9" opacity=".55" />
      </g>
      {size >= 32 && <g className="cy-eye-ring" strokeWidth="1.5" opacity=".7">
        {TICKS.map(i => <line key={i} x1="50" y1="14" x2="50" y2={i % 3 ? 17 : 20} transform={`rotate(${i * 30} 50 50)`} />)}
      </g>}
      <circle className="cy-eye-ring" cx="50" cy="50" r="26" fill="none" strokeWidth="1.5" opacity=".6" />
      <g className="cy-eye-iris">
        <circle cx="50" cy="50" r="17" className="cy-eye-lens" />
        <circle cx="50" cy="50" r="17" fill="none" className="cy-eye-pupil-stroke" strokeWidth="2.2" />
        <ellipse cx="50" cy="50" rx="4.6" ry="11" className="cy-eye-pupil" />
      </g>
      <clipPath id="cy-eye-clip"><circle cx="50" cy="50" r="25" /></clipPath>
      <g clipPath="url(#cy-eye-clip)"><rect className="cy-eye-scan" x="20" y="49.2" width="60" height="1.6" /></g>
    </svg>
  )
}
