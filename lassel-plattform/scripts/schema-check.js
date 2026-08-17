/**
 * Vergleicht jeden Supabase-Zugriff im Code gegen das ECHTE Schema der
 * Produktionsdatenbank.
 *
 *   npm run schema-check
 *
 * WARUM ES DAS GIBT
 * Das Repo-Schema ist nicht die Wahrheit: `supabase/schema.sql` und die
 * Migrationen beschreiben nicht den Ist-Stand der Produktionsdatenbank.
 * Schreibt oder liest der Code eine Spalte, die es dort nicht gibt, faellt
 * das nicht beim Bauen auf, sondern erst beim Anwender — und dann faellt der
 * KOMPLETTE Vorgang aus, nicht nur das eine Feld. Am 17.08.2026 sind daran
 * nacheinander drei Dinge gescheitert: Angebot speichern (produkt_id),
 * Angebotsstatus setzen (Enum) und Zahlung erfassen (bezahlt_betrag).
 *
 * WAS GEPRUEFT WIRD
 *   A) insert/update/upsert schreibt eine Spalte, die es nicht gibt
 *      -> "Could not find the 'x' column of 'y' in the schema cache"
 *   B) Filter, order oder select referenziert eine Spalte, die es nicht gibt
 *      -> PostgREST 400, meist eine dauerhaft leere Liste
 *   C) ein String-Literal geht in eine ENUM-Spalte, die ihn nicht kennt
 *      -> "invalid input value for enum"
 *   D) .from('tabelle') auf eine Tabelle, die es nicht gibt
 *
 * Das Schema kommt live aus der OpenAPI-Definition von PostgREST — rein
 * lesend, ohne jeden Schreibzugriff. Zugangsdaten aus `.env.local`.
 *
 * GRENZEN
 * Payloads, die sich nicht statisch aufloesen lassen (Spread eines
 * State-Objekts o.ae.), werden am Ende als "ungeprueft" gelistet. Wer dort
 * etwas aendert, prueft von Hand. Exit-Code 1 bei mindestens einem Befund.
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const WURZEL = path.join(__dirname, '..')
const SRC = path.join(WURZEL, 'src')

const FILTER_METHODEN = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'order', 'not'])
const SCHREIB_METHODEN = new Set(['insert', 'update', 'upsert'])

function env() {
  const datei = path.join(WURZEL, '.env.local')
  if (!fs.existsSync(datei)) {
    console.error('.env.local nicht gefunden — ohne Zugangsdaten kein Schemaabgleich.')
    process.exit(2)
  }
  const out = {}
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(zeile.trim())
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function schemaLaden() {
  const e = env()
  const url = e.NEXT_PUBLIC_SUPABASE_URL
  const key = e.SUPABASE_SERVICE_ROLE_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  })
  if (!res.ok) throw new Error(`Schema nicht abrufbar: ${res.status}`)
  const spec = await res.json()
  const schema = {}
  for (const [tabelle, def] of Object.entries(spec.definitions || {})) {
    schema[tabelle] = {}
    for (const [spalte, meta] of Object.entries(def.properties || {})) {
      schema[tabelle][spalte] = { enum: meta.enum || null }
    }
  }
  return schema
}

function dateien(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...dateien(p))
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** Findet in der Aufrufkette links vom Methodenaufruf das .from('tabelle'). */
function tabelleAusKette(node) {
  let cur = node
  for (let i = 0; i < 40 && cur; i++) {
    if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) &&
        cur.expression.name.text === 'from' && cur.arguments.length &&
        ts.isStringLiteral(cur.arguments[0])) return cur.arguments[0].text
    if (ts.isCallExpression(cur)) cur = cur.expression
    else if (ts.isPropertyAccessExpression(cur)) cur = cur.expression
    else return null
  }
  return null
}

