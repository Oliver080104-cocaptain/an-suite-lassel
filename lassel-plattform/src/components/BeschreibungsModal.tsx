'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Loader2, Wand2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onSave: (text: string) => void
  title?: string
}

export default function BeschreibungsModal({ open, onOpenChange, value, onSave, title }: Props) {
  const [text, setText] = useState(value)
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  React.useEffect(() => {
    if (open) setText(value)
  }, [open, value])

  const { data: vorlagen = [] } = useQuery({
    queryKey: ['textvorlagen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('textvorlagen').select('*').order('kategorie').order('name')
      if (error) throw error
      return data || []
    }
  })

  const handleSave = () => {
    onSave(text)
    onOpenChange(false)
  }

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return
    setGenerating(true)
    try {
      const response = await fetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, existingText: text })
      })
      if (response.ok) {
        const data = await response.json()
        setText(data.text || text)
      }
    } catch (error) {
      console.error('AI generation error:', error)
    } finally {
      setGenerating(false)
    }
  }

  const groupedVorlagen = vorlagen.reduce((acc: Record<string, any[]>, vorlage: any) => {
    const kat = vorlage.kategorie || 'Allgemein'
    if (!acc[kat]) acc[kat] = []
    acc[kat].push(vorlage)
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] w-[92vw]" style={{ height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader>
          <DialogTitle>{title || 'Beschreibung bearbeiten'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 overflow-hidden mt-4">
          {/* Left: Editor + AI */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 resize-none font-mono text-sm"
              placeholder="Beschreibung eingeben..."
            />

            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">KI-Assistent</p>
              <div className="flex gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Beschreibe was generiert werden soll..."
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
                />
                <Button onClick={handleGenerate} disabled={generating || !aiPrompt.trim()} variant="outline">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleSave}>Übernehmen</Button>
            </div>
          </div>

          {/* Right: Templates */}
          <div className="w-[272px] flex-shrink-0 overflow-y-auto border-l pl-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Schnellvorlagen</p>
              <Link href="/einstellungen/textvorlagen" className="text-xs text-blue-600 hover:underline">
                Verwalten
              </Link>
            </div>
            <div className="space-y-4">
              {Object.entries(groupedVorlagen).map(([kat, items]) => (
                <div key={kat}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{kat}</p>
                  <div className="space-y-1">
                    {(items as any[]).map((vorlage: any) => (
                      <button
                        key={vorlage.id}
                        onClick={() => setText(text ? text + '\n' + vorlage.text : vorlage.text)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm transition-colors"
                      >
                        <p className="font-medium text-slate-800">{vorlage.name}</p>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{vorlage.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {vorlagen.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Keine Vorlagen vorhanden</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
