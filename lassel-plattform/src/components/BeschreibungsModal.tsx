'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
  const [aiEnabled, setAiEnabled] = useState(false)

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] w-[92vw] h-[88vh] max-h-[88vh] p-6 overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title || 'Beschreibung bearbeiten'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-6 overflow-hidden mt-4">
          {/* Links: Textarea – nimmt volle Höhe ein */}
          <div className="flex flex-col overflow-hidden">
            <label className="text-sm font-medium mb-2">Beschreibungstext</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 resize-none font-mono text-sm leading-relaxed"
              placeholder="Beschreibungstext eingeben..."
            />
          </div>

          {/* Rechts: Schnellvorlagen scrollbar */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <label className="text-sm font-medium">Schnellvorlagen</label>
              <Link href="/einstellungen/textvorlagen" className="text-xs text-blue-600 hover:underline">
                Verwalten
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {vorlagen.length === 0 ? (
                <p className="text-sm text-slate-400 text-center mt-8">Keine Vorlagen vorhanden</p>
              ) : (vorlagen as any[]).map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => setText(v.inhalt || v.text || '')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-orange-50 hover:border-orange-300 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900">{v.name}</div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{v.inhalt || v.text}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KI-Assistent + Übernehmen */}
        <div className="flex items-center justify-between mt-4 flex-shrink-0 pt-3 border-t">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">KI-Assistent</span>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            {aiEnabled && (
              <div className="flex items-center gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Was soll generiert werden?"
                  className="w-64 h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating || !aiPrompt.trim()}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSave} className="bg-[#E85A1B] hover:bg-[#c94d17] text-white px-8">
              Übernehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
