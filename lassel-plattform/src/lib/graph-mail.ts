/**
 * E-Mail-Versand über die Microsoft Graph API (App-only / Client Credentials).
 *
 * Ersetzt den Outlook-Node im n8n-Flow. Grund für die Umstellung: n8n hat die
 * Anhänge (PDF + Skizzen-ZIP) nicht zuverlässig mitgeschickt — der Merge/
 * Compression-Zweig lief in Race-Conditions, und ein 2xx vom Webhook sagte
 * nichts darüber aus, ob die Mail wirklich mit Anhang rausging. Hier passiert
 * alles synchron in einem Request: schlägt etwas fehl, sieht der User es.
 *
 * SETUP (einmalig, Azure-Portal + Exchange-Admin):
 *   1. Entra ID → App-Registrierungen → Neue Registrierung ("Lassel Angebotssuite")
 *   2. API-Berechtigungen → Microsoft Graph → Anwendungsberechtigungen:
 *        - Mail.Send       (Pflicht)
 *        - Mail.ReadWrite  (Pflicht für Anhänge > 3 MB, siehe sendViaDraft)
 *      → "Administratorzustimmung erteilen" klicken.
 *   3. Zertifikate & Geheimnisse → neuer geheimer Clientschlüssel.
 *   4. WICHTIG: Mail.Send erlaubt sonst Versand als JEDES Postfach im Tenant.
 *      Auf das eine Postfach einschränken (Exchange Online PowerShell):
 *        New-ServicePrincipal -AppId <client-id> -ObjectId <sp-object-id>
 *        New-ManagementScope -Name "Angebotssuite" `
 *          -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'office@hoehenarbeiten-lassel.at'"
 *        New-ManagementRoleAssignment -App <sp-object-id> `
 *          -Role "Application Mail.Send" -CustomResourceScope "Angebotssuite"
 *        New-ManagementRoleAssignment -App <sp-object-id> `
 *          -Role "Application Mail.ReadWrite" -CustomResourceScope "Angebotssuite"
 *      Danach mit Test-ServicePrincipalAuthorization prüfen. Achtung: Entra-
 *      Consent und EXO-RBAC sind ADDITIV — der Entra-Consent muss entfernt
 *      werden, damit das Scoping überhaupt wirkt.
 *
 * ENV (Vercel, niemals NEXT_PUBLIC_*):
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_SENDER
 *
 * Bewusst ohne @microsoft/microsoft-graph-client: wir brauchen vier Endpunkte,
 * das SDK bringt in einer Serverless-Function nur Cold-Start-Gewicht mit.
 */

import { logEvent } from '@/lib/monitoring'

const GRAPH = 'https://graph.microsoft.com/v1.0'

/**
 * Dokumentierte Trennlinie von Graph: Anhänge unter 3 MB dürfen inline im
 * Request stehen, alles darüber braucht eine Upload-Session. Wir rechnen mit
 * Rohbytes und setzen die Schwelle bei 2,5 MB, weil Base64 um ~33 % aufbläht
 * (2,5 MB Rohdaten ≈ 3,4 MB Base64 — plus Body und Header bleibt Luft bis 4 MB).
 */
