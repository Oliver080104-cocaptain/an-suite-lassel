import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ExternalLink, FileText, Receipt, Truck, Search } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../components/shared/StatusBadge";
import moment from 'moment';

export default function DocumentOverview() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Fetch all documents with PDFs
  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: ['offers-pdf'],
    queryFn: () => base44.entities.Offer.filter({ deleted_at: null }),
    initialData: []
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-pdf'],
    queryFn: () => base44.entities.Invoice.filter({ deleted_at: null }),
    initialData: []
  });

  const { data: deliveryNotes, isLoading: deliveryNotesLoading } = useQuery({
    queryKey: ['deliveryNotes-pdf'],
    queryFn: () => base44.entities.DeliveryNote.filter({ deleted_at: null }),
    initialData: []
  });

  const isLoading = offersLoading || invoicesLoading || deliveryNotesLoading;

  // Combine all documents
  const allDocuments = [
    ...(offers || []).map(o => ({ 
      ...o, 
      type: 'Angebot', 
      typeKey: 'offer',
      nummer: o.angebotNummer,
      icon: FileText,
      color: 'text-blue-600 bg-blue-50'
    })),
    ...(invoices || []).map(i => ({ 
      ...i, 
      type: 'Rechnung', 
      typeKey: 'invoice',
      nummer: i.rechnungsNummer,
      icon: Receipt,
      color: 'text-emerald-600 bg-emerald-50'
    })),
    ...(deliveryNotes || []).map(d => ({ 
      ...d, 
      type: 'Lieferschein', 
      typeKey: 'delivery_note',
      nummer: d.lieferscheinNummer,
      icon: Truck,
      color: 'text-purple-600 bg-purple-50'
    }))
  ].filter(doc => doc.pdfUrl); // Nur Dokumente mit PDF

  // Filter and search
  const filteredDocuments = allDocuments
    .filter(doc => filterType === 'all' || doc.typeKey === filterType)
    .filter(doc => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        doc.nummer?.toLowerCase().includes(searchLower) ||
        doc.kundeName?.toLowerCase().includes(searchLower) ||
        doc.rechnungsempfaengerName?.toLowerCase().includes(searchLower) ||
        doc.objektBezeichnung?.toLowerCase().includes(searchLower)
      );
    });

  // Sort by date descending
  const sortedDocuments = filteredDocuments.sort((a, b) => {
    const dateA = a.datum || a.created_date;
    const dateB = b.datum || b.created_date;
    return moment(dateB).diff(moment(dateA));
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Dokumentenübersicht</h1>
        <p className="text-slate-500 mt-1">Alle PDFs mit Google Drive Links ({sortedDocuments.length})</p>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Suche nach Nummer, Kunde, Objekt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Dokumenttyp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="offer">Angebote</SelectItem>
              <SelectItem value="invoice">Rechnungen</SelectItem>
              <SelectItem value="delivery_note">Lieferscheine</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Documents Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ</TableHead>
              <TableHead>Nummer</TableHead>
              <TableHead>Kunde/Objekt</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                  {searchTerm || filterType !== 'all' 
                    ? 'Keine passenden Dokumente gefunden' 
                    : 'Keine Dokumente mit PDFs gefunden'}
                </TableCell>
              </TableRow>
            ) : (
              sortedDocuments.map((doc) => {
                const Icon = doc.icon;
                return (
                  <TableRow key={`${doc.type}-${doc.id}`} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${doc.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm">{doc.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">{doc.nummer}</TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate text-sm">
                        {doc.kundeName || doc.rechnungsempfaengerName || '-'}
                      </div>
                      {doc.objektBezeichnung && (
                        <div className="text-xs text-slate-500 truncate">{doc.objektBezeichnung}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {doc.datum ? moment(doc.datum).format('DD.MM.YYYY') : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(doc.pdfUrl, '_blank')}
                        className="gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Öffnen
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}