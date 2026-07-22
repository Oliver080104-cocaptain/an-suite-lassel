/**
 * Minimaler ZIP-Writer — ersetzt den n8n-Compression-Node.
 *
 * Bewusst OHNE Dependency: die Anhänge sind praktisch immer JPG/PNG/PDF,
 * also bereits komprimiert. Deflate würde nichts sparen, kostet aber Zeit
 * und CPU in der Serverless-Function. Deshalb Methode 0 ("stored").
 * Das Ergebnis ist trotzdem ein regulärer ZIP-Container, den Windows-
 * Explorer, macOS Archive Utility und 7-Zip ohne Weiteres öffnen.
 *
 * Umgesetzt nach APPNOTE.TXT 6.3.x:
 *  - Local File Header + Daten je Eintrag
 *  - Central Directory
 *  - End Of Central Directory
 *  - General-Purpose-Bit 11 (0x0800) → Dateinamen sind UTF-8 (Umlaute!)
 *
 * NICHT unterstützt: ZIP64 (>4 GB bzw. >65535 Einträge), Verschlüsselung,
 * Ordnerstrukturen. Für E-Mail-Anhänge irrelevant — `createZip` wirft, wenn
 * eine dieser Grenzen gerissen würde, statt eine kaputte Datei zu liefern.
 */

const LOCAL_HEADER_SIG = 0x04034b50
const CENTRAL_HEADER_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

/** Bit 11: Dateiname ist UTF-8-kodiert (sonst würde CP437 angenommen). */
const FLAG_UTF8 = 0x0800
/** Methode 0 = stored/unkomprimiert. */
const METHOD_STORE = 0
/** Version 2.0 — Minimum für "stored" mit Verzeichnis. */
const VERSION = 20

/** Feste Zeitstempel (1980-01-01 00:00), damit gleiche Eingabe = gleiche Ausgabe. */
const DOS_TIME = 0
const DOS_DATE = 0x0021

const MAX_ENTRIES = 0xffff
const MAX_SIZE = 0xffffffff

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Dateiname im Archiv. Wird bei Kollision automatisch entdoppelt. */
  name: string
  data: Uint8Array
}

/**
 * Praktische Obergrenze für Dateinamen. Das ZIP-Format erlaubt 65535 Bytes,
 * aber Dateisysteme und Mail-Gateways nicht — und ein zu langer Name würde
 * beim Empfänger genau das auslösen, was wir vermeiden wollen.
 */
const MAX_NAME_BYTES = 200

const ENCODER = new TextEncoder()

/** Kürzt zeichenweise, damit kein Mehrbyte-Zeichen zerschnitten wird. */
function clampBytes(text: string, maxBytes: number): string {
  if (ENCODER.encode(text).length <= maxBytes) return text
  let out = text
  while (out.length > 0 && ENCODER.encode(out).length > maxBytes) {
    out = out.slice(0, -1)
  }
  return out
}

/** Kürzt einen Dateinamen und behält dabei die Endung. */
function clampFileName(name: string, maxBytes: number): string {
  if (ENCODER.encode(name).length <= maxBytes) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const stem = dot > 0 ? name.slice(0, dot) : name
  const room = maxBytes - ENCODER.encode(ext).length
  return room > 0 ? clampBytes(stem, room) + ext : clampBytes(name, maxBytes)
}

/**
 * Macht die Namen archivtauglich: keine Pfadanteile (`/`, `\`, `..`),
 * keine leeren Namen, Längenbegrenzung, und bei Dubletten
 * "foto.jpg" → "foto (2).jpg".
 *
 * Wichtig: die VERGEBENEN Namen werden vorgemerkt, nicht nur die Originale.
 * Sonst kollidiert der Ausweichname mit einer real angehängten Datei, die
 * schon "foto (2).jpg" heißt — Windows vergibt solche Namen beim Kopieren von
 * selbst. Das Archiv hätte dann zwei Einträge gleichen Namens und der
 * Empfänger bekäme beim Entpacken einen Fehler oder verlöre eine Datei.
 */