const INLINE_TOTAL_LIMIT = Math.floor(2.5 * 1024 * 1024)
/** Harte Einzeldatei-Grenze von Graph für inline/POST-attachments. */
const SINGLE_ATTACHMENT_LIMIT = 3 * 1024 * 1024
/** Graph empfiehlt für Outlook-Upload-Sessions < 4 MB pro PUT. */
const CHUNK_SIZE = 12 * 320 * 1024 // 3.932.160 Bytes
/** Exchange-Online-Default: 35 MB maximale Nachrichtengröße inkl. Base64. */
const MAX_TOTAL_RAW = 24 * 1024 * 1024

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`

export interface GraphAttachment {
  name: string
  contentType: string
  data: Uint8Array
}

export interface SendMailInput {
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject: string
  /** Vollständiger HTML-Body. Muss bereits escaped/sanitisiert sein. */
  html: string
  attachments?: GraphAttachment[]
  /** Eigene Header müssen mit "x-" beginnen (Graph-Vorgabe). */
  headers?: { name: string; value: string }[]
}

export interface SendMailResult {
  /** 'inline' = ein einziger sendMail-Call, 'draft' = Entwurf + Upload-Session. */
  mode: 'inline' | 'draft'
  attachmentBytes: number
  attachmentCount: number
}

export class GraphMailError extends Error {
  /** HTTP-Status von Graph, 0 bei Netzwerk-/Konfigurationsfehlern. */
  readonly status: number
  /** Graph-Fehlercode wie ErrorAccessDenied — für die Diagnose. */
  readonly code: string
  /** Für den User gedachte, verständliche Meldung. */
  readonly userMessage: string

  constructor(userMessage: string, opts: { status?: number; code?: string; detail?: string } = {}) {
    super(opts.detail ? `${userMessage} (${opts.code || opts.status}: ${opts.detail})` : userMessage)
    this.name = 'GraphMailError'
    this.status = opts.status ?? 0
    this.code = opts.code || ''
    this.userMessage = userMessage
  }
}

interface GraphConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  sender: string
}

export function readGraphConfig(): GraphConfig {
  const tenantId = process.env.MS_GRAPH_TENANT_ID
  const clientId = process.env.MS_GRAPH_CLIENT_ID
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET
  const sender = process.env.MS_GRAPH_SENDER

  const missing = [
    !tenantId && 'MS_GRAPH_TENANT_ID',
    !clientId && 'MS_GRAPH_CLIENT_ID',
    !clientSecret && 'MS_GRAPH_CLIENT_SECRET',
    !sender && 'MS_GRAPH_SENDER',
  ].filter(Boolean)

  if (missing.length) {
    throw new GraphMailError(
      'E-Mail-Versand ist nicht konfiguriert. Bitte die Microsoft-365-Zugangsdaten in den Umgebungsvariablen hinterlegen.',
      { code: 'config-missing', detail: `fehlt: ${missing.join(', ')}` }
    )
  }
  return { tenantId: tenantId!, clientId: clientId!, clientSecret: clientSecret!, sender: sender! }
}

/**
 * Token-Cache im Modul-Scope. Hält nur solange die Lambda-Instanz warm ist —
 * das ist Absicht und spart die meisten Token-Calls. Ein Cache-Miss holt
 * einfach neu; parallele Doppel-Requests sind harmlos, deshalb kein Mutex.
 */
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(cfg: GraphConfig, force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  let res: Response
  try {
    res = await fetch(TOKEN_URL(cfg.tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // URLSearchParams kodiert das Secret korrekt — Graph verlangt das ausdrücklich.
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new GraphMailError('Microsoft 365 ist nicht erreichbar (Token-Anforderung fehlgeschlagen).', {
      code: 'token-network',
      detail: (err as Error).message,
    })
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof json.access_token !== 'string') {
    // NIEMALS den Request-Body loggen — der enthält das Client-Secret.
    throw new GraphMailError('Anmeldung bei Microsoft 365 fehlgeschlagen. Bitte Tenant-ID, Client-ID und Secret prüfen.', {
      status: res.status,
      code: String(json.error || 'token-failed'),
      detail: String(json.error_description || '').slice(0, 300),
    })
  }

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3599
  // 5 Minuten Puffer, damit kein Token mitten im Versand abläuft.
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (expiresIn - 300) * 1000 }
  return cachedToken.value
}

interface GraphErrorBody {
  error?: { code?: string; message?: string }
}

/** Übersetzt die typischen Graph-Fehler in etwas, das im Toast Sinn ergibt. */
function describeGraphError(status: number, code: string, message: string): string {
  if (code === 'ErrorInvalidRecipients' || /recipient/i.test(message)) {
    return 'Mindestens eine Empfängeradresse wurde von Microsoft 365 abgelehnt.'
  }
  if (status === 401) {
    return 'Die Anmeldung bei Microsoft 365 wurde abgelehnt. Bitte Client-Secret und Berechtigungen prüfen.'
  }
  if (code === 'ErrorAccessDenied' || status === 403) {
    return 'Microsoft 365 verweigert den Zugriff auf das Absender-Postfach. Berechtigung Mail.Send und die Postfach-Freigabe prüfen.'
  }
  if (code === 'MailboxNotEnabledForRESTAPI' || code === 'ResourceNotFound' || status === 404) {
    return 'Das Absender-Postfach wurde nicht gefunden. MS_GRAPH_SENDER prüfen (muss ein echtes Exchange-Online-Postfach sein).'
  }
  if (status === 413 || /size/i.test(code)) {
    return 'Die E-Mail ist zu groß für den Versand. Bitte weniger oder kleinere Anhänge wählen.'
  }
  if (status === 429) {
    return 'Microsoft 365 drosselt gerade den Versand. Bitte in einer Minute erneut versuchen.'
  }
  if (status >= 500) {
    return 'Microsoft 365 hatte einen internen Fehler beim Versand. Bitte erneut versuchen.'
  }
  return 'Der E-Mail-Versand über Microsoft 365 ist fehlgeschlagen.'
}

/**
 * Ein Graph-Request mit Bearer-Token, Timeout und begrenztem Retry.
 * Gibt die Response zurück; Fehlerstatus werden hier bereits in
 * GraphMailError übersetzt.
 *
 * RETRY-REGELN, bewusst restriktiv:
 * - 429 wird wiederholt. Bei einer Drosselung ist garantiert nichts passiert.
 * - 5xx wird NUR wiederholt, wenn der Aufrufer den Request ausdrücklich als
 *   wiederholbar markiert. `POST /sendMail`, `POST /messages` und
 *   `POST /messages/{id}/send` sind es NICHT: bei einem 503 hinter dem
 *   Gateway kann die Mail bereits zugestellt sein, ein Retry schickt sie
 *   dem Kunden ein zweites Mal.
 * - 401 kann ein vorzeitig entwertetes Token bedeuten (z.B. Rechteänderung).
 *   Dann wird der Cache verworfen und einmal mit frischem Token nachgefasst —
 *   sonst scheitert jeder Versand auf dieser warmen Instanz bis zum Ablauf.
 *
 * Timeouts sind knapp gehalten, weil der Aufrufer in einer Vercel-Function mit
 * 60 s Gesamtlaufzeit sitzt: lieber ein sauberer Fehler als ein hartes
 * Abschneiden, bei dem unklar bleibt, ob die Mail raus ist.
 */
async function graphFetch(
  cfg: GraphConfig,
  url: string,
  init: RequestInit & { attempt?: number; timeoutMs?: number; retryOn5xx?: boolean } = {}
): Promise<Response> {
  const attempt = init.attempt ?? 1
  const token = await getAccessToken(cfg)

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    })
  } catch (err) {
    throw new GraphMailError('Microsoft 365 ist nicht erreichbar.', {
      code: 'graph-network',
      detail: (err as Error).message,
    })
  }

  if (res.ok) return res

  if (res.status === 401 && attempt < 2) {
    cachedToken = null
    await getAccessToken(cfg, true)
    return graphFetch(cfg, url, { ...init, attempt: attempt + 1 })
  }

  const retryable = res.status === 429 || (init.retryOn5xx === true && res.status >= 500)
  if (retryable && attempt < 2) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 2000
    await new Promise((r) => setTimeout(r, waitMs))
    return graphFetch(cfg, url, { ...init, attempt: attempt + 1 })
  }

  const body = (await res.json().catch(() => ({}))) as GraphErrorBody
  const code = body.error?.code || ''
  const message = body.error?.message || ''
  throw new GraphMailError(describeGraphError(res.status, code, message), {
    status: res.status,
    code,
    detail: message.slice(0, 300),
  })
}

function recipientList(addresses: string[] | undefined) {
  return (addresses || []).map((address) => ({ emailAddress: { address } }))
}

function inlineAttachment(a: GraphAttachment) {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.name,
    contentType: a.contentType,
    contentBytes: Buffer.from(a.data).toString('base64'),
  }
}

function buildMessage(input: SendMailInput, attachments?: GraphAttachment[]) {
  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: 'HTML', content: input.html },
    toRecipients: recipientList(input.to),
  }
  if (input.cc?.length) message.ccRecipients = recipientList(input.cc)
  if (input.bcc?.length) message.bccRecipients = recipientList(input.bcc)
  if (input.replyTo?.length) message.replyTo = recipientList(input.replyTo)
  if (input.headers?.length) message.internetMessageHeaders = input.headers
  if (attachments?.length) message.attachments = attachments.map(inlineAttachment)
  return message
}

/** Der schnelle Weg: alles in einem POST /sendMail. Kein 5xx-Retry — nicht idempotent. */
async function sendInline(cfg: GraphConfig, input: SendMailInput): Promise<void> {
  await graphFetch(cfg, `${GRAPH}/users/${encodeURIComponent(cfg.sender)}/sendMail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: buildMessage(input, input.attachments), saveToSentItems: true }),
  })
}

