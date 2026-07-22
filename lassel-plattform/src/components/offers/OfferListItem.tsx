'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import {
  Calendar,
  Building2,
  FileText,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Hash,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { num, STANDARD_MWST, computeTotals } from '@/lib/money'

interface MatchField {
  field: string
  value: string
  key: string
}

interface Props {
  offer: Record<string, unknown>
  onDelete: (id: string) => void
  searchTerm?: string
}

function highlightText(text: string | undefined | null, highlight: string) {
  if (!highlight || !text) return text
  const parts = text.toString().split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === highlight.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 font-semibold">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export default function OfferListItem({ offer, onDelete, searchTerm = '' }: Props) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = React.useState(false)
  const [creatingInvoice, setCreatingInvoice] = React.useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteDialog(true)
  }

  const handleFirstConfirm = () => {
    setShowDeleteDialog(false)
    setShowFinalConfirm(true)
  }

  const confirmDelete = () => {
    onDelete(offer.id as string)
    setShowFinalConfirm(false)
  }

  const handleCreateInvoice = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCreatingInvoice(true)
    try {
      const { data: positions } = await supabase
        .from('angebot_positionen')
        .select('*')
        .eq('angebot_id', offer.id)
        .order('position')

      // Rechnungsnummer generieren
      const year = new Date().getFullYear()
      const { data: existingInvoices } = await supabase
        .from('rechnungen')
        .select('rechnungsnummer')
        .like('rechnungsnummer', `RE-${year}-%`)
      const nextNumber = (existingInvoices?.length || 0) + 1
      const rechnungsnummer = `RE-${year}-${String(nextNumber).padStart(5, '0')}`

      const today = format(new Date(), 'yyyy-MM-dd')
      const fälligAm = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

      // Summen aus den Positionen rechnen — vorher fehlten netto_gesamt,
      // mwst_gesamt und brutto_gesamt komplett, die Rechnung stand mit 0,00 €
      // in Liste, Analytics und PDF und war in diesem Zustand versendbar.
      const summen = computeTotals(
        (positions || []).map((p: Record<string, unknown>) => ({
          menge: p.menge,
          einzelpreis: p.einzelpreis,
          rabattProzent: p.rabatt_prozent,
          mwstSatz: p.mwst_satz,
        })),
        { reverseCharge: Boolean(offer.reverse_charge) }
      )

      // Kopfdaten vollständig übernehmen. Vorher fehlten unter anderem
      // kunde_uid (bei Reverse Charge Pflichtangabe), objekt_adresse,
      // ticket_nummer, erstellt_von (das PDF unterschrieb mit dem
      // Geschäftsführer statt der Sachbearbeiterin) und die Angebotsreferenz —
      // dieser Button erzeugte damit einen ganz anderen Beleg als der
      // Dialog-Pfad in angebote/[id].
      const invoiceData: Record<string, unknown> = {
        rechnungsdatum: today,
        faellig_bis: fälligAm,
        status: 'entwurf',
        rechnungstyp: 'normal',
        rechnungsnummer,
        kunde_name: offer.kunde_name || '',
        kunde_strasse: offer.kunde_strasse || '',
        kunde_plz: offer.kunde_plz || '',
        kunde_ort: offer.kunde_ort || '',
        kunde_uid: offer.kunde_uid || null,
        kunde_email: offer.kunde_email || null,
        email_rechnung: offer.email_rechnung || offer.kunde_email || null,
        ansprechpartner: offer.ansprechpartner || null,
        objekt_adresse: offer.objekt_bezeichnung || offer.objekt_adresse || null,
        objekt_plz: offer.objekt_plz || null,
        objekt_ort: offer.objekt_ort || null,
        hausinhabung: offer.hausinhabung || null,
        hausverwaltung_name: offer.hausverwaltung_name || null,
        rechnung_an_hi: !!offer.rechnung_an_hi,
        uid_von_hi: offer.uid_von_hi || null,
        ticket_nummer: offer.ticket_nummer || null,
        zoho_ticket_id: offer.zoho_ticket_id || null,
        geschaeftsfallnummer: offer.geschaeftsfallnummer || null,
        erstellt_von: offer.erstellt_von || null,
        vermittler_id: offer.vermittler_id || null,
        zahlungskondition: '30 Tage netto',
        reverse_charge: offer.reverse_charge || false,
        angebot_id: offer.id as string,
        referenz_angebot_id: offer.id as string,
        referenz_angebot_nummer: offer.angebotsnummer || null,
        netto_gesamt: summen.netto,
        mwst_gesamt: summen.mwst,
        brutto_gesamt: summen.brutto,
      }

      // Schema-Drift: fehlt eine Spalte in der Prod-DB, wird sie aus dem
      // Payload genommen und erneut versucht — gleiches Muster wie im
      // Dialog-Pfad, sonst scheitert das Anlegen komplett.
      const payload = { ...invoiceData }
      let newInvoice: Record<string, unknown> | null = null
      let letzterFehler: Error | null = null
      for (let versuch = 0; versuch < 8; versuch++) {
        const res = await supabase.from('rechnungen').insert(payload).select().single()
        if (!res.error) { newInvoice = res.data; letzterFehler = null; break }
        letzterFehler = new Error(res.error.message)
        const fehlend = /Could not find the '([^']+)' column/i.exec(res.error.message || '')?.[1]
        if (!fehlend || !(fehlend in payload)) break
        delete payload[fehlend]
      }
      if (!newInvoice) throw letzterFehler ?? new Error('Rechnung konnte nicht angelegt werden')

      for (const pos of positions || []) {
        await supabase.from('rechnung_positionen').insert({
          rechnung_id: newInvoice.id,
          position: pos.position,
          produkt_id: pos.produkt_id,
          beschreibung: pos.beschreibung || '',
          menge: num(pos.menge, 1),
          einheit: pos.einheit || 'Stk',
          einzelpreis: num(pos.einzelpreis, 0),
          rabatt_prozent: num(pos.rabatt_prozent, 0),
          // 0%-USt bleibt 0 statt still auf den Regelsatz zu springen
          mwst_satz: num(pos.mwst_satz, STANDARD_MWST),
          gesamtpreis: num(pos.gesamtpreis, 0),
        })
      }

      toast.success('Rechnung erstellt')
      router.push(`/rechnungen/${newInvoice.id}`)
    } catch (error) {
      toast.error('Fehler beim Erstellen: ' + (error as Error).message)
    } finally {
      setCreatingInvoice(false)
    }
  }

  const matchedFields = (offer._matchedFields as MatchField[]) || []
  const datum = offer.angebotsdatum ? format(new Date(offer.angebotsdatum as string), 'dd.MM.yyyy') : '-'

  return (
    <>
      <Link href={`/angebote/${offer.id}`}>
        <Card className="p-5 hover:shadow-md transition-all hover:border-orange-300 cursor-pointer group">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="p-2.5 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors flex-shrink-0">
              <FileText className="w-5 h-5 text-orange-600" />
            </div>

            {/* Linke Seite */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-slate-900 text-base whitespace-nowrap">
                  {highlightText(offer.angebotsnummer as string, searchTerm)}
                </span>
                <StatusBadge status={offer.status as string} />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                {!!offer.kunde_name && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="w-4 h-4 flex-shrink-0 text-orange-500" />
                    <span className="truncate font-medium text-slate-700">
                      {highlightText(offer.kunde_name as string, searchTerm)}
                    </span>
                  </span>
                )}
                {!!offer.objekt_bezeichnung && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-4 h-4 flex-shrink-0 text-orange-500" />
                    <span className="truncate text-slate-600">
                      {highlightText(offer.objekt_bezeichnung as string, searchTerm)}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Rechte Seite */}
            <div className="flex items-center gap-6 flex-shrink-0">
              {/* Ticket */}
              <div className="w-36 text-sm text-slate-600">
                {!!offer.ticket_nummer && (
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-4 h-4 flex-shrink-0 text-orange-500" />
                    <span className="font-medium">
                      {highlightText(offer.ticket_nummer as string, searchTerm)}
                    </span>
                  </span>
                )}
              </div>

              {/* Datum */}
              <div className="w-28 text-sm text-slate-500">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  {datum}
                </span>
              </div>

              {/* Betrag */}
              <div className="text-right w-28">
                <CurrencyDisplay
                  value={offer.brutto_gesamt as number}
                  className="text-lg font-bold text-slate-900 whitespace-nowrap"
                />
                <p className="text-xs text-slate-500">Brutto</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateInvoice}
                  disabled={creatingInvoice}
                  className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 h-8 px-2"
                  title="Rechnung erstellen"
                >
                  {creatingInvoice ? 'Erstelle...' : 'Rechnung'}
                </Button>
                {!!offer.pdf_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(offer.pdf_url as string, '_blank')
                    }}
                    className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 h-8 px-2"
                    title="Angebot PDF"
                  >
                    Angebot
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-orange-600 transition-colors" />
              </div>
            </div>
          </div>

          {/* Match-Details bei Suche */}
          {searchTerm && matchedFields.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-500 mb-2">Gefunden in:</div>
              <div className="flex flex-wrap gap-2">
                {matchedFields.slice(0, 5).map((match, idx) => (
                  <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-xs">
                    <span className="font-semibold text-yellow-900">{match.field}:</span>{' '}
                    <span className="text-yellow-800">
                      {match.value.length > 50
                        ? highlightText(match.value.substring(0, 50) + '...', searchTerm)
                        : highlightText(match.value, searchTerm)}
                    </span>
                  </div>
                ))}
                {matchedFields.length > 5 && (
                  <div className="text-xs text-slate-500 px-2 py-1">
                    +{matchedFields.length - 5} weitere
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </Link>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Angebot löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie das Angebot <strong>{offer.angebotsnummer as string}</strong> wirklich löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleFirstConfirm} className="bg-amber-600 hover:bg-amber-700">
              Weiter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFinalConfirm} onOpenChange={setShowFinalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Unwiderruflich löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Das Angebot <strong>{offer.angebotsnummer as string}</strong> und alle zugehörigen Positionen
              werden permanent gelöscht.
              <br />
              <br />
              <strong>Diese Aktion kann nicht rückgängig gemacht werden!</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700">
              Unwiderruflich löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
