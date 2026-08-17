/**
 * Prueft den Code-Node aus `angebot-aus-zoho-ticket.json` gegen nachgebaute
 * Zoho-Antworten — ohne n8n, ohne Netz, ohne echte Belege.
 *
 *   node "n8n flows/test-payload.js"
 *
 * Wer den Code-Node in n8n aendert: die neue Fassung aus dem Node hier in die
 * JSON zuruecksichern (oder die JSON neu exportieren) und diesen Test laufen
 * lassen. Er deckt genau die Faelle ab, an denen der alte Flow gescheitert ist.
 */
const fs = require('fs')
const path = require('path')

const flow = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'angebot-aus-zoho-ticket.json'), 'utf8')
)
const jsCode = flow.nodes.find((n) => n.name === 'Angebots-Payload bauen').parameters.jsCode

// Minimal-Ersatz fuer Luxon, das n8n im Code-Node bereitstellt.
const DateTime = { now: () => ({ setZone: () => ({ toISODate: () => '2026-08-17' }) }) }

/** Fuehrt den Code-Node aus. `nodes` = was jeder Vorgaenger-Node geliefert hat. */
function run(nodes) {
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Node "${name}" hat nicht ausgefuehrt`)
    return { first: () => ({ json: nodes[name] }) }
  }
  return new Function('$', 'DateTime', jsCode)($, DateTime)[0].json
}

// ---------------------------------------------------------------------------
// Testdaten: rekonstruiert aus dem Lauf vom 17.08.2026, der mit
// "record new has no field rechnungsnummer" endete.
// ---------------------------------------------------------------------------
const webhook = {
  body: {
    source: 'zoho_crm_deluge',
    event: 'angebot_vorbereitet',
    ticketId: '863322000015567033',
    reverseCharge: false,
    steuerWert: 20,
    quote: {
      Quote_Number: 'AN-0014',
      Product_Details: [{ quantity: 1, list_price: 0, tax: 20 }],
    },
  },
}

const ticket = {
  id: '863322000015567033',
  Name: '2026081408047028',
  Kunde_Gasse: { id: '863322000008498456', name: 'Stättermayergasse 22, 1150 Wien' },
  Zust_ndige_Hausverwaltung: null,
  Account_Name: 'Stättermayergasse 22, 1150 Wien',
  Rechnungsadresse_Strasse: 'Angerer Straße 16 / 3. Stock / Top 3.04',
  Rechnungsadresse_PLZ: '1210',
  Rechnungsadresse_Stadt: 'Wien',
  Ticket_erstellt_von: 'Sabine',
  E_Mail: 'iro@bittendorfer.at',
  Rechnungs_E_Mail: '',
  USt_ID: 'ATU59814400',
  UID_von_HI: '',
  Hausinhabung_HI: '',
  Rechnung_an_HI: false,
  Bezirk: '1150',
  Kunden_Typ: 'Hausverwaltung',
  Owner: { id: '863322000000496001', email: 'r.lassel@hoehenarbeiten-lassel.at', name: 'Reinhard Lassel' },
  Dienstleistung_en: ['Diverse Dienstleistungen'],
  Angebotsbemerkung: 'Außenjalousien montieren',
  Startdatum: '',
  Auftragssumme: 0,
  Projektstatus: 'Angebot in Erstellung',
  Preislisten_Typ: 'Pauschale',
  Standort_Zuweisung: 'Hetzmannsdorf',
  Fotos_Ordnerlink: 'https://workdrive.zoho.eu/folder/jezaf76c3c2',
  Workdrive_Link: 'https://workdrive.zoho.eu/folder/74u3m094',
  Layout: { id: '863322000002416159' },
  Lat: 48.197668,
  Lng: 16.327722,
}

const gruen = []
const rot = []
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll)
  ;(ok ? gruen : rot).push(
    `${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(ist)}` +
      (ok ? '' : `  (erwartet ${JSON.stringify(soll)})`)
  )
}

const fehler = { error: 'Request failed with status code 404' }

// 1 — der Realfall: HV-Lookup leer, Account-Abfrage laeuft ins Leere
const p1 = run({
  Webhook: webhook,
  'Ticket laden': { data: [ticket] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('kunde.name faellt auf Account zurueck', p1.kunde.name, 'Stättermayergasse 22, 1150 Wien')
pruefe('Rechnungsadresse aus Ticket', p1.kunde.strasse, 'Angerer Straße 16 / 3. Stock / Top 3.04')
pruefe('Objektadresse zerlegt', [p1.kunde.objektAdresse.strasse, p1.kunde.objektAdresse.plz, p1.kunde.objektAdresse.ort], ['Stättermayergasse 22', '1150', 'Wien'])
pruefe('Angebotsdatum = heute', p1.angebot.datum, '2026-08-17')
pruefe('gueltigBis bleibt der Plattform', p1.angebot.gueltigBis, undefined)
pruefe('callbackUrl entfernt', p1.meta.callbackUrl, undefined)
pruefe('Steuersatz', p1.positionen[0].ustSatz, 20)
pruefe('Quellen-Diagnose', p1.meta.quellen, { kundeGeladen: false, hausverwaltungGeladen: false })

// 2 — HV und Account werden geladen (das verschluckte der alte Merge)
const p2 = run({
  Webhook: webhook,
  'Ticket laden': { data: [{ ...ticket, Zust_ndige_Hausverwaltung: { id: '99', name: 'HV Muster' }, Rechnungsadresse_Strasse: '', Rechnungsadresse_PLZ: '', Rechnungsadresse_Stadt: '' }] },
  'Kunde laden': { data: [{ id: '863322000008498456', Account_Name: 'Stättermayergasse 22, 1150 Wien', Billing_Street: 'Stättermayergasse 22', Billing_Code: '1150', Billing_City: 'Wien' }] },
  'Hausverwaltung laden': { data: [{ id: '99', Name: 'Bittendorfer Immobilien GmbH', Billing_Street: 'Angerer Straße 16', Billing_Code: '1210', Billing_City: 'Wien', Phone: '+43 1 2345678' }] },
})
pruefe('kunde.name = Hausverwaltung', p2.kunde.name, 'Bittendorfer Immobilien GmbH')
pruefe('Rechnungsadresse aus HV', [p2.kunde.strasse, p2.kunde.plz, p2.kunde.ort], ['Angerer Straße 16', '1210', 'Wien'])
pruefe('Telefon aus HV', p2.kunde.telefon, '+43 1 2345678')
pruefe('Quellen-Diagnose', p2.meta.quellen, { kundeGeladen: true, hausverwaltungGeladen: true })

// 3 — Reverse Charge
const p3 = run({
  Webhook: { body: { ...webhook.body, reverseCharge: true, steuerWert: 0 } },
  'Ticket laden': { data: [ticket] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('reverseCharge durchgereicht', p3.angebot.reverseCharge, true)
pruefe('USt bei RC = 0', p3.positionen[0].ustSatz, 0)

// 4 — 10 % darf nicht auf 20 springen
const p4 = run({
  Webhook: { body: { ...webhook.body, steuerWert: 10 } },
  'Ticket laden': { data: [ticket] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('Steuersatz 10 bleibt 10', p4.positionen[0].ustSatz, 10)

// 5 — mehrere Dienstleistungen, Preise aus dem Quote
const p5 = run({
  Webhook: { body: { ...webhook.body, quote: { Product_Details: [{ quantity: 2, list_price: 450 }, { quantity: 1, list_price: 0 }] } } },
  'Ticket laden': { data: [{ ...ticket, Dienstleistung_en: ['Fassadenreinigung', 'Jalousienmontage', 'Entsorgung'] }] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('drei Positionen', p5.positionen.map((p) => p.produktName), ['Fassadenreinigung', 'Jalousienmontage', 'Entsorgung'])
pruefe('Menge/Preis aus Quote', [p5.positionen[0].menge, p5.positionen[0].einzelpreisNetto], [2, 450])
pruefe('ohne Quote-Zeile: Standard', [p5.positionen[2].menge, p5.positionen[2].einzelpreisNetto], [1, 0])

// 6 — gar keine Dienstleistung im Ticket
const p6 = run({
  Webhook: webhook,
  'Ticket laden': { data: [{ ...ticket, Dienstleistung_en: undefined }] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('Ersatzposition', p6.positionen.length, 1)
pruefe('Ersatzname', p6.positionen[0].produktName, 'Dienstleistung')

// 7 — Ticket nicht ladbar: muss laut abbrechen statt Muell zu senden
let geworfen = ''
try {
  run({ Webhook: webhook, 'Ticket laden': { error: 'timeout' }, 'Kunde laden': fehler, 'Hausverwaltung laden': fehler })
} catch (e) {
  geworfen = e.message
}
pruefe('Abbruch ohne Ticket', geworfen.includes('konnte nicht aus Zoho geladen werden'), true)

// 8 — Nebenknoten wurden gar nicht ausgefuehrt ($() wirft)
const p8 = run({ Webhook: webhook, 'Ticket laden': { data: [ticket] } })
pruefe('laeuft auch ohne Nebenknoten', p8.kunde.name, 'Stättermayergasse 22, 1150 Wien')

// 9 — Zoho liefert Lookups als String statt als Objekt
const p9 = run({
  Webhook: webhook,
  'Ticket laden': { data: [{ ...ticket, Kunde_Gasse: 'Musterweg 1, 1010 Wien', Owner: 'Reinhard Lassel', Zust_ndige_Hausverwaltung: 'HV Text' }] },
  'Kunde laden': fehler,
  'Hausverwaltung laden': fehler,
})
pruefe('Gasse als String', p9.kunde.objektAdresse.gasse, 'Musterweg 1, 1010 Wien')
pruefe('HV als String', p9.kunde.name, 'HV Text')
pruefe('Owner als String', p9.angebot.erstelltDurch, 'Reinhard Lassel')

console.log(gruen.join('\n'))
if (rot.length) {
  console.log('\n' + rot.join('\n'))
  console.log(`\n${rot.length} FEHLER, ${gruen.length} ok`)
  process.exit(1)
}
console.log(`\nAlle ${gruen.length} Pruefungen gruen.`)
