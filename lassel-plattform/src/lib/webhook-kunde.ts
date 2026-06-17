/**
 * Leitet den Kundennamen aus dem Zoho-Payload ab.
 *
 * Hintergrund: Zoho schickt bei Hausverwaltungs-Objekten häufig KEIN kunde.name —
 * der Account ist dann nur die Objekt-Adresse (Gasse). Statt den Webhook mit
 * HTTP 400 zu blockieren ("kunde.name ist erforderlich") leiten wir den Namen
 * aus den nächstbesten Feldern ab, damit der n8n-Flow durchläuft.
 *
 * WICHTIG: kunde.ansprechpartner ist NICHT der Kunde, sondern die/der interne
 * Lassel-MitarbeiterIn die das Ticket erstellt hat (= ticketErstelltVon in Zoho).
 * Dieses Feld darf NIEMALS als Kundenname verwendet werden.
 *
 * Reihenfolge (fachlich):
 *  1. kunde.name            — expliziter Rechnungsempfänger (gewinnt immer)
 *  2. hausverwaltungName    — HV-Fall: die HV ist der Rechnungsempfänger
 *  3. accountName           — Zoho-Account = Entität des Tickets
 *                             (Privatkunden-Name ODER Objekt/Gasse)
 *  4. kundeGasseName        — Objekt-Gasse
 *  5. objektAdresse.gasse   — Objekt-Gasse (letzter Fallback)
 *  → null wenn alles leer (Aufrufer entscheidet über 400)
 */
export function resolveKundeName(body: any): string | null {
  const kunde = body?.kunde || {}
  const zoho = body?.meta?.zoho || {}

  const candidates = [
    kunde.name,
    zoho.hausverwaltungName,
    zoho.accountName,
    zoho.kundeGasseName,
    kunde.objektAdresse?.gasse,
  ]

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

/** True, wenn der Name nur über einen Fallback (nicht kunde.name) zustande kam. */
export function isKundeNameFallback(body: any): boolean {
  return !body?.kunde?.name?.trim()
}