function keysAusObjekt(obj, sink) {
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) { sink.spread = true; continue }
    if (!p.name) continue
    if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) {
      sink.keys.add(p.name.text)
      const init = ts.isPropertyAssignment(p) ? p.initializer : null
      if (init && ts.isStringLiteral(init)) sink.literale.set(p.name.text, init.text)
    } else sink.spread = true
  }
}

/** Loest ein Argument (Objekt, Array, Identifier, Funktion, .map) zu Feldnamen auf. */
function keysAusArgument(arg, sf, tiefe = 0) {
  const sink = { keys: new Set(), literale: new Map(), spread: false, opak: false }
  if (!arg || tiefe > 3) { if (arg) sink.opak = true; return sink }

  const uebernehmen = (s) => {
    s.keys.forEach((k) => sink.keys.add(k))
    s.literale.forEach((v, k) => sink.literale.set(k, v))
    sink.spread ||= s.spread; sink.opak ||= s.opak
  }

  if (ts.isObjectLiteralExpression(arg)) { keysAusObjekt(arg, sink); return sink }

  if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg) || ts.isFunctionDeclaration(arg)) {
    const body = arg.body
    if (!body) { sink.opak = true; return sink }
    if (!ts.isBlock(body)) {
      return keysAusArgument(ts.isParenthesizedExpression(body) ? body.expression : body, sf, tiefe)
    }
    const sammle = (m) => {
      if (ts.isReturnStatement(m) && m.expression) uebernehmen(keysAusArgument(m.expression, sf, tiefe + 1))
      m.forEachChild(sammle)
    }
    body.forEachChild(sammle)
    return sink
  }

  if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) uebernehmen(keysAusArgument(el, sf, tiefe + 1))
    return sink
  }

  if (ts.isCallExpression(arg) && ts.isPropertyAccessExpression(arg.expression) &&
      arg.expression.name.text === 'map' && arg.arguments.length) {
    const cb = arg.arguments[0]
    if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) return keysAusArgument(cb, sf, tiefe)
    sink.opak = true
    return sink
  }

  let name = null
  if (ts.isIdentifier(arg)) name = arg.text
  else if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) name = arg.expression.text
  if (!name) { sink.opak = true; return sink }

  let gefunden = false
  const besuche = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer) {
      gefunden = true
      uebernehmen(keysAusArgument(n.initializer, sf, tiefe + 1))
    }
    if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) {
      gefunden = true
      uebernehmen(keysAusArgument(n, sf, tiefe + 1))
    }
    n.forEachChild(besuche)
  }
  besuche(sf)

  // Nachtraegliche Zuweisungen:  data.foo = …  /  data['foo'] = …
  const zuweisungen = (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const l = n.left
      if (ts.isPropertyAccessExpression(l) && ts.isIdentifier(l.expression) && l.expression.text === name) {
        sink.keys.add(l.name.text)
        if (ts.isStringLiteral(n.right)) sink.literale.set(l.name.text, n.right.text)
      }
      if (ts.isElementAccessExpression(l) && ts.isIdentifier(l.expression) &&
          l.expression.text === name && l.argumentExpression && ts.isStringLiteral(l.argumentExpression)) {
        sink.keys.add(l.argumentExpression.text)
      }
    }
    n.forEachChild(zuweisungen)
  }
  zuweisungen(sf)

  if (!gefunden && sink.keys.size === 0) sink.opak = true
  return sink
}

