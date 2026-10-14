const SCRIPT = 'script[type="module"][src]'

function scriptSrc(doc: Document): string | null {
  return doc.querySelector(SCRIPT)?.getAttribute('src') ?? null
}

async function hasNewVersion(current: string): Promise<boolean> {
  try {
    const res = await fetch(location.pathname, { cache: 'no-store' })
    if (!res.ok) return false
    const latest = scriptSrc(new DOMParser().parseFromString(await res.text(), 'text/html'))
    return latest !== null && latest !== current
  } catch {
    return false
  }
}

function showReloadButton() {
  if (document.getElementById('update-available')) return
  const btn = document.createElement('button')
  btn.id = 'update-available'
  btn.textContent = 'Ny version finns – tryck för att ladda om'
  btn.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(16px + env(safe-area-inset-bottom))',
    'transform:translateX(-50%)',
    'z-index:10000',
    'padding:10px 16px',
    'border:0',
    'border-radius:999px',
    'background:#0f2742',
    'color:#fff',
    'font:inherit',
    'font-size:14px',
    'box-shadow:0 4px 16px rgba(0,0,0,.3)',
    'cursor:pointer',
  ].join(';')
  btn.onclick = () => location.reload()
  document.body.appendChild(btn)
}

export function startUpdateCheck() {
  if (!import.meta.env.PROD) return
  const current = scriptSrc(document)
  if (!current) return
  const check = async () => {
    if (await hasNewVersion(current)) showReloadButton()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
  void check()
}
