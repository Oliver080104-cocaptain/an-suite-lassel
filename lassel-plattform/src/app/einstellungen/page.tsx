'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Save, Loader2, Building2, CreditCard, FileText } from 'lucide-react'
import Link from 'next/link'

const defaultSettings = {
  firmenname: '',
  strasse: '',
  plz: '',
  ort: '',
  land: 'Österreich',
  telefon: '',
  email: '',
  website: '',
  ustIdNr: '',
  steuernummer: '',
  amtsgericht: '',
  fnNr: '',
  geschaeftsfuehrung: '',
  bankName: 'Volksbank',
  blz: '43000',
  iban: 'AT454300048406028000',
  bic: 'VBOEATWWXXX',
  logoUrl: '',
  angebotFusstext: '',
  rechnungFusstext: '',
  angebotNummerPrefix: 'AN',
  rechnungNummerPrefix: 'RE',
}

export default function EinstellungenPage() {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({ ...defaultSettings })

  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ['companySettings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).single()
      return data || null
    },
  })

  useEffect(() => {
    if (existingSettings) {
      setSettings({ ...defaultSettings, ...existingSettings })
    }
  }, [existingSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (existingSettings?.id) {
        const { error } = await supabase.from('company_settings').update(settings).eq('id', existingSettings.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('company_settings').insert([settings])
        if (error) throw error
      }
      queryClient.invalidateQueries({ queryKey: ['companySettings'] })
      toast.success('Einstellungen gespeichert')
    } catch (err: any) {
      toast.error('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Einstellungen</h1>
            <p className="text-slate-500 mt-1">Firmendaten und Konfiguration</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/einstellungen/textvorlagen">
              <Button variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                Textvorlagen
              </Button>
            </Link>
            <Link href="/papierkorb">
              <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50">
                Papierkorb
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Speichern
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Firmendaten */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Building2 className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Firmendaten</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Firmenname</Label>
                <Input value={settings.firmenname || ''} onChange={e => setSettings(p => ({ ...p, firmenname: e.target.value }))} placeholder="Ihre Firma GmbH" className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Straße</Label>
                <Input value={settings.strasse || ''} onChange={e => setSettings(p => ({ ...p, strasse: e.target.value }))} placeholder="Musterstraße 123" className="mt-1" />
              </div>
              <div>
                <Label>PLZ</Label>
                <Input value={settings.plz || ''} onChange={e => setSettings(p => ({ ...p, plz: e.target.value }))} placeholder="12345" className="mt-1" />
              </div>
              <div>
                <Label>Ort</Label>
                <Input value={settings.ort || ''} onChange={e => setSettings(p => ({ ...p, ort: e.target.value }))} placeholder="Musterstadt" className="mt-1" />
              </div>
              <div>
                <Label>Land</Label>
                <Input value={settings.land || ''} onChange={e => setSettings(p => ({ ...p, land: e.target.value }))} placeholder="Österreich" className="mt-1" />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={settings.telefon || ''} onChange={e => setSettings(p => ({ ...p, telefon: e.target.value }))} placeholder="+43 660 8860050" className="mt-1" />
              </div>
              <div>
                <Label>E-Mail</Label>
                <Input type="email" value={settings.email || ''} onChange={e => setSettings(p => ({ ...p, email: e.target.value }))} placeholder="info@firma.at" className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Website</Label>
                <Input value={settings.website || ''} onChange={e => setSettings(p => ({ ...p, website: e.target.value }))} placeholder="www.firma.at" className="mt-1" />
              </div>
              <div>
                <Label>USt-IdNr.</Label>
                <Input value={settings.ustIdNr || ''} onChange={e => setSettings(p => ({ ...p, ustIdNr: e.target.value }))} placeholder="ATU12345678" className="mt-1" />
              </div>
              <div>
                <Label>Steuernummer</Label>
                <Input value={settings.steuernummer || ''} onChange={e => setSettings(p => ({ ...p, steuernummer: e.target.value }))} placeholder="22375/5414" className="mt-1" />
              </div>
              <div>
                <Label>Amtsgericht</Label>
                <Input value={settings.amtsgericht || ''} onChange={e => setSettings(p => ({ ...p, amtsgericht: e.target.value }))} placeholder="Korneuburg" className="mt-1" />
              </div>
              <div>
                <Label>Firmenbuchnummer (FN-NR.)</Label>
                <Input value={settings.fnNr || ''} onChange={e => setSettings(p => ({ ...p, fnNr: e.target.value }))} placeholder="FN-578451P" className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Geschäftsführung</Label>
                <Input value={settings.geschaeftsfuehrung || ''} onChange={e => setSettings(p => ({ ...p, geschaeftsfuehrung: e.target.value }))} placeholder="Lassel Reinhard" className="mt-1" />
              </div>
            </div>
          </Card>

          {/* Bankverbindung */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Bankverbindung</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Bank</Label>
                <Input value={settings.bankName || ''} onChange={e => setSettings(p => ({ ...p, bankName: e.target.value }))} placeholder="Volksbank" className="mt-1" />
              </div>
              <div>
                <Label>IBAN</Label>
                <Input value={settings.iban || ''} onChange={e => setSettings(p => ({ ...p, iban: e.target.value }))} placeholder="AT454300048406028000" className="mt-1" />
              </div>
              <div>
                <Label>BIC</Label>
                <Input value={settings.bic || ''} onChange={e => setSettings(p => ({ ...p, bic: e.target.value }))} placeholder="VBOEATWWXXX" className="mt-1" />
              </div>
              <div>
                <Label>BLZ</Label>
                <Input value={settings.blz || ''} onChange={e => setSettings(p => ({ ...p, blz: e.target.value }))} placeholder="43000" className="mt-1" />
              </div>
            </div>
          </Card>

          {/* Dokumentvorlagen */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-100 rounded-lg">
                <FileText className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Dokumentvorlagen</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Logo URL</Label>
                <Input value={settings.logoUrl || ''} onChange={e => setSettings(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." className="mt-1" />
                {settings.logoUrl && (
                  <img src={settings.logoUrl} alt="Logo Vorschau" className="mt-2 h-12 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Angebots-Präfix</Label>
                  <Input value={settings.angebotNummerPrefix || 'AN'} onChange={e => setSettings(p => ({ ...p, angebotNummerPrefix: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Rechnungs-Präfix</Label>
                  <Input value={settings.rechnungNummerPrefix || 'RE'} onChange={e => setSettings(p => ({ ...p, rechnungNummerPrefix: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Fußtext Angebote</Label>
                <Textarea value={settings.angebotFusstext || ''} onChange={e => setSettings(p => ({ ...p, angebotFusstext: e.target.value }))} placeholder="Standardtext für Angebote..." rows={3} className="mt-1 resize-none" />
              </div>
              <div>
                <Label>Fußtext Rechnungen</Label>
                <Textarea value={settings.rechnungFusstext || ''} onChange={e => setSettings(p => ({ ...p, rechnungFusstext: e.target.value }))} placeholder="Standardtext für Rechnungen..." rows={3} className="mt-1 resize-none" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
