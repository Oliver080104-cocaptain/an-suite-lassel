/**
 * Entwurfsraum — Schreibzugriff für die API, ohne die bestehende Logik zu
 * berühren.
 *
 * Regel: Die API schreibt AUSSCHLIESSLICH in `beleg_entwuerfe`. Ein echter
 * Beleg entsteht erst, wenn ein Mensch den Entwurf übernimmt. Damit gibt es
 * weiterhin genau einen Schreiber auf `angebote` während des Bearbeitens —
 * die Detailseite — und die Autosave-Kollision kann gar nicht erst auftreten.
 *
 * Was die Übernahme bewusst NICHT tut:
 *   - keine n8n-Webhooks feuern. Der UI-Pfad "Speichern & in Zoho ablegen"
 *     lädt das PDF in den WorkDrive; das soll eine bewusste Handlung eines
 *     Menschen bleiben, nicht die Nebenwirkung einer Agenten-Aktion.
 *   - keine Weiterleitung auf die Detailseite. Deren Öffnen startet den
 *     Autosave-Zyklus; das gehört ebenfalls dem Menschen.
 *   - kein `pdf_url`. Das setzt der UI-Pfad beim ersten Speichern.
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/api-core'
import { naechsteBelegnummer } from '@/lib/belegnummer'
import { num, round2, STANDARD_MWST } from '@/lib/money'

/**
 * Strikte Validierung: unbekannte Felder werden ABGELEHNT, nicht geschluckt.
 * Ein Agent, der sich ein Feld ausdenkt, soll das erfahren — sonst meldet er
 * dem Anwender "gespeichert", während die Hälfte verworfen wurde.
 */
const positionSchema = z.strictObject({
  titel: z.string().trim().min(1).max(500),
  beschreibung: z.string().max(5000).optional(),
  menge: z.number().finite().min(0).max(1_000_000),
  einheit: z.string().trim().min(1).max(20).default('Stk'),
  einzelpreisNetto: z.number().finite().min(0).max(10_000_000),
  rabattProzent: z.number().finite().min(0).max(100).default(0),
  ustSatz: z.number().finite().min(0).max(100).default(STANDARD_MWST),
  produktId: z.uuid().optional(),
})

export const entwurfSchema = z.strictObject({
  belegTyp: z.literal('angebot').default('angebot'),
  herkunft: z.string().trim().max(200).optional(),
  notiz: z.string().trim().max(2000).optional(),

  kunde: z.strictObject({
    name: z.string().trim().min(1).max(200),
    strasse: z.string().trim().max(200).optional(),
    plz: z.string().trim().max(20).optional(),
    ort: z.string().trim().max(120).optional(),
    uid: z.string().trim().max(50).optional(),
    email: z.email().max(200).optional(),
  }),

  objekt: z.strictObject({
    bezeichnung: z.string().trim().max(300).optional(),
    adresse: z.string().trim().max(300).optional(),
    plz: z.string().trim().max(20).optional(),
    ort: z.string().trim().max(120).optional(),
  }).optional(),

  angebotsdatum: z.iso.date().optional(),
  gueltigBis: z.iso.date().optional(),
  reverseCharge: z.boolean().default(false),
  ansprechpartner: z.string().trim().max(200).optional(),
  ticketNummer: z.string().trim().max(100).optional(),
  notizen: z.string().trim().max(10_000).optional(),

  positionen: z.array(positionSchema).min(1).max(200),
})

export type EntwurfDaten = z.infer<typeof entwurfSchema>

/** Zeilennetto inkl. Rabatt — identisch zur Rechnung in der Positionstabelle. */
function zeilenNetto(p: EntwurfDaten['positionen'][number]): number {
  const brutto = num(p.menge, 0) * num(p.einzelpreisNetto, 0)
  return round2(brutto * (1 - num(p.rabattProzent, 0) / 100))
}

/** Summen aus den Positionen. Reverse Charge → keine USt, brutto = netto. */
export function entwurfSummen(daten: EntwurfDaten) {
  const netto = round2(daten.positionen.reduce((s, p) => s + zeilenNetto(p), 0))
  const mwst = daten.reverseCharge
    ? 0
    : round2(daten.positionen.reduce((s, p) => s + zeilenNetto(p) * (num(p.ustSatz, STANDARD_MWST) / 100), 0))
  return { netto, mwst, brutto: round2(netto + mwst) }
}

/**
 * Übernahme: Entwurf → echtes Angebot.
 *
 * Reihenfolge ist wichtig. Der Zustandswechsel steht ZUERST und läuft als
 * bedingtes UPDATE mit `.select()`: liefert es keine Zeile, hat ein anderer
 * den Entwurf bereits übernommen. Ohne diese Sperre würden zwei Sachbearbeiter,
 * die denselben Stapel abarbeiten, zwei identische Angebote erzeugen — ohne
 * dass irgendjemand einen Fehler sähe.
 *
 * `.eq()` allein genügt dafür nicht: supabase-js liefert bei null getroffenen
 * Zeilen `error === null`, ein Konflikt sähe wie ein Erfolg aus.
 */