/**
 * Der Weg für große Anhänge: Entwurf anlegen → Anhänge einzeln nachladen
 * (kleine direkt, große per Upload-Session) → Entwurf senden.
 *
 * Schlägt irgendetwas nach dem Anlegen fehl, wird der Entwurf wieder gelöscht,
 * damit keine Leichen im Postfach liegen bleiben.
 */
async function sendViaDraft(cfg: GraphConfig, input: SendMailInput): Promise<void> {
  const userPath = `${GRAPH}/users/${encodeURIComponent(cfg.sender)}`

  // Entwurf bewusst OHNE Anhänge anlegen, damit dieser Request klein bleibt.
  // Kein 5xx-Retry: ein wiederholter POST würde einen zweiten Entwurf anlegen,
  // dessen ID wir nie erfahren — er bliebe als Leiche im Postfach liegen.
  const draftRes = await graphFetch(cfg, `${userPath}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildMessage(input)),
  })
  const draft = (await draftRes.json()) as { id?: string }
  if (!draft.id) {
    throw new GraphMailError('Microsoft 365 hat keinen Entwurf angelegt.', { code: 'draft-no-id' })
  }
  // Die Message-ID enthält +, / und = — muss encodiert werden.
  const messagePath = `${userPath}/messages/${encodeURIComponent(draft.id)}`

  try {
    for (const attachment of input.attachments || []) {
      if (attachment.data.length < SINGLE_ATTACHMENT_LIMIT) {
        // Anhänge am Entwurf sind idempotent genug: ein doppelter Anhang wäre
        // ärgerlich, aber der Entwurf wird bei jedem Fehler ohnehin verworfen.
        await graphFetch(cfg, `${messagePath}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inlineAttachment(attachment)),
          retryOn5xx: true,
        })
      } else {
        await uploadLargeAttachment(cfg, messagePath, attachment)
      }
    }

    // Kein 5xx-Retry: nach einem 503 kann die Mail bereits raus sein.
    await graphFetch(cfg, `${messagePath}/send`, { method: 'POST' })
  } catch (err) {
    // Aufräumen ist best effort — der eigentliche Fehler muss durchgereicht werden.
    await graphFetch(cfg, messagePath, { method: 'DELETE', timeoutMs: 10_000 }).catch(() => {})
    throw err
  }
}

