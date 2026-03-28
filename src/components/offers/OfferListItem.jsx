import React from 'react';
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, User, Building2, FileText, ChevronRight, Trash2, AlertTriangle, Hash, MapPin, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import StatusBadge from "../shared/StatusBadge";
import CurrencyDisplay from "../shared/CurrencyDisplay";
import moment from "moment";

export default function OfferListItem({ offer, onDelete, searchTerm = '' }) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = React.useState(false);
  const [creatingInvoice, setCreatingInvoice] = React.useState(false);

  const highlightText = (text, highlight) => {
    if (!highlight || !text) return text;
    const parts = text.toString().split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === highlight.toLowerCase() 
        ? <mark key={i} className="bg-yellow-200 font-semibold">{part}</mark>
        : part
    );
  };

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleFirstConfirm = () => {
    setShowDeleteDialog(false);
    setShowFinalConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(offer.id);
    setShowFinalConfirm(false);
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCreatingInvoice(true);
    
    try {
      const { base44 } = await import('@/api/base44Client');
      const { toast } = await import('sonner');
      const moment = await import('moment');
      
      // Positionen laden
      const positions = await base44.entities.OfferPosition.filter({ offerId: offer.id }, 'pos');
      
      // Neue Rechnung erstellen
      const invoiceData = {
        rechnungstyp: 'normal',
        datum: moment.default().format('YYYY-MM-DD'),
        zahlungskondition: '30 Tage netto',
        zahlungszielTage: 30,
        faelligAm: moment.default().add(30, 'days').format('YYYY-MM-DD'),
        status: 'entwurf',
        kundeName: offer.rechnungsempfaengerName || '',
        kundeUstId: offer.rechnungsempfaengerUstId || '',
        kundeStrasse: offer.rechnungsempfaengerStrasse || '',
        kundePlz: offer.rechnungsempfaengerPlz || '',
        kundeOrt: offer.rechnungsempfaengerOrt || '',
        objektBezeichnung: offer.objektBezeichnung || '',
        objektStrasse: offer.objektStrasse || '',
        objektPlz: offer.objektPlz || '',
        objektOrt: offer.objektOrt || '',
        hausinhabung: offer.hausinhabung || '',
        ticketId: offer.ticketId || '',
        ticketNumber: offer.ticketNumber || '',
        referenzAngebotNummer: offer.angebotNummer,
        referenzAngebotId: offer.id,
        source: offer.source || 'manual',
        entityType: offer.entityType
      };
      
      // Rechnungsnummer generieren
      const year = moment.default().year();
      const invoices = await base44.entities.Invoice.list();
      const thisYearInvoices = invoices.filter(i => i.rechnungsNummer && i.rechnungsNummer.includes(`RE-${year}`));
      const nextNumber = thisYearInvoices.length + 1;
      invoiceData.rechnungsNummer = `RE-${year}-${String(nextNumber).padStart(5, '0')}`;
      
      const newInvoice = await base44.entities.Invoice.create(invoiceData);
      
      // Positionen kopieren mit allen Werten
      for (const pos of positions) {
        await base44.entities.InvoicePosition.create({
          invoiceId: newInvoice.id,
          pos: pos.pos,
          produktId: pos.produktId,
          produktName: pos.produktName || '',
          beschreibung: pos.beschreibung || '',
          menge: pos.menge || 1,
          einheit: pos.einheit || 'Stk',
          einzelpreisNetto: pos.einzelpreisNetto || 0,
          rabattProzent: pos.rabattProzent || 0,
          ustSatz: pos.ustSatz || 20,
          gesamtNetto: pos.gesamtNetto || 0,
          gesamtBrutto: pos.gesamtBrutto || 0,
          teilfakturaProzent: 100,
          bereitsFakturiert: 0,
          referenzOfferPositionId: pos.id
        });
      }
      
      toast.success('Rechnung erstellt');
      window.location.href = createPageUrl(`InvoiceDetail?id=${newInvoice.id}`);
    } catch (error) {
      console.error('Error creating invoice:', error);
      const { toast } = await import('sonner');
      toast.error('Fehler beim Erstellen: ' + error.message);
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <>
    <Link to={createPageUrl(`OfferDetail?id=${offer.id}`)}>
      <Card className="p-5 hover:shadow-md transition-all hover:border-orange-300 cursor-pointer group">
        <div className="flex items-center gap-4">
          {/* Icon */}
          <div className="p-2.5 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors flex-shrink-0">
            <FileText className="w-5 h-5 text-orange-600" />
          </div>
          
          {/* Linke Seite: Angebotsnummer + Details */}
          <div className="flex-1 min-w-0">
            {/* Angebotsnummer + Status */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-slate-900 text-base whitespace-nowrap">
                {highlightText(offer.angebotNummer, searchTerm)}
              </span>
              <StatusBadge status={offer.status} />
            </div>
            
            {/* Kunde + Objekt */}
            <div className="flex flex-col gap-1 text-sm">
              {offer.rechnungsempfaengerName && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-4 h-4 flex-shrink-0 text-orange-500" />
                  <span className="truncate font-medium text-slate-700">{highlightText(offer.rechnungsempfaengerName, searchTerm)}</span>
                </span>
              )}
              {offer.objektBezeichnung && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-4 h-4 flex-shrink-0 text-orange-500" />
                  <span className="truncate text-slate-600">{highlightText(offer.objektBezeichnung, searchTerm)}</span>
                </span>
              )}
              {offer.erstelltDurch && (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <User className="w-4 h-4 text-orange-500" />
                  {highlightText(offer.erstelltDurch, searchTerm)}
                </span>
              )}
            </div>
          </div>
          
          {/* Rechte Seite: Ticketnummer, Datum, Betrag, Actions - alles fix ausgerichtet */}
          <div className="flex items-center gap-6 flex-shrink-0">
            {/* Ticket Nummer - feste Breite */}
            <div className="w-36 text-sm text-slate-600">
              {offer.ticketNumber && (
                <span className="flex items-center gap-1.5">
                  <Hash className="w-4 h-4 flex-shrink-0 text-orange-500" />
                  <span className="font-medium">{highlightText(offer.ticketNumber, searchTerm)}</span>
                </span>
              )}
            </div>
            
            {/* Datum - feste Breite */}
            <div className="w-28 text-sm text-slate-500">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Calendar className="w-4 h-4 text-orange-500" />
                {offer.datum ? moment(offer.datum).format('DD.MM.YYYY') : '-'}
              </span>
            </div>
            
            {/* Betrag */}
            <div className="text-right w-28">
              <CurrencyDisplay value={offer.summeBrutto} className="text-lg font-bold text-slate-900 whitespace-nowrap" />
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
              {offer.pdfUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(offer.pdfUrl, '_blank');
                  }}
                  className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 h-8 px-2"
                  title="Angebot PDF herunterladen"
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
        
        {/* Dynamische Anzeige der gefundenen Felder */}
        {searchTerm && offer._matchedFields && offer._matchedFields.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-500 mb-2">Gefunden in:</div>
            <div className="flex flex-wrap gap-2">
              {offer._matchedFields.slice(0, 5).map((match, idx) => (
                <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-xs">
                  <span className="font-semibold text-yellow-900">{match.field}:</span>{' '}
                  <span className="text-yellow-800">
                    {match.value.length > 50 
                      ? highlightText(match.value.substring(0, 50) + '...', searchTerm)
                      : highlightText(match.value, searchTerm)
                    }
                  </span>
                </div>
              ))}
              {offer._matchedFields.length > 5 && (
                <div className="text-xs text-slate-500 px-2 py-1">
                  +{offer._matchedFields.length - 5} weitere
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
            Möchten Sie das Angebot <strong>{offer.angebotNummer}</strong> wirklich löschen?
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
            Das Angebot <strong>{offer.angebotNummer}</strong> und alle zugehörigen Positionen werden permanent gelöscht.
            <br /><br />
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
  );
}