export async function entwurfUebernehmen(
  db: SupabaseClient,
  entwurfId: string,
  entschiedenVon: string
): Promise<{ angebotId: string; angebotsnummer: string }> {
  const { data: beansprucht, error: claimError } = await db
    .from('beleg_entwuerfe')
    .update({ zustand: 'uebernommen', entschieden_am: new Date().toISOString(), entschieden_von: entschiedenVon })
    .eq('id', entwurfId)
    .eq('zustand', 'offen')
    .select()

  if (claimError) {
    throw new ApiError(502, 'db-fehler', `Entwurf konnte nicht beansprucht werden: ${claimError.message}`)
  }
  if (!beansprucht || beansprucht.length === 0) {
    throw new ApiError(409, 'bereits-entschieden',
      'Dieser Entwurf wurde bereits übernommen oder verworfen.')
  }

  const entwurf = beansprucht[0] as Record<string, unknown>
  const daten = entwurfSchema.parse(entwurf.daten)
  const summen = entwurfSummen(daten)

  try {
    const jahr = daten.angebotsdatum ? Number(daten.angebotsdatum.slice(0, 4)) : new Date().getFullYear()
    const angebotsnummer = await naechsteBelegnummer(db, 'AN', jahr)

    const heute = new Date().toISOString().slice(0, 10)
    const kopf: Record<string, unknown> = {
      angebotsnummer,
      // Immer Entwurf: der Statuswechsel feuert Webhooks nach Zoho und
      // gehört deshalb dem Menschen.
      status: 'entwurf',
      // Markiert die Herkunft, ohne die Analytics zu verfälschen — die
      // gruppiert nach dem Klartextfeld erstellt_von.
      source: 'api',
      angebotsdatum: daten.angebotsdatum || heute,
      gueltig_bis: daten.gueltigBis || null,
      kunde_name: daten.kunde.name,
      kunde_strasse: daten.kunde.strasse || null,
      kunde_plz: daten.kunde.plz || null,
      kunde_ort: daten.kunde.ort || null,
      kunde_uid: daten.kunde.uid || null,
      kunde_email: daten.kunde.email || null,
      objekt_bezeichnung: daten.objekt?.bezeichnung || null,
      objekt_adresse: daten.objekt?.adresse || null,
      objekt_plz: daten.objekt?.plz || null,
      objekt_ort: daten.objekt?.ort || null,
      ansprechpartner: daten.ansprechpartner || null,
      ticket_nummer: daten.ticketNummer || null,
      reverse_charge: daten.reverseCharge,
      notizen: daten.notizen || null,
      netto_gesamt: summen.netto,
      mwst_gesamt: summen.mwst,
      brutto_gesamt: summen.brutto,
    }

    // Schema-Drift: fehlt eine Spalte in der Prod-DB, wird sie aus dem
    // Payload genommen und der Insert wiederholt. Anders als an den fünf
    // bestehenden Stellen wird das hier NICHT verschwiegen — die verworfenen
    // Felder gehen in die Antwort, sonst meldete die API "angelegt", während
    // Daten fehlen.
    const verworfeneFelder: string[] = []
    const payload = { ...kopf }
    let angebot: Record<string, unknown> | null = null
    let letzterFehler: string | null = null

    for (let versuch = 0; versuch < 8; versuch++) {
      const res = await db.from('angebote').insert(payload).select().single()
      if (!res.error) { angebot = res.data; letzterFehler = null; break }
      letzterFehler = res.error.message
      const fehlend = /Could not find the '([^']+)' column/i.exec(res.error.message || '')?.[1]
      if (!fehlend || !(fehlend in payload)) break
      verworfeneFelder.push(fehlend)
      delete payload[fehlend]
    }

    if (!angebot) {
      throw new ApiError(502, 'insert-fehlgeschlagen',
        `Angebot konnte nicht angelegt werden: ${letzterFehler || 'unbekannter Fehler'}`)
    }

    const angebotId = String(angebot.id)

    const positionen = daten.positionen.map((p, i) => ({
      angebot_id: angebotId,
      position: i + 1,
      produkt_id: p.produktId || null,
      // Spaltenformat der App: "Titel\nLangtext".
      beschreibung: p.beschreibung ? `${p.titel}\n${p.beschreibung}` : p.titel,
      menge: p.menge,
      einheit: p.einheit,
      einzelpreis: p.einzelpreisNetto,
      rabatt_prozent: p.rabattProzent,
      mwst_satz: p.ustSatz,
      gesamtpreis: zeilenNetto(p),
    }))

    const { error: posError } = await db.from('angebot_positionen').insert(positionen)
    if (posError) {
      // Kopf ohne Positionen wäre ein Blindgänger in der Liste.
      await db.from('angebote').delete().eq('id', angebotId)
      throw new ApiError(502, 'positionen-fehlgeschlagen',
        `Positionen konnten nicht angelegt werden, das Angebot wurde zurückgenommen: ${posError.message}`)
    }

    await db.from('beleg_entwuerfe')
      .update({
        erzeugte_beleg_id: angebotId,
        erzeugte_nummer: angebotsnummer,
        fehler: verworfeneFelder.length
          ? `Nicht übernommene Felder (Spalte fehlt in der Datenbank): ${verworfeneFelder.join(', ')}`
          : null,
      })
      .eq('id', entwurfId)

    return { angebotId, angebotsnummer }
  } catch (err) {
    // Anspruch zurückgeben, damit der Entwurf nach einem Fehler erneut
    // übernommen werden kann statt dauerhaft blockiert zu sein.
    await db.from('beleg_entwuerfe')
      .update({
        zustand: 'offen',
        entschieden_am: null,
        entschieden_von: null,
        fehler: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      })
      .eq('id', entwurfId)
    throw err
  }
}
