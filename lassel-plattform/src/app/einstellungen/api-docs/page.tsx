'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Code, Send, FileText, Receipt, Package, Users } from 'lucide-react'

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/einstellungen" className="text-sm text-slate-500 hover:text-slate-700">← Einstellungen</Link>
          <h1 className="text-3xl font-bold text-slate-900 mt-2">API Dokumentation</h1>
          <p className="text-slate-500 mt-1">Webhook-Integration mit n8n/Zoho</p>
        </div>

        {/* Quick Start */}
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-emerald-50 border-blue-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">🚀 Quick Start</h2>
          <div className="space-y-3 text-sm">
            <div><strong>1. Webhook URLs:</strong></div>
            <div className="ml-4 bg-white p-3 rounded border border-blue-200 space-y-2">
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">POST /api/webhooks/angebot</div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">POST /api/webhooks/lieferschein</div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">POST /api/webhooks/rechnung</div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">POST /api/webhooks/produkt</div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">POST /api/webhooks/vermittler</div>
            </div>
            <div><strong>2. Callback URL (Response Webhook):</strong></div>
            <div className="ml-4 bg-emerald-50 p-3 rounded border border-emerald-200">
              <code className="text-xs break-all">https://lasselgmbh.app.n8n.cloud/webhook-test/190e70b8-6851-43a7-9025-50afe3028639</code>
              <div className="text-xs text-slate-600 mt-1">✅ Bereits im Code hinterlegt - Responses kommen automatisch hier an!</div>
            </div>
            <div><strong>3. Keine API-Keys nötig:</strong> Die Webhooks sind intern erreichbar</div>
          </div>
        </Card>

        {/* Angebots-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg"><FileText className="w-5 h-5 text-blue-600" /></div>
            <h2 className="text-xl font-bold text-slate-900">Angebots-API (AN-Cockpit)</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-emerald-100 text-emerald-700">POST</Badge>
            <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /api/webhooks/angebot</code>
          </div>
          <p className="text-slate-600 mb-4">Erstellt ein neues Angebot oder öffnet ein bestehendes basierend auf der Ticket-ID.</p>
          <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">{`{
  "source": "zoho",
  "entityType": "ticket",
  "ticketId": "123456789",
  "ticketNumber": "TKT-2024-00123",
  "kunde": {
    "name": "Musterfirma GmbH",
    "strasse": "Musterstraße 1",
    "plz": "12345",
    "ort": "Musterstadt",
    "ansprechpartner": "Max Mustermann",
    "email": "kunde@beispiel.at",
    "uidnummer": "ATU12345678"
  },
  "angebot": {
    "datum": "2024-01-15",
    "gueltigBis": "2024-02-15",
    "erstelltDurch": "Mitarbeiter Name",
    "bemerkung": "Optionale Bemerkung",
    "skizzenLink": "https://workdrive.zoho.eu/folder/abc123"
  },
  "positionen": [
    {
      "pos": 1,
      "produktName": "Produkt A",
      "beschreibung": "Beschreibung des Produkts",
      "menge": 10,
      "einheit": "Stk",
      "einzelpreisNetto": 99.00,
      "rabattProzent": 10,
      "ustSatz": 20
    }
  ],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback"
  }
}`}</pre>
          <h4 className="font-semibold text-slate-900 mb-2">Callback Response:</h4>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">{`{
  // Alle ursprünglichen Request-Daten 1:1 + Ergebnis:
  "result": {
    "angebotId": "offer_abc123",
    "angebotNummer": "AN-2024-00001",
    "pdfUrl": "https://storage.example.com/offer.pdf",
    "status": "erstellt",
    "summeNetto": 891.00,
    "summeBrutto": 1060.29
  }
}`}</pre>
        </Card>

        {/* Lieferschein-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg"><Send className="w-5 h-5 text-purple-600" /></div>
            <h2 className="text-xl font-bold text-slate-900">Lieferschein-API (LI-Cockpit)</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-purple-100 text-purple-700">POST</Badge>
            <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /api/webhooks/lieferschein</code>
          </div>
          <p className="text-slate-600 mb-4">Erstellt einen neuen Lieferschein ohne Preise - nur Positionen und Infos.</p>
          <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">{`{
  "source": "zoho",
  "entityType": "ticket",
  "ticketId": "123456789",
  "ticketNumber": "TKT-2024-00123",
  "kunde": { "name": "Musterfirma GmbH", ... },
  "lieferschein": {
    "datum": "2024-01-20",
    "referenzAngebotNummer": "AN-2024-00001",
    "erstelltDurch": "Mitarbeiter Name"
  },
  "positionen": [
    {
      "produktName": "Bewuchs entfernen",
      "beschreibung": "Einrichten der Baustelle",
      "menge": 1,
      "einheit": "Stk"
    }
  ],
  "meta": { "callbackUrl": "https://zoho.example.com/callback" }
}`}</pre>
          <div className="bg-purple-50 border border-purple-200 p-3 rounded text-sm">
            <strong className="text-purple-700">💡 Hinweis:</strong> Lieferscheine enthalten KEINE Preise, nur Positionen mit Mengen und Beschreibungen.
          </div>
        </Card>

        {/* Rechnungs-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 rounded-lg"><Receipt className="w-5 h-5 text-emerald-600" /></div>
            <h2 className="text-xl font-bold text-slate-900">Rechnungs-API (RE-Cockpit)</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-emerald-100 text-emerald-700">POST</Badge>
            <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /api/webhooks/rechnung</code>
          </div>
          <p className="text-slate-600 mb-4">Erstellt eine neue Rechnung oder aktualisiert eine bestehende basierend auf der Ticket-ID.</p>
          <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">{`{
  "source": "zoho",
  "entityType": "ticket",
  "ticketId": "123456789",
  "ticketNumber": "TKT-2024-00123",
  "rechnungstyp": "normal",
  "referenzAngebotNummer": "AN-2024-00001",
  "kunde": {
    "name": "Musterfirma GmbH",
    "strasse": "Musterstraße 1",
    "plz": "12345",
    "ort": "Musterstadt",
    "uidnummer": "ATU12345678"
  },
  "rechnung": {
    "objektBeschreibung": "Musterhaus",
    "datum": "2024-01-20",
    "arbeitstage": ["2024-01-15", "2024-01-16", "2024-01-17"],
    "zahlungskondition": "30 Tage netto",
    "zahlungszielTage": 30,
    "erstelltDurch": "Mitarbeiter Name"
  },
  "positionen": [
    {
      "pos": 1,
      "produktName": "Produkt A",
      "menge": 10,
      "einheit": "Stk",
      "einzelpreisNetto": 99.00,
      "ustSatz": 20
    }
  ],
  "meta": { "callbackUrl": "https://zoho.example.com/callback" }
}`}</pre>
          <h4 className="font-semibold text-slate-900 mb-2">Rechnungstypen:</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="outline">normal</Badge>
            <Badge variant="outline">teilrechnung</Badge>
            <Badge variant="outline">schlussrechnung</Badge>
            <Badge variant="outline">storno</Badge>
          </div>
        </Card>

        {/* Produkt-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-lg"><Package className="w-5 h-5 text-orange-600" /></div>
            <h2 className="text-xl font-bold text-slate-900">Produkt-API (Stammdaten-Sync)</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-orange-100 text-orange-700">POST</Badge>
            <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /api/webhooks/produkt</code>
          </div>
          <p className="text-slate-600 mb-4">Erstellt oder aktualisiert Produkte in der Stammdaten-Verwaltung.</p>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">{`{
  "produktname": "Höhenarbeiten Standard",
  "artikelnummer": "HA-001",
  "produktKategorie": "Dienstleistungen",
  "einheit": "Std",
  "standardpreisNetto": 85.00,
  "steuersatz": 20,
  "aktiv": true,
  "beschreibung": "Standard Höhenarbeiten pro Stunde"
}`}</pre>
        </Card>

        {/* Vermittler-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-100 rounded-lg"><Users className="w-5 h-5 text-indigo-600" /></div>
            <h2 className="text-xl font-bold text-slate-900">Vermittler-API (Stammdaten-Sync)</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-indigo-100 text-indigo-700">POST</Badge>
            <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /api/webhooks/vermittler</code>
          </div>
          <p className="text-slate-600 mb-4">Erstellt oder aktualisiert Vermittler. Bei gleicher E-Mail oder gleichem Namen wird aktualisiert.</p>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">{`{
  "name": "Max Mustermann",
  "email": "max.mustermann@example.com",
  "telefon": "+43 664 1234567",
  "provisionssatz": 10,
  "status": "aktiv"
}`}</pre>
        </Card>

        {/* Workflow */}
        <Card className="p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border-emerald-200 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔄</span> So funktioniert der Workflow
          </h3>
          <div className="space-y-4">
            {[
              { n: 1, title: 'n8n sendet Webhook an die App', desc: 'POST Request mit Angebots-/Rechnungsdaten an die Webhook-URL' },
              { n: 2, title: 'App erstellt/aktualisiert Datensatz automatisch', desc: 'Prüft ob ticketId existiert → Update, sonst Neuanlage' },
              { n: 3, title: 'PDF wird automatisch generiert', desc: 'Professionelles PDF im Lassel-Design mit Logo und allen Daten' },
              { n: 4, title: 'Callback-Webhook an deine n8n URL', desc: 'Enthält PDF-URL, Nummer, Summen → Du speicherst es in Zoho' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">{n}</div>
                <div>
                  <div className="font-semibold text-slate-900">{title}</div>
                  <div className="text-sm text-slate-600">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Hinweise */}
        <Card className="p-6 bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3">✅ Wichtige Hinweise</h3>
          <ul className="space-y-2 text-amber-800 text-sm">
            <li>• <strong>Callback URL:</strong> Muss in meta.callbackUrl angegeben werden</li>
            <li>• <strong>PDF automatisch:</strong> Wird bei jeder Erstellung/Aktualisierung generiert</li>
            <li>• <strong>Eindeutige IDs:</strong> ticketId verhindert Duplikate - bei gleicher ticketId wird aktualisiert</li>
            <li>• <strong>Nachbearbeitung:</strong> Dokumente können manuell nachbearbeitet werden</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
