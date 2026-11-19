/**
 * UUID v7 (RFC 9562) : 48 bits d'horodatage Unix en millisecondes, puis 74 bits aléatoires.
 * Les identifiants se trient donc par date de création, comme ceux du cœur Rust
 * (`Uuid::now_v7`). `crypto.randomUUID()` ne produit que des v4.
 */
export function uuidv7(
  now: number = Date.now(),
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = new Uint8Array(16)
  random(bytes)
  const ms = Math.max(0, Math.floor(now))
  // 48 bits big-endian (au-delà de 2^32 : division, les opérateurs binaires sont sur 32 bits).
  const high = Math.floor(ms / 2 ** 32)
  bytes[0] = (high >>> 8) & 0xff
  bytes[1] = high & 0xff
  bytes[2] = (ms >>> 24) & 0xff
  bytes[3] = (ms >>> 16) & 0xff
  bytes[4] = (ms >>> 8) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = 0x70 | (bytes[6]! & 0x0f) // version 7
  bytes[8] = 0x80 | (bytes[8]! & 0x3f) // variante RFC 9562
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
