/**
 * Ausgehende n8n-/Zoho-Webhooks aus dem Frontend.
 *
 * Grund für diesen Wrapper: die Aufrufstellen haben bisher nur einen
 * abgelehnten `fetch` abgefangen, nie `res.ok` geprüft. Ein HTTP 404 oder 500
 * von n8n — ein abgeschalteter, umbenannter oder fehlerhafter Flow — galt
 * damit als Erfolg. Die Sachbearbeiterin sah „erfolgreich in Zoho abgelegt",
 * während das PDF nie im WorkDrive ankam und der Ticket-Status nicht gesetzt
 * wurde. Weder im UI noch im Monitoring fiel das auf; der Ausfall blieb
 * unbemerkt, bis jemand in Zoho nachsah.
 *
 * `zohoFetch` wirft bei Non-2xx genauso wie bei einem Netzwerkfehler. Damit
 * greifen die vorhandenen try/catch-Blöcke an den Aufrufstellen unverändert,
 * und der Fehler landet im Monitoring statt in der Ablage.
 */

import { logEvent } from '@/lib/monitoring'

/** Webhook-URL → sprechender Flow-Name fürs Monitoring. */
const FLOW_NAMEN: Record<string, string> = {
  'fccf5130-51b2-4e66-8aa2-84d29da4862a': 'angebot-zoho-ablage',
  '5e4e9681-a79e-42be-a1d0-309bfdc36909': 'zoho-ticket-update',
  '47c3bc5b-17e6-4c07-bd72-71a546d023d5': 'rechnung-erstellt',
  '2c51d71e-b55d-493d-aafb-1443d1d100cc': 'angebot-angenommen',
  '48a021d8-c88d-4663-80f6-dc09a70d598b': 'rechnung-zoho-ablage',
  'fd01a47a-4d74-4763-b551-e5c3a29155da': 'rechnung-bezahlt',
  'b15d8baa-e8ec-4d8a-aa85-0865048b9c31': 'lieferschein-zoho-ablage',
  'ab34322b-aed4-4a93-b232-9178bf75ecaf': 'angebot-versand-zoho',
}

function flowName(url: string): string {
  for (const [id, name] of Object.entries(FLOW_NAMEN)) {
    if (url.includes(id)) return name
  }
  return url.split('/').pop() || 'unbekannt'
}

export async function zohoFetch(url: string, init?: RequestInit): Promise<Response> {
  const flow = flowName(url)
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    await logEvent('error', 'webhook-outgoing',
      `n8n-Flow ${flow} nicht erreichbar`,
      { flow, url, error: (err as Error).message }
    ).catch(() => {})
    throw err
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    await logEvent('error', 'webhook-outgoing',
      `n8n-Flow ${flow} antwortete mit HTTP ${res.status}`,
      { flow, url, status: res.status, detail: detail.slice(0, 300) }
    ).catch(() => {})
    throw new Error(
      `Zoho-Übertragung fehlgeschlagen (${flow}, HTTP ${res.status}). `
      + 'Der Beleg wurde gespeichert, ist aber nicht in Zoho angekommen.'
    )
  }

  return res
}
