import type { TrainingPass } from '../model/types'

function toBase64Url(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodePass(pass: TrainingPass): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pass, (_, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodePass(data: string): Promise<TrainingPass> {
  const json = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'))
  const pass = JSON.parse(new TextDecoder().decode(json)) as TrainingPass
  if (!Array.isArray(pass.scenarios) || pass.scenarios.some((s) => !Array.isArray(s.players))) throw new Error('Ogiltig länk')
  return pass
}