function uniqueNames(entries: ZipEntry[]): string[] {
  const used = new Set<string>()
  return entries.map((e, i) => {
    const flat = (e.name || '')
      .replace(/[\\/]/g, '_')
      .replace(/^\.+/, '')
      .trim() || `datei-${i + 1}`
    const base = clampFileName(flat, MAX_NAME_BYTES)

    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase())
      return base
    }

    // Platz für den Zähler freihalten, damit ihn die Kürzung nicht wegschneidet
    // — sonst käme bei jedem n derselbe Name heraus und die Suche liefe endlos.
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const room = MAX_NAME_BYTES - ENCODER.encode(ext).length - 12
    const stem = clampBytes(dot > 0 ? base.slice(0, dot) : base, Math.max(room, 1))

    // Spätestens beim (n = Anzahl Einträge + 1)-ten Versuch ist ein Name frei.
    for (let n = 2; n <= entries.length + 1; n++) {
      const candidate = `${stem} (${n})${ext}`
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase())
        return candidate
      }
    }
    const fallback = `datei-${i + 1}${ext}`
    used.add(fallback.toLowerCase())
    return fallback
  })
}

/**
 * Packt die Einträge in ein ZIP-Archiv (unkomprimiert) und gibt die
 * fertigen Bytes zurück.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length === 0) {
    throw new Error('createZip: keine Einträge übergeben')
  }
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`createZip: maximal ${MAX_ENTRIES} Dateien pro Archiv`)
  }

  const names = uniqueNames(entries)
  const encoded = names.map((n) => new TextEncoder().encode(n))

  let total = 0
  for (let i = 0; i < entries.length; i++) {
    // Local Header (30) + Name + Daten, dazu später Central Header (46) + Name
    total += 30 + encoded[i].length + entries[i].data.length
    total += 46 + encoded[i].length
  }
  total += 22 // EOCD
  if (total > MAX_SIZE) {
    throw new Error('createZip: Archiv überschreitet 4 GB (ZIP64 nicht unterstützt)')
  }

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let offset = 0

  const u16 = (v: number) => { view.setUint16(offset, v, true); offset += 2 }
  const u32 = (v: number) => { view.setUint32(offset, v >>> 0, true); offset += 4 }
  const raw = (v: Uint8Array) => { out.set(v, offset); offset += v.length }

  const localOffsets: number[] = []
  const crcs: number[] = []

  for (let i = 0; i < entries.length; i++) {
    const data = entries[i].data
    const crc = crc32(data)
    crcs.push(crc)
    localOffsets.push(offset)

    u32(LOCAL_HEADER_SIG)
    u16(VERSION)
    u16(FLAG_UTF8)
    u16(METHOD_STORE)
    u16(DOS_TIME)
    u16(DOS_DATE)
    u32(crc)
    u32(data.length) // compressed size = uncompressed size (stored)
    u32(data.length)
    u16(encoded[i].length)
    u16(0) // extra field length
    raw(encoded[i])
    raw(data)
  }

  const centralStart = offset

  for (let i = 0; i < entries.length; i++) {
    const data = entries[i].data
    u32(CENTRAL_HEADER_SIG)
    u16(VERSION) // version made by
    u16(VERSION) // version needed
    u16(FLAG_UTF8)
    u16(METHOD_STORE)
    u16(DOS_TIME)
    u16(DOS_DATE)
    u32(crcs[i])
    u32(data.length)
    u32(data.length)
    u16(encoded[i].length)
    u16(0) // extra field length
    u16(0) // comment length
    u16(0) // disk number start
    u16(0) // internal attributes
    u32(0) // external attributes
    u32(localOffsets[i])
    raw(encoded[i])
  }

  const centralSize = offset - centralStart

  u32(EOCD_SIG)
  u16(0) // disk number
  u16(0) // disk with central directory
  u16(entries.length)
  u16(entries.length)
  u32(centralSize)
  u32(centralStart)
  u16(0) // comment length

  return out
}
