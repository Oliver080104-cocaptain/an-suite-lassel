import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from '../components/shared/PageHeader';
import { RefreshCw, ArrowDownCircle, ArrowUpCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import moment from 'moment';

export default function ApiLogs() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['apiLogs'],
    queryFn: () => base44.entities.ApiLog.list('-created_date', 100),
    refetchInterval: autoRefresh ? 3000 : false,
  });

  const getTypeIcon = (typ) => {
    if (typ.startsWith('incoming')) return <ArrowDownCircle className="w-4 h-4 text-blue-600" />;
    if (typ.startsWith('outgoing')) return <ArrowUpCircle className="w-4 h-4 text-emerald-600" />;
    return null;
  };

  const getTypeLabel = (typ) => {
    const labels = {
      incoming_offer: 'Eingehendes Angebot',
      incoming_delivery_note: 'Eingehender Lieferschein',
      incoming_invoice: 'Eingehende Rechnung',
      outgoing_offer_callback: 'Angebots-Callback',
      outgoing_delivery_note_callback: 'Lieferschein-Callback',
      outgoing_invoice_callback: 'Rechnungs-Callback'
    };
    return labels[typ] || typ;
  };

  const getStatusBadge = (status) => {
    if (status === 'success') return <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Erfolg</Badge>;
    if (status === 'error') return <Badge className="bg-red-100 text-red-700"><XCircle className="w-3 h-3 mr-1" />Fehler</Badge>;
    if (status === 'pending') return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="w-3 h-3 mr-1" />Ausstehend</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="API Logs"
          subtitle="Live-Übersicht aller API-Aufrufe und Webhooks"
          backLink="Dashboard"
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-Refresh {autoRefresh ? 'An' : 'Aus'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Aktualisieren
              </Button>
            </div>
          }
        />

        <div className="space-y-3">
          {isLoading && (
            <Card className="p-6 text-center text-slate-500">
              Lade Logs...
            </Card>
          )}

          {!isLoading && logs.length === 0 && (
            <Card className="p-6 text-center text-slate-500">
              Noch keine API-Aufrufe vorhanden
            </Card>
          )}

          {logs.map((log) => (
            <Card key={log.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded-lg">
                  {getTypeIcon(log.typ)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-slate-900">{getTypeLabel(log.typ)}</span>
                    {getStatusBadge(log.status)}
                    <span className="text-xs text-slate-500">
                      {moment(log.created_date).format('DD.MM.YYYY HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="text-sm text-slate-600 mb-2">
                    <span className="font-mono bg-slate-100 px-2 py-1 rounded text-xs">
                      {log.method} {log.endpoint}
                    </span>
                  </div>

                  {(log.relatedOfferNumber || log.relatedInvoiceNumber) && (
                    <div className="text-xs text-slate-500 mb-2">
                      Verknüpft mit: {log.relatedOfferNumber || log.relatedInvoiceNumber}
                    </div>
                  )}

                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                      Details anzeigen
                    </summary>
                    <div className="mt-2 space-y-2">
                      {log.payload && (
                        <div>
                          <div className="font-semibold text-slate-700 mb-1">Payload:</div>
                          <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto text-xs">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.response && (
                        <div>
                          <div className="font-semibold text-slate-700 mb-1">Response:</div>
                          <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto text-xs">
                            {JSON.stringify(log.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}