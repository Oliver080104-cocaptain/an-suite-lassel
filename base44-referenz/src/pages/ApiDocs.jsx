import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Send, FileText, Receipt, Package, Users } from "lucide-react";
import PageHeader from '../components/shared/PageHeader';

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="API Dokumentation"
          subtitle="Webhook-Integration mit n8n/Zoho"
        />
        
        {/* Quick Start Guide */}
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-emerald-50 border-blue-200">
          <h2 className="text-xl font-bold text-slate-900 mb-4">🚀 Quick Start</h2>
          <div className="space-y-3 text-sm">
            <div><strong>1. Webhook URLs holen:</strong></div>
            <div className="ml-4 bg-white p-3 rounded border border-blue-200">
              <div className="text-sm mb-3">
                <strong>Option A:</strong> Dashboard → Code → Functions → Function auswählen → Oben rechts "View Endpoint" Button
              </div>
              <div className="text-sm mb-3">
                <strong>Option B:</strong> Die URL-Struktur ist:
              </div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded mb-2 break-all">
                https://eu-central-1.base44.run/v1/apps/6937375d862a164b90207fd3/functions/offerWebhook
              </div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded mb-2 break-all">
                https://eu-central-1.base44.run/v1/apps/6937375d862a164b90207fd3/functions/deliveryNoteWebhook
              </div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded mb-2 break-all">
                https://eu-central-1.base44.run/v1/apps/6937375d862a164b90207fd3/functions/invoiceWebhook
              </div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded mb-2 break-all">
                https://eu-central-1.base44.run/v1/apps/6937375d862a164b90207fd3/functions/productWebhook
              </div>
              <div className="font-mono text-xs bg-slate-50 p-2 rounded break-all">
                https://eu-central-1.base44.run/v1/apps/6937375d862a164b90207fd3/functions/vermittlerWebhook
              </div>
              <div className="text-xs text-slate-500 mt-2">
                (Region: eu-central-1)
              </div>
            </div>
            <div><strong>2. Callback URL (Response Webhook):</strong></div>
            <div className="ml-4 bg-emerald-50 p-3 rounded border border-emerald-200">
              <code className="text-xs break-all">https://lasselgmbh.app.n8n.cloud/webhook-test/190e70b8-6851-43a7-9025-50afe3028639</code>
              <div className="text-xs text-slate-600 mt-1">✅ Bereits im Code hinterlegt - Responses kommen automatisch hier an!</div>
            </div>
            <div><strong>3. Logs ansehen:</strong> Dashboard → Code → Functions → [Function Name] → "Logs" Tab</div>
            <div><strong>4. Keine API-Keys nötig:</strong> Die Functions sind öffentlich zugänglich (Service Role)</div>
          </div>
        </Card>

        {/* Angebots-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Angebots-API (AN-Cockpit)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-emerald-100 text-emerald-700">POST</Badge>
                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /offerWebhook</code>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                📍 URL findest du unter: Dashboard → Code → Functions → offerWebhook → "View Endpoint"
              </p>
              <p className="text-slate-600 mb-4">
                Erstellt ein neues Angebot oder öffnet ein bestehendes basierend auf der Ticket-ID.
              </p>
              
              <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">
{`{
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
    "emailAngebot": "angebote@beispiel.at",
    "emailRechnung": "rechnungen@beispiel.at",
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
      "ustSatz": 19
    }
  ],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback"
  }
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2">Optionale Felder:</h4>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded mb-4 text-sm">
                <strong className="text-blue-700">💡 Erweiterte Felder:</strong>
                <ul className="mt-2 space-y-1 ml-4">
                  <li>• <code>kunde.uidnummer</code> - UID-Nummer des Kunden (z.B. ATU12345678)</li>
                  <li>• <code>kunde.email</code> - Allgemeine Kunden-E-Mail</li>
                  <li>• <code>kunde.emailAngebot</code> - Spezifische E-Mail für Angebote (optional, falls abweichend)</li>
                  <li>• <code>kunde.emailRechnung</code> - Spezifische E-Mail für Rechnungen (optional, falls abweichend)</li>
                </ul>
                <p className="mt-2">Falls emailAngebot/emailRechnung nicht angegeben, wird email als Fallback verwendet.</p>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Callback Response (nach PDF-Erzeugung):</h4>
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded mb-2 text-sm">
                <strong className="text-emerald-700">💡 Wichtig:</strong> Der Callback liefert ALLE ursprünglichen Request-Daten 1:1 zurück + Ergebnis in separatem "result" Objekt.
              </div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  // Alle ursprünglichen Request-Daten 1:1:
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
    "emailAngebot": "angebote@beispiel.at",
    "emailRechnung": "rechnungen@beispiel.at",
    "uidnummer": "ATU12345678"
  },
  "angebot": {
    "datum": "2024-01-15",
    "gueltigBis": "2024-02-15",
    "erstelltDurch": "Mitarbeiter Name",
    "bemerkung": "Optionale Bemerkung",
    "skizzenLink": "https://workdrive.zoho.eu/folder/abc123"
  },
  "positionen": [...],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback"
  },
  
  // Generierte Daten in separatem Objekt:
  "result": {
    "ticketIdentifikation": "123456789",
    "angebotId": "offer_abc123",
    "angebotNummer": "AN-2024-00001",
    "pdfUrl": "https://storage.example.com/offer.pdf",
    "status": "erstellt",
    "summeNetto": 891.00,
    "summeUst": 169.29,
    "summeBrutto": 1060.29
  }
}`}
              </pre>
            </div>
          </div>
        </Card>

        {/* Lieferschein-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Send className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Lieferschein-API (LI-Cockpit)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-purple-100 text-purple-700">POST</Badge>
                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /deliveryNoteWebhook</code>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                📍 URL findest du unter: Dashboard → Code → Functions → deliveryNoteWebhook → "View Endpoint"
              </p>
              <p className="text-slate-600 mb-4">
                Erstellt einen neuen Lieferschein ohne Preise - nur Positionen und Infos.
              </p>
              
              <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">
{`{
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
    "emailAngebot": "angebote@beispiel.at",
    "emailRechnung": "rechnungen@beispiel.at",
    "uidnummer": "ATU12345678"
  },
  "lieferschein": {
    "datum": "2024-01-20",
    "referenzAngebotNummer": "AN-2024-00001",
    "referenzAngebotId": "offer_abc123",
    "geschaeftsfallNummer": "GF1000299",
    "erstelltDurch": "Mitarbeiter Name"
  },
  "positionen": [
    {
      "produktName": "Bewuchs entfernen",
      "beschreibung": "Einrichten der Baustelle\\nBewuchs im Bereich der Terrasse wie in Skizzen ersichtlich entfernen\\nVertragen und Entsorgen des Grünschnitts",
      "menge": 1,
      "einheit": "Stk"
    }
  ],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback"
  }
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2">Callback Response:</h4>
              <div className="bg-purple-50 border border-purple-200 p-3 rounded mb-2 text-sm">
                <strong className="text-purple-700">💡 Wichtig:</strong> Lieferscheine enthalten KEINE Preise, nur Positionen mit Mengen und Beschreibungen.
              </div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  // Alle ursprünglichen Request-Daten 1:1:
  "source": "zoho",
  "entityType": "ticket",
  "ticketId": "123456789",
  "ticketNumber": "TKT-2024-00123",
  "kunde": { ... },
  "lieferschein": { ... },
  "positionen": [...],
  "meta": { ... },
  
  // Generierte Daten in separatem Objekt:
  "result": {
    "ticketIdentifikation": "123456789",
    "lieferscheinId": "dn_xyz789",
    "lieferscheinNummer": "LI-2024-00001",
    "pdfUrl": "https://storage.example.com/delivery.pdf",
    "status": "erstellt"
  }
}`}
              </pre>
            </div>
          </div>
        </Card>

        {/* Rechnungs-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Rechnungs-API (RE-Cockpit)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-emerald-100 text-emerald-700">POST</Badge>
                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /invoiceWebhook</code>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                📍 URL findest du unter: Dashboard → Code → Functions → invoiceWebhook → "View Endpoint"
              </p>
              <p className="text-slate-600 mb-4">
                Erstellt eine neue Rechnung oder aktualisiert eine bestehende basierend auf der Ticket-ID.
              </p>
              
              <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">
{`{
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
    "ansprechpartner": "Max Mustermann",
    "email": "kunde@beispiel.at",
    "emailRechnung": "rechnungen@beispiel.at",
    "uidnummer": "ATU12345678",
    "objektAdresse": {
      "strasse": "Objektstraße 10",
      "plz": "54321",
      "ort": "Objektstadt"
    }
  },
  "rechnung": {
    "objektBeschreibung": "Musterhaus",
    "datum": "2024-01-20",
    "leistungszeitraumVon": "2024-01-15",
    "leistungszeitraumBis": "2024-01-19",
    "arbeitstage": ["2024-01-15", "2024-01-16", "2024-01-17"],
    "zahlungskondition": "30 Tage netto",
    "zahlungszielTage": 30,
    "erstelltDurch": "Mitarbeiter Name",
    "bemerkung": "Abschlusstext für Rechnung",
    "fotosLink": "https://workdrive.zoho.eu/folder/fotos123",
    "fotodokuOrdnerlink": "https://workdrive.zoho.eu/folder/fotodoku456"
  },
  "positionen": [
    {
      "pos": 1,
      "produktName": "Produkt A",
      "beschreibung": "Beschreibung",
      "menge": 10,
      "einheit": "Stk",
      "einzelpreisNetto": 99.00,
      "rabattProzent": 10,
      "ustSatz": 20
    }
  ],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback",
    "zoho": {
      "hausinhabung": "Hausverwaltung Musterfirma",
      "hausverwaltungName": "HV Immobilien GmbH",
      "hausverwaltungStrasse": "HV-Straße 5",
      "hausverwaltungPlz": "98765",
      "hausverwaltungOrt": "HV-Stadt"
    }
  }
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2">E-Mail-Felder:</h4>
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded mb-4 text-sm">
                <strong className="text-emerald-700">📧 E-Mail-Verwaltung:</strong>
                <ul className="mt-2 space-y-1 ml-4">
                  <li>• <code>kunde.uidnummer</code> - UID-Nummer des Kunden (z.B. ATU12345678)</li>
                  <li>• <code>kunde.email</code> - Allgemeine Kunden-E-Mail</li>
                  <li>• <code>kunde.emailRechnung</code> - Spezifische E-Mail für Rechnungen (optional, falls abweichend)</li>
                </ul>
                <p className="mt-2">Falls emailRechnung nicht angegeben, wird email als Fallback verwendet.</p>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Rechnungstypen:</h4>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">normal</Badge>
                <Badge variant="outline">teilrechnung</Badge>
                <Badge variant="outline">schlussrechnung</Badge>
                <Badge variant="outline">storno</Badge>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Optionale Felder:</h4>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded mb-4 text-sm">
                <strong className="text-blue-700">💡 Erweiterte Felder:</strong>
                <ul className="mt-2 space-y-1 ml-4">
                  <li>• <code>rechnung.leistungszeitraumVon</code> / <code>leistungszeitraumBis</code> - Zeitraum der Leistungserbringung</li>
                  <li>• <code>rechnung.arbeitstage</code> - Array von Arbeitstagen (Format: YYYY-MM-DD)</li>
                  <li>• <code>rechnung.bemerkung</code> - Abschlusstext für die Rechnung</li>
                  <li>• <code>meta.zoho.hausinhabung</code> - Hausinhabung (HI) für Rechnungsadresse</li>
                  <li>• <code>meta.zoho.hausverwaltung*</code> - Hausverwaltungsdaten (Name, Straße, PLZ, Ort)</li>
                </ul>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Callback Response (nach PDF-Erzeugung):</h4>
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded mb-2 text-sm">
                <strong className="text-emerald-700">💡 Wichtig:</strong> Der Callback liefert ALLE ursprünglichen Request-Daten 1:1 zurück + Ergebnis in separatem "result" Objekt.
              </div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  // Alle ursprünglichen Request-Daten 1:1:
  "source": "zoho",
  "entityType": "ticket",
  "ticketId": "123456789",
  "ticketNumber": "TKT-2024-00123",
  "referenzAngebotNummer": "AN-2024-00001",
  "kunde": {
    "name": "Musterfirma GmbH",
    "strasse": "Musterstraße 1",
    "plz": "12345",
    "ort": "Musterstadt",
    "ansprechpartner": "Max Mustermann",
    "email": "kunde@beispiel.at",
    "emailRechnung": "rechnungen@beispiel.at",
    "uidnummer": "ATU12345678",
    "objektAdresse": {
      "strasse": "Objektstraße 10",
      "plz": "54321",
      "ort": "Objektstadt"
    }
  },
  "rechnung": {
    "objektBeschreibung": "Musterhaus",
    "datum": "2024-01-20",
    "leistungszeitraumVon": "2024-01-15",
    "leistungszeitraumBis": "2024-01-19",
    "arbeitstage": ["2024-01-15", "2024-01-16", "2024-01-17"],
    "zahlungskondition": "30 Tage netto",
    "zahlungszielTage": 30,
    "erstelltDurch": "Mitarbeiter Name",
    "bemerkung": "Abschlusstext für Rechnung",
    "fotosLink": "https://workdrive.zoho.eu/folder/fotos123",
    "fotodokuOrdnerlink": "https://workdrive.zoho.eu/folder/fotodoku456"
  },
  "positionen": [...],
  "meta": {
    "workdriveFolderId": "abc123",
    "callbackUrl": "https://zoho.example.com/callback",
    "zoho": {
      "hausinhabung": "Hausverwaltung Musterfirma",
      "hausverwaltungName": "HV Immobilien GmbH",
      "hausverwaltungStrasse": "HV-Straße 5",
      "hausverwaltungPlz": "98765",
      "hausverwaltungOrt": "HV-Stadt"
    }
  },
  
  // Generierte Daten in separatem Objekt:
  "result": {
    "ticketIdentifikation": "123456789",
    "rechnungId": "invoice_xyz789",
    "rechnungsNummer": "RE-2024-00001",
    "rechnungstyp": "normal",
    "pdfUrl": "https://storage.example.com/invoice.pdf",
    "status": "offen",
    "summeNetto": 891.00,
    "summeUst": 169.29,
    "summeBrutto": 1060.29,
    "faelligAm": "2024-02-03",
    "isUpdate": false
  }
}`}
              </pre>
            </div>
          </div>
        </Card>

        {/* Produkt-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Produkt-API (Stammdaten-Sync)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-orange-100 text-orange-700">POST</Badge>
                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /productWebhook</code>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                📍 URL findest du unter: Dashboard → Code → Functions → productWebhook → "View Endpoint"
              </p>
              <p className="text-slate-600 mb-4">
                Erstellt oder aktualisiert Produkte in der Stammdaten-Verwaltung. Bei vorhandener Artikelnummer oder gleichem Namen wird das Produkt aktualisiert.
              </p>
              
              <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">
{`{
  "produktname": "Höhenarbeiten Standard",
  "artikelnummer": "HA-001",
  "produktKategorie": "Dienstleistungen",
  "produkttyp": "dienstleistung",
  "einheit": "Std",
  "standardpreisNetto": 85.00,
  "steuersatz": 20,
  "steuerpflichtig": true,
  "aktiv": true,
  "beschreibung": "Standard Höhenarbeiten pro Stunde",
  "standarddauer": 1,
  "einkaufspreis": 45.00,
  "materialbedarf": "Sicherungsausrüstung"
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2">Pflichtfelder:</h4>
              <div className="bg-orange-50 border border-orange-200 p-3 rounded mb-4 text-sm">
                <strong className="text-orange-700">Mindestens erforderlich:</strong> produktname oder name
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Optionale Felder mit Defaults:</h4>
              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div className="bg-slate-50 p-2 rounded">produkttyp: "dienstleistung"</div>
                <div className="bg-slate-50 p-2 rounded">einheit: "Stk"</div>
                <div className="bg-slate-50 p-2 rounded">steuersatz: 20</div>
                <div className="bg-slate-50 p-2 rounded">steuerpflichtig: true</div>
                <div className="bg-slate-50 p-2 rounded">aktiv: true</div>
                <div className="bg-slate-50 p-2 rounded">standardpreisNetto: 0</div>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Response (Erfolg):</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "success": true,
  "action": "created",  // oder "updated"
  "product": {
    "id": "prod_abc123",
    "produktName": "Höhenarbeiten Standard",
    "artikelnummer": "HA-001",
    "produktKategorie": "Dienstleistungen",
    "produkttyp": "dienstleistung",
    "einheit": "Std",
    "standardpreisNetto": 85.00,
    "steuersatz": 20,
    "steuerpflichtig": true,
    "aktiv": true,
    "beschreibung": "Standard Höhenarbeiten pro Stunde",
    "created_date": "2024-01-15T10:30:00Z",
    "updated_date": "2024-01-15T10:30:00Z"
  }
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2 mt-4">Bulk-Import via CSV:</h4>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">
                <strong className="text-blue-700">💡 Tipp:</strong> Für den Import mehrerer Produkte nutze die CSV-Import-Funktion im Dashboard unter "Produkte" → "Produkte importieren". Unterstützt folgende Spalten: Eintrag-ID, Produktname, Produkt Aktiv, Produkt Kategorie, Einheit, Beschreibung
              </div>
            </div>
          </div>
        </Card>

        {/* Vermittler-API */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Vermittler-API (Stammdaten-Sync)</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-indigo-100 text-indigo-700">POST</Badge>
                <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded">POST /vermittlerWebhook</code>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                📍 URL findest du unter: Dashboard → Code → Functions → vermittlerWebhook → "View Endpoint"
              </p>
              <p className="text-slate-600 mb-4">
                Erstellt oder aktualisiert Vermittler in der Stammdaten-Verwaltung. Bei vorhandener E-Mail-Adresse oder gleichem Namen wird der Vermittler aktualisiert.
              </p>
              
              <h4 className="font-semibold text-slate-900 mb-2">Request Body:</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm mb-4">
{`{
  "name": "Max Mustermann",
  "email": "max.mustermann@example.com",
  "telefon": "+43 664 1234567",
  "provisionssatz": 10,
  "status": "aktiv",
  "notizen": "Wichtiger Geschäftspartner seit 2020"
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2">Pflichtfelder:</h4>
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded mb-4 text-sm">
                <strong className="text-indigo-700">Mindestens erforderlich:</strong> name
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Optionale Felder mit Defaults:</h4>
              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div className="bg-slate-50 p-2 rounded">provisionssatz: 10</div>
                <div className="bg-slate-50 p-2 rounded">status: "aktiv"</div>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Status-Werte:</h4>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline">aktiv</Badge>
                <Badge variant="outline">inaktiv</Badge>
              </div>

              <h4 className="font-semibold text-slate-900 mb-2">Response (Erfolg):</h4>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "success": true,
  "action": "created",  // oder "updated"
  "vermittler": {
    "id": "verm_abc123",
    "name": "Max Mustermann",
    "email": "max.mustermann@example.com",
    "telefon": "+43 664 1234567",
    "provisionssatz": 10,
    "status": "aktiv",
    "notizen": "Wichtiger Geschäftspartner seit 2020",
    "created_date": "2024-01-15T10:30:00Z",
    "updated_date": "2024-01-15T10:30:00Z"
  }
}`}
              </pre>

              <h4 className="font-semibold text-slate-900 mb-2 mt-4">Update-Logik:</h4>
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded text-sm">
                <strong className="text-indigo-700">💡 Wichtig:</strong> Ein Vermittler wird aktualisiert, wenn ein Eintrag mit der gleichen E-Mail-Adresse oder dem gleichen Namen bereits existiert. Andernfalls wird ein neuer Vermittler angelegt.
              </div>
            </div>
          </div>
        </Card>

        {/* Workflow Erklärung */}
        <Card className="p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border-emerald-200 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔄</span> So funktioniert der Workflow
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">1</div>
              <div>
                <div className="font-semibold text-slate-900">n8n sendet Webhook an deine Backend-Funktion</div>
                <div className="text-sm text-slate-600">POST Request mit Angebots-/Rechnungsdaten an die Function URL</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">2</div>
              <div>
                <div className="font-semibold text-slate-900">Backend erstellt/aktualisiert Angebot automatisch</div>
                <div className="text-sm text-slate-600">Prüft ob ticketId existiert → Update, sonst Neuanlage</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">3</div>
              <div>
                <div className="font-semibold text-slate-900">PDF wird automatisch generiert</div>
                <div className="text-sm text-slate-600">Professionelles PDF im Lassel-Design mit Logo und allen Daten</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">4</div>
              <div>
                <div className="font-semibold text-slate-900">Callback-Webhook an deine n8n URL</div>
                <div className="text-sm text-slate-600">Enthält PDF-URL, Angebotsnummer, Summen → Du speicherst es in Zoho</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold flex-shrink-0">✓</div>
              <div>
                <div className="font-semibold text-slate-900">Nachbearbeitung im Dashboard möglich</div>
                <div className="text-sm text-slate-600">Bei jeder Speicherung wird erneut Callback gesendet</div>
              </div>
            </div>
          </div>
        </Card>
        
        {/* Hinweise */}
        <Card className="p-6 bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3">✅ Wichtige Hinweise</h3>
          <ul className="space-y-2 text-amber-800 text-sm">
            <li>• <strong>Logs ansehen:</strong> Dashboard → Code → Functions → [Function] → Logs Tab - siehst du alle Requests live</li>
            <li>• <strong>Callback URL:</strong> Muss in meta.callbackUrl angegeben werden - dorthin sendet die App das Ergebnis</li>
            <li>• <strong>PDF automatisch:</strong> Wird bei jeder Erstellung/Aktualisierung automatisch generiert</li>
            <li>• <strong>Eindeutige IDs:</strong> ticketId verhindert Duplikate - bei gleicher ticketId wird aktualisiert statt neu erstellt</li>
            <li>• <strong>Nachbearbeitung:</strong> Angebote können im Dashboard manuell nachbearbeitet werden, bei Speichern erfolgt erneuter Callback</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}