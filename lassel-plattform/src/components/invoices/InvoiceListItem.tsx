'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { Calendar, Building2, Receipt, ChevronRight, AlertCircle, Trash2, AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import { format } from 'date-fns'

interface Props {
  invoice: any
  onDelete: (id: string) => void
  searchTerm?: string
  matchDetails?: Array<{ field: string; value: string; position?: number }>
}

export default function InvoiceListItem({ invoice, onDelete, searchTerm, matchDetails }: Props) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = React.useState(false)

  const isOverdue = invoice.status === 'offen' && invoice.faelligAm && new Date(invoice.faelligAm) < new Date()

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
    onDelete(invoice.id)
    setShowFinalConfirm(false)
  }

  const highlightText = (text: string, search: string) => {
    const parts = text.split(new RegExp(`(${search})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase()
        ? <span key={i} className="bg-yellow-200 font-semibold">{part}</span>
        : part
    )
  }

  return (
    <>
      <Link href={`/rechnungen/${invoice.id}`}>
        <Card className={`p-4 hover:shadow-md transition-all hover:border-slate-300 cursor-pointer group ${isOverdue ? 'border-rose-200 bg-rose-50/30' : ''}`}>
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-lg group-hover:opacity-90 transition-colors flex-shrink-0 ${isOverdue ? 'bg-rose-100' : 'bg-emerald-50 group-hover:bg-emerald-100'}`}>
              <Receipt className={`w-5 h-5 ${isOverdue ? 'text-rose-600' : 'text-emerald-600'}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-slate-900 text-base whitespace-nowrap">
                  {invoice.rechnungsNummer}
                </span>
                <StatusBadge status={invoice.status} />
                <StatusBadge status={invoice.rechnungstyp} />
                {isOverdue && (
                  <span className="flex items-center gap-1 text-rose-600 text-xs font-medium">
                    <AlertCircle className="w-3 h-3" />
                    Überfällig
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                  <span className="truncate font-medium text-slate-700">{invoice.kundeName || 'Kein Kunde'}</span>
                </span>
                {invoice.objektBezeichnung && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-slate-600">{invoice.objektBezeichnung}</span>
                  </span>
                )}
              </div>

              {searchTerm && matchDetails && matchDetails.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="text-xs text-slate-500 mb-2">Gefunden in:</div>
                  <div className="flex flex-wrap gap-2">
                    {matchDetails.map((match, idx) => {
                      const displayText = match.value.length > 60 ? match.value.substring(0, 60) + '...' : match.value
                      return (
                        <div key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                          {match.position && <span className="font-medium text-amber-900">Position {match.position} - </span>}
                          <span className="font-medium text-amber-900">{match.field}:</span>
                          <span className="text-slate-700">{highlightText(displayText, searchTerm)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="w-36 text-sm text-slate-600">
                {invoice.ticketNumber && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">{invoice.ticketNumber}</span>
                  </span>
                )}
              </div>

              <div className="w-32 text-sm">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-500 mb-1">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  {invoice.datum ? format(new Date(invoice.datum), 'dd.MM.yyyy') : '-'}
                </span>
                {invoice.faelligAm && (
                  <span className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${isOverdue ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
                    Fällig: {format(new Date(invoice.faelligAm), 'dd.MM.yyyy')}
                  </span>
                )}
              </div>

              <div className="text-right w-28">
                <CurrencyDisplay value={invoice.summeBrutto} className="text-lg font-bold text-slate-900 whitespace-nowrap" />
                <p className="text-xs text-slate-500">Brutto</p>
              </div>

              <div className="flex items-center gap-1">
                {invoice.pdfUrl && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(invoice.pdfUrl, '_blank')
                    }}
                    className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 h-8 w-8"
                    title="PDF öffnen"
                  >
                    <Download className="w-4 h-4" />
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
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
            </div>
          </div>
        </Card>
      </Link>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Rechnung <strong>{invoice.rechnungsNummer}</strong> wirklich löschen?
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
              Die Rechnung <strong>{invoice.rechnungsNummer}</strong> und alle zugehörigen Positionen werden permanent gelöscht.
              <br /><br />
              <strong>Diese Aktion kann nicht rückgängig gemacht werden!</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700">
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
