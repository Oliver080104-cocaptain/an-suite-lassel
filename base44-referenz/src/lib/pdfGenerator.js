/**
 * Generates a PDF directly via api2pdf from the browser.
 * Bypasses Deno CPU time limits by calling the API client-side.
 */

const API2PDF_KEY = '74db1926-9937-494d-9398-4006d286980b';

export async function generatePdfFromHtml(html, fileName) {
    // Aggressiv minimieren
    const minHtml = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*/g, '')
        .trim();

    const response = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
        method: 'POST',
        headers: {
            'Authorization': API2PDF_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ html: minHtml, inline: true, fileName })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`api2pdf Fehler (${response.status}): ${errText}`);
    }

    const resultRaw = await response.json();
    const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
    const pdfUrl = result.FileUrl || result.pdf;

    if (!pdfUrl) {
        throw new Error('Keine PDF-URL von api2pdf erhalten');
    }

    return pdfUrl;
}