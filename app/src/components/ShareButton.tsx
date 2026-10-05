import { useEffect, useRef, useState } from 'react'
import { passScenarios, shareLink, type ShareScope } from '../editor/router'
import { useEditor } from '../editor/store'

function SharePopover({ onClose, initialScope, alignLeft }: { onClose: () => void; initialScope?: ShareScope; alignLeft: boolean }) {
  const presenting = useEditor((s) => s.presenting)
  const scenario = useEditor((s) => s.scenario)
  const deck = useEditor((s) => s.deck)
  const passSource = useEditor((s) => s.passSource)
  const playlist = useEditor((s) => s.playlist)
  const passCount = passScenarios().length
  const [full, setFull] = useState(presenting)
  const [scope, setScope] = useState<ShareScope>(initialScope ?? (presenting && passCount > 1 ? 'pass' : 'exercise'))
  const effective = passCount === 0 ? 'exercise' : scope
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    shareLink(full, effective).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [full, effective, scenario, deck, passSource, playlist])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [onClose])

  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <div className={`share-popover ${alignLeft ? 'left' : ''}`} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <p className="share-title">Dela</p>
      <div className="seg">
        <button className={effective === 'exercise' ? 'on' : ''} onClick={() => setScope('exercise')}>
          Övningen
        </button>
        <button className={effective === 'pass' ? 'on' : ''} disabled={passCount === 0} onClick={() => setScope('pass')} title={passCount ? undefined : 'Passet är tomt'}>
          Hela passet ({passCount})
        </button>
      </div>
      <input className="share-url" readOnly value={url || 'Skapar länk…'} onFocus={(e) => e.target.select()} aria-label="Länk att dela" />
      {url.length > 4000 && <p className="hint small">Länken är lång ({url.length.toLocaleString('sv-SE')} tecken). Den fungerar i webbläsare, men vissa chattar och e-postprogram kan korta av den.</p>}
      <label className="check">
        <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
        Öppna direkt i helskärm
      </label>
      <button className="present-btn" disabled={!url} onClick={copy}>
        {copied ? 'Kopierad ✓' : 'Kopiera länk'}
      </button>
    </div>
  )
}

export function ShareButton({ corner = false, inPanel = false, label = 'Dela', scope }: { corner?: boolean; inPanel?: boolean; label?: string; scope?: ShareScope }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="share">
      <button className={corner ? 'corner-btn' : inPanel ? 'share-panel-btn' : 'ghost'} onClick={() => setOpen(!open)} title="Dela en länk till det du tittar på">
        {corner ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
          </svg>
        ) : (
          label
        )}
      </button>
      {open && <SharePopover onClose={() => setOpen(false)} initialScope={scope} alignLeft={inPanel} />}
    </div>
  )
}
