'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export default function LieferscheinZuweisungPage() {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Bitte laden Sie nur PDF-Dateien hoch')
        return
      }
      setFile(selectedFile)
      setFileName(selectedFile.name)
    }
  }

  const handleSubmit = async () => {
    if (!file) { toast.error('Bitte laden Sie zunächst einen Lieferschein hoch'); return }
    if (!ticketNumber.trim()) { toast.error('Bitte geben Sie eine Ticketnummer ein'); return }

    setLoading(true)
    try {
      // Upload file to Supabase storage
      toast.loading('PDF wird hochgeladen...')
      const filePath = `lieferscheine/${Date.now()}_${file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
      const pdfUrl = urlData.publicUrl

      toast.dismiss()

      // Send to n8n webhook
      const formData = new FormData()
      formData.append('file', file)
      formData.append('pdfUrl', pdfUrl)
      formData.append('ticketNumber', ticketNumber.trim())

      const response = await fetch('https://n8n.srv1367876.hstgr.cloud/webhook/fb90b972-45fd-4762-bbea-cdec7543f6de', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        toast.success('Lieferschein erfolgreich hochgeladen')
        setFile(null)
        setFileName('')
        setTicketNumber('')
        const fileInput = document.getElementById('pdf-upload') as HTMLInputElement
        if (fileInput) fileInput.value = ''
      } else {
        toast.error('Fehler beim Hochladen des Lieferscheins')
      }
    } catch (error: any) {
      toast.dismiss()
      toast.error('Fehler beim Hochladen: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Lieferschein Zuweisung</CardTitle>
            <CardDescription>Laden Sie einen Lieferschein (PDF) hoch und weisen Sie ihn einem Ticket zu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="ticket-number" className="text-base font-semibold">Ticketnummer</Label>
              <Input
                id="ticket-number"
                type="text"
                placeholder="z.B. TKT-2024-00123"
                value={ticketNumber}
                onChange={e => setTicketNumber(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <Label htmlFor="pdf-upload" className="text-base font-semibold">Lieferschein PDF hochladen</Label>
              <div className="flex items-center gap-4">
                <input id="pdf-upload" type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" />
                  PDF auswählen
                </label>
                {fileName && (
                  <span className="text-sm text-slate-600 truncate">{fileName}</span>
                )}
              </div>
              {file && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                  Datei bereit: {fileName} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              disabled={!file || !ticketNumber.trim() || loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? 'Wird hochgeladen...' : 'Lieferschein hochladen'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