/** Chunk-Upload gegen die vorauthentifizierte Session-URL. */
async function uploadLargeAttachment(
  cfg: GraphConfig,
  messagePath: string,
  attachment: GraphAttachment
): Promise<void> {
  const sessionRes = await graphFetch(cfg, `${messagePath}/attachments/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      AttachmentItem: {
        attachmentType: 'file',
        name: attachment.name,
        size: attachment.data.length,
        contentType: attachment.contentType,
      },
    }),
  })
  const session = (await sessionRes.json()) as { uploadUrl?: string }
  if (!session.uploadUrl) {
    throw new GraphMailError('Microsoft 365 hat keine Upload-Session für den Anhang geliefert.', {
      code: 'upload-session-missing',
    })
  }

  const total = attachment.data.length
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total) - 1
    // Buffer statt Uint8Array-View: fetch() akzeptiert nur BodyInit, und ein
    // Subarray über einem größeren Puffer erfüllt den Typ nicht.
    const chunk = Buffer.from(attachment.data.subarray(start, end + 1))

    // Ein Chunk-PUT ist idempotent (identischer Byte-Bereich), deshalb darf
    // hier — anders als beim Senden — auch bei 5xx nachgefasst werden. Ohne
    // Retry wären bei einer Drosselung auf Chunk 5 die ersten vier umsonst.
    let res: Response | null = null
    for (let versuch = 1; versuch <= 3; versuch++) {
      // Die uploadUrl ist vorauthentifiziert — ein Authorization-Header
      // führt hier zu Fehlern und ist von Microsoft ausdrücklich untersagt.
      try {
        res = await fetch(session.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end}/${total}`,
          },
          body: chunk,
          signal: AbortSignal.timeout(25_000),
        })
      } catch (err) {
        if (versuch === 3) {
          throw new GraphMailError(`Anhang "${attachment.name}" konnte nicht hochgeladen werden.`, {
            code: 'upload-network',
            detail: (err as Error).message,
          })
        }
        await new Promise((r) => setTimeout(r, versuch * 1500))
        continue
      }

      // 200 = weiterer Chunk erwartet, 201 = fertig (mit Location-Header).
      if (res.status === 200 || res.status === 201) break

      if ((res.status === 429 || res.status >= 500) && versuch < 3) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 8) * 1000
          : versuch * 1500
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }

      const detail = await res.text().catch(() => '')
      throw new GraphMailError(`Anhang "${attachment.name}" konnte nicht hochgeladen werden.`, {
        status: res.status,
        code: 'upload-chunk-failed',
        detail: detail.slice(0, 300),
      })
    }
  }
}

