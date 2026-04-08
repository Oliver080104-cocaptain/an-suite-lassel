/**
 * PDF-Rendering via api2pdf (Chrome Headless als Service).
 * Wird von /api/pdf/{angebot|lieferschein|rechnung}/[id] genutzt.
 *
 * Vorher haben die Routes HTML zurückgegeben + window.print() — jetzt gibt
 * es eine echte PDF-Binary zurück.
 *
 * ENV: API2PDF_KEY (in .env.local und Vercel hinterlegen)
 */

import { NextResponse } from 'next/server'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Api2Pdf = require('api2pdf')

interface Api2PdfResult {
  FileUrl?: string
  fileUrl?: string
  Success?: boolean
  success?: boolean
  Error?: string | null
  error?: string | null
  [k: string]: unknown
}

/**
 * Rendert HTML via api2pdf zu PDF und gibt eine NextResponse mit application/pdf zurück.
 *
 * @param html  Vollständiges HTML-Dokument inkl. <head>/<body> und @page CSS
 * @param fileName  Dateiname für Content-Disposition (z.B. "Angebot_AN-2026-00058.pdf")
 * @param disposition "attachment" → Browser-Download, "inline" → im Tab anzeigen
 */
export async function renderHtmlToPdfResponse(
  html: string,
  fileName: string,
  disposition: 'attachment' | 'inline' = 'inline'
): Promise<NextResponse> {
  const apiKey = process.env.API2PDF_KEY
  if (!apiKey) {
    return new NextResponse('PDF-Service nicht konfiguriert (API2PDF_KEY fehlt)', { status: 500 })
  }

  try {
    const client = new Api2Pdf(apiKey)
    const result: Api2PdfResult = await client.chromeHtmlToPdf(html, {
      inlinePdf: true,
      fileName,
      options: {
        printBackground: true,
        marginTop: '15mm',
        marginBottom: '15mm',
        marginLeft: '15mm',
        marginRight: '15mm',
      },
    })

    const fileUrl = result?.FileUrl || result?.fileUrl
    const success = result?.Success ?? result?.success ?? !!fileUrl

    if (!success || !fileUrl) {
      console.error('api2pdf failed:', result)
      return new NextResponse(
        `PDF-Erzeugung fehlgeschlagen: ${result?.Error || result?.error || 'Unbekannter Fehler'}`,
        { status: 502 }
      )
    }

    // PDF von api2pdf-CDN holen und als Binary durchreichen
    const pdfRes = await fetch(fileUrl)
    if (!pdfRes.ok) {
      return new NextResponse(`PDF-Download fehlgeschlagen: ${pdfRes.status}`, { status: 502 })
    }
    const pdfBuffer = await pdfRes.arrayBuffer()

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('renderHtmlToPdfResponse error:', err)
    return new NextResponse(`PDF-Erzeugung fehlgeschlagen: ${message}`, { status: 500 })
  }
}
