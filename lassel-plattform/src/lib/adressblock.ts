export function isHausinhabungAktiv(hausinhabung?: string | null): boolean {
  if (!hausinhabung) return false
  const trimmed = hausinhabung.trim()
  if (trimmed === '') return false
  if (trimmed.toLowerCase() === 'nicht vorhanden') return false
  return true
}

export type AdressblockInput = {
  hausinhabung?: string | null
  primaryName?: string | null
  hausverwaltungName?: string | null
  strasse?: string | null
  plz?: string | null
  ort?: string | null
  land?: string | null
  uid?: string | null
}

export type Adressblock = {
  name: string
  zeile2: string
  strasse: string
  plz: string
  ort: string
  land: string
  uid: string
  hausinhabungAktiv: boolean
}

export function buildAdressblock(input: AdressblockInput): Adressblock {
  const aktiv = isHausinhabungAktiv(input.hausinhabung)
  const land = (input.land && input.land.trim()) || 'Österreich'
  const primary = (input.primaryName || '').trim()
  const hvName = (input.hausverwaltungName || input.primaryName || '').trim()

  if (aktiv) {
    return {
      name: input.hausinhabung!.trim(),
      zeile2: hvName ? `p/A ${hvName}` : '',
      strasse: input.strasse || '',
      plz: input.plz || '',
      ort: input.ort || '',
      land,
      uid: '',
      hausinhabungAktiv: true,
    }
  }

  return {
    name: primary,
    zeile2: '',
    strasse: input.strasse || '',
    plz: input.plz || '',
    ort: input.ort || '',
    land,
    uid: input.uid || '',
    hausinhabungAktiv: false,
  }
}
