'use client'

import React, { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { RECHNUNGSTYP_INFO, type Rechnungstyp } from '@/lib/rechnung-typ'

export interface CreateInvoiceOptions {
  rechnungstyp: Rechnungstyp
  istSchlussrechnung: boolean
  beschreibung?: string
  teilbetragNetto?: number
  zahlungskondition: string
  alleNeuPositionen: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (opts: CreateInvoiceOptions) => Promise<void> | void
  /** Brutto-Summe des Angebots */
  angebotsbrutto: number
  /** Netto-Summe des Angebots */
  angebotsnetto: number
  /** Bereits fakturiert (Brutto) — über aktive Rechnungen zu diesem Angebot */
  bereitsFakturiertBrutto: number
  /** Bereits fakturiert (Netto) */
  bereitsFakturiertNetto: number
  loading?: boolean
}

const TYP_OPTIONS: { value: Rechnungstyp; description: string }[] = [
  { value: 'normal', description: 'Volle Rechnung — alle Positionen werden übernommen.' },
  { value: 'anzahlung', description: 'Anzahlungsrechnung — frei eingebbarer Betrag vor Leistungserbringung.' },
  { value: 'teilrechnung', description: 'Teilrechnung — Zwischenrechnung über einen Teilbetrag.' },
  { value: 'gutschrift', description: 'Gutschrift — Korrektur einer bereits gestellten Rechnung.' },
]

function formatEuro(n: number): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n || 0)
}

export default function CreateInvoiceDialog({
  open,
  onClose,
  onConfirm,
  angebotsbrutto,
  angebotsnetto,
  bereitsFakturiertBrutto,
  bereitsFakturiertNetto,
  loading,
}: Props) {
  const [typ, setTyp] = useState<Rechnungstyp>('normal')
  const [istSchlussrechnung, setIstSchlussrechnung] = useState(false)
  const [beschreibung, setBeschreibung] = useState('')
  const [teilbetragNetto, setTeilbetragNetto] = useState<string>('')
  const [zahlungskondition, setZahlungskondition] = useState('30 Tage netto')
  const [alleNeuPositionen, setAlleNeuPositionen] = useState(true)

  const offenBrutto = Math.max(0, angebotsbrutto - bereitsFakturiertBrutto)

  const teilbetragBrutto = useMemo(() => {
    const netto = parseFloat(teilbetragNetto) || 0
    return netto * 1.2
  }, [teilbetragNetto])

  const handleSubmit = () => {
    const opts: CreateInvoiceOptions = {
      rechnungstyp: typ,
      istSchlussrechnung: typ === 'normal' && istSchlussrechnung,
      beschreibung: beschreibung || undefined,
      teilbetragNetto: (typ === 'anzahlung' || typ === 'teilrechnung')
        ? (parseFloat(teilbetragNetto) || 0)
        : undefined,
      zahlungskondition,
      alleNeuPositionen,
    }
    onConfirm(opts)
  }

  const needsBetrag = typ === 'anzahlung' || typ === 'teilrechnung'
  const isGutschrift = typ === 'gutschrift'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rechnung erzeugen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Saldo-Anzeige */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Angebotsbetrag (brutto):</span>
              <span className="font-medium">{formatEuro(angebotsbrutto)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Bereits fakturiert (brutto):</span>
              <span className="font-medium">{formatEuro(bereitsFakturiertBrutto)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
              <span className="text-slate-700 font-semibold">Noch offen:</span>
              <span className={`font-bold ${offenBrutto <= 0 ? 'text-emerald-600' : 'text-[#E85A1B]'}`}>
                {formatEuro(offenBrutto)}
              </span>
            </div>
          </div>

          {/* Typauswahl */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Rechnungstyp</Label>
            <div className="space-y-2">
              {TYP_OPTIONS.map((opt) => {
                const info = RECHNUNGSTYP_INFO[opt.value]
                return (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      typ === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rechnungstyp"
                      value={opt.value}
                      checked={typ === opt.value}
                      onChange={() => setTyp(opt.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{info.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${info.badgeBg} ${info.badgeText}`}>
                          {info.prefix}-
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Felder je nach Typ */}
          {typ === 'normal' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alleNeuPositionen}
                  onChange={(e) => setAlleNeuPositionen(e.target.checked)}
                />
                <span className="text-sm">Alle Positionen aus dem Angebot übernehmen</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={istSchlussrechnung}
                  onChange={(e) => setIstSchlussrechnung(e.target.checked)}
                />
                <span className="text-sm">Als Schlussrechnung markieren (zieht bereits fakturierte Beträge ab)</span>
              </label>
              {bereitsFakturiertNetto > 0 && istSchlussrechnung && (
                <div className="text-xs text-slate-500 pl-6">
                  Bereits fakturiert (netto): {formatEuro(bereitsFakturiertNetto)} — wird im PDF abgezogen.
                </div>
              )}
            </div>
          )}

          {needsBetrag && (
            <div className="space-y-3">
              <div>
                <Label>Beschreibung der Leistung</Label>
                <Textarea
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  placeholder={typ === 'anzahlung' ? 'z.B. Anzahlung gemäß Angebot' : 'z.B. 1. Teilrechnung — Materiallieferung'}
                  rows={2}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Betrag Netto (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={teilbetragNetto}
                    onChange={(e) => setTeilbetragNetto(e.target.value)}
                    placeholder="0,00"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Betrag Brutto (auto)</Label>
                  <Input
                    value={formatEuro(teilbetragBrutto)}
                    disabled
                    className="mt-1 bg-slate-50"
                  />
                </div>
              </div>
            </div>
          )}

          {isGutschrift && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Gutschriften werden mit leeren Positionen erzeugt. Du musst die Positionen
              und den Betrag in der Detailansicht der Gutschrift anpassen.
            </div>
          )}

          {/* Zahlungskondition */}
          <div>
            <Label>Zahlungskondition</Label>
            <Input
              value={zahlungskondition}
              onChange={(e) => setZahlungskondition(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || (needsBetrag && (parseFloat(teilbetragNetto) || 0) <= 0)}
            className="bg-[#E85A1B] hover:bg-[#d45116] text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Rechnung erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
