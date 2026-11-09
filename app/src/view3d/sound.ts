let ctx: AudioContext | null = null
let muted = false

export const setMuted = (m: boolean) => {
  muted = m
}

function audio() {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noise(a: AudioContext, seconds: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  return src
}

function burst(a: AudioContext, seconds: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0) {
  const src = noise(a, seconds)
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = a.createGain()
  const t = a.currentTime + delay
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

export function playShot() {
  const a = audio()
  if (!a) return
  burst(a, 0.12, 1800, 1.2, 0.6)
  burst(a, 0.05, 400, 1, 0.5, 'lowpass')
}

export function playSave() {
  const a = audio()
  if (!a) return
  burst(a, 0.18, 220, 1.5, 0.9, 'lowpass')
  crowd(a, 1.4, 0.18)
}

export function playPost() {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.frequency.value = 1350
  g.gain.setValueAtTime(0.25, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.6)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + 0.6)
}

function crowd(a: AudioContext, seconds: number, peak: number) {
  const src = noise(a, seconds)
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 900
  f.Q.value = 0.6
  const g = a.createGain()
  const t = a.currentTime
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.25)
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

export function playGoal() {
  const a = audio()
  if (!a) return
  const t = a.currentTime + 0.05
  const g = a.createGain()
  g.gain.setValueAtTime(0.001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.08)
  g.gain.setValueAtTime(0.16, t + 1.6)
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.2)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  lp.connect(g).connect(a.destination)
  for (const f of [146.8, 185, 220, 293.7]) {
    const o = a.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f
    o.connect(lp)
    o.start(t)
    o.stop(t + 2.3)
  }
  crowd(a, 3, 0.35)
}