async function main() {
  const SCHEMA = await schemaLaden()
  console.log(`Schema geladen: ${Object.keys(SCHEMA).length} Tabellen\n`)

  const befunde = []
  const ungeprueft = []

  for (const datei of dateien(SRC)) {
    const text = fs.readFileSync(datei, 'utf8')
    const sf = ts.createSourceFile(datei, text, ts.ScriptTarget.Latest, true,
      /\.tsx$/.test(datei) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const rel = path.relative(WURZEL, datei).replace(/\\/g, '/')

    const walk = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methode = node.expression.name.text
        const zeile = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        const tabelle = tabelleAusKette(node.expression.expression)
        const spalten = tabelle ? SCHEMA[tabelle] : null

        if (tabelle && !spalten && (SCHREIB_METHODEN.has(methode) || methode === 'select')) {
          befunde.push({ art: 'D-unbekannte-tabelle', rel, zeile, tabelle, detail: methode })
        }

        if (SCHREIB_METHODEN.has(methode) && node.arguments.length && spalten) {
          const s = keysAusArgument(node.arguments[0], sf)
          for (const k of s.keys) {
            if (!(k in spalten)) befunde.push({ art: 'A-schreibt-unbekannte-spalte', rel, zeile, tabelle, detail: k })
          }
          for (const [k, v] of s.literale) {
            const meta = spalten[k]
            if (meta?.enum && !meta.enum.includes(v)) {
              befunde.push({ art: 'C-unbekannter-enum-wert', rel, zeile, tabelle, detail: `${k}='${v}' erlaubt: ${meta.enum.join('|')}` })
            }
          }
          if (s.opak) ungeprueft.push({ rel, zeile, tabelle, methode, anzahl: s.keys.size })
        }

        if (FILTER_METHODEN.has(methode) && spalten && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
          const spalte = node.arguments[0].text.split('.')[0].split('->')[0].trim()
          if (spalte && !spalte.includes('(') && !(spalte in spalten)) {
            befunde.push({ art: 'B-filter-auf-unbekannte-spalte', rel, zeile, tabelle, detail: `${methode}('${spalte}')` })
          }
          const meta = spalten[spalte]
          const wert = node.arguments[1]
          if ((methode === 'eq' || methode === 'is') && meta?.enum && wert && ts.isStringLiteral(wert) && !meta.enum.includes(wert.text)) {
            befunde.push({ art: 'C-filter-enum-wert', rel, zeile, tabelle, detail: `${spalte}='${wert.text}' erlaubt: ${meta.enum.join('|')}` })
          }
        }

        if (methode === 'select' && spalten && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
          const roh = node.arguments[0].text
          if (roh !== '*' && !roh.includes('(')) {
            for (const teil of roh.split(',').map((x) => x.trim()).filter(Boolean)) {
              const spalte = teil.split(':').pop().trim()
              if (spalte && spalte !== '*' && !(spalte in spalten)) {
                befunde.push({ art: 'B-select-unbekannte-spalte', rel, zeile, tabelle, detail: spalte })
              }
            }
          }
        }
      }
      node.forEachChild(walk)
    }
    walk(sf)
  }

  const gruppen = {}
  for (const b of befunde) (gruppen[b.art] ||= []).push(b)
  for (const art of Object.keys(gruppen).sort()) {
    console.log(`## ${art} (${gruppen[art].length})`)
    const gesehen = new Set()
    for (const b of gruppen[art]) {
      const k = `${b.rel}:${b.zeile}:${b.detail}`
      if (gesehen.has(k)) continue
      gesehen.add(k)
      console.log(`   ${b.tabelle.padEnd(22)} ${String(b.detail).padEnd(44)} ${b.rel}:${b.zeile}`)
    }
    console.log()
  }

  const echtUngeprueft = ungeprueft.filter((u) => u.anzahl === 0)
  if (echtUngeprueft.length) {
    console.log(`Nicht statisch pruefbar (Payload kommt aus einem State-Objekt) — ${echtUngeprueft.length}:`)
    for (const u of echtUngeprueft) console.log(`   ${u.tabelle}.${u.methode}  ${u.rel}:${u.zeile}`)
    console.log()
  }

  if (befunde.length === 0) {
    console.log('Keine Abweichung zwischen Code und Produktionsschema.')
    process.exit(0)
  }
  console.log(`${befunde.length} Befund(e).`)
  process.exit(1)
}

main().catch((e) => { console.error('FEHLER:', e.message); process.exit(2) })