/**
 * Verschickt die E-Mail. Wirft GraphMailError mit einer für den User
 * verständlichen `userMessage`, wenn irgendetwas schiefgeht — es gibt
 * bewusst keinen stillen Erfolg.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const to = input.to.filter((a) => typeof a === 'string' && /.+@.+\..+/.test(a.trim()))
  if (to.length === 0) {
    throw new GraphMailError('Es wurde keine gültige Empfängeradresse übergeben.', {
      code: 'no-recipients',
    })
  }

  const attachments = input.attachments || []
  const attachmentBytes = attachments.reduce((sum, a) => sum + a.data.length, 0)
  if (attachmentBytes > MAX_TOTAL_RAW) {
    const mb = (attachmentBytes / 1024 / 1024).toFixed(1)
    throw new GraphMailError(
      `Die Anhänge sind mit ${mb} MB zu groß für den Versand (Grenze ca. 24 MB). Bitte weniger oder kleinere Dateien anhängen.`,
      { code: 'attachments-too-large' }
    )
  }

  const cfg = readGraphConfig()
  const normalized: SendMailInput = { ...input, to, attachments }

  const needsDraft =
    attachmentBytes > INLINE_TOTAL_LIMIT ||
    attachments.some((a) => a.data.length >= SINGLE_ATTACHMENT_LIMIT)

  if (needsDraft) {
    await sendViaDraft(cfg, normalized)
  } else {
    await sendInline(cfg, normalized)
  }

  // Bewusst OHNE Empfängeradressen und Betreff: das Monitoring ist ein
  // externer Dienst, und Kundenadressen samt Objektbezug haben dort nichts
  // verloren. Für die Zuordnung reicht die Belegnummer, die der Aufrufer
  // im x-beleg-nummer-Header mitgibt und selbst loggt.
  await logEvent('info', 'graph-mail', 'E-Mail versendet', {
    empfaenger: to.length,
    modus: needsDraft ? 'draft' : 'inline',
    anhaenge: attachments.length,
    anhangBytes: attachmentBytes,
  }).catch(() => {})

  return {
    mode: needsDraft ? 'draft' : 'inline',
    attachmentBytes,
    attachmentCount: attachments.length,
  }
}

/** HTML-Escaping für alles, was aus KI-Text oder User-Eingabe kommt. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
