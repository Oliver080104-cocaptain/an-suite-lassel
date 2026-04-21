'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface Props {
  /** Aktuell gespeicherte Dokumentnummer (z.B. "AN-2026-00058") */
  value: string
  /** DB-Tabelle, z.B. "angebote" | "lieferscheine" | "rechnungen" */
  table: 'angebote' | 'lieferscheine' | 'rechnungen'
  /** DB-Spalte der Nummer, z.B. "angebotsnummer" */
  column: 'angebotsnummer' | 'lieferscheinnummer' | 'rechnungsnummer'
  /** Datensatz-ID */
  id: string
  /** Erwartetes Präfix-Format, z.B. "AN-" — verhindert versehentliches Löschen */
  expectedPrefix?: string
  /** Wird aufgerufen, wenn Speichern erfolgreich war (für lokale State-Updates) */
  onSaved?: (newValue: string) => void
  /** Optionaler className für den Text */
  className?: string
  /** Fallback wenn value leer ist */
  placeholder?: string
}

export default function EditableDocNumber({
  value, table, column, id, expectedPrefix, onSaved, className, placeholder,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = async () => {
    const next = draft.trim()
    if (!next) {
      toast.error('Nummer darf nicht leer sein')
      return
    }
    if (next === value) {
      setEditing(false)
      return
    }
    if (!id) {
      toast.error('Datensatz muss zuerst gespeichert werden')
      setEditing(false)
      setDraft(value)
      return
    }

    setSaving(true)
    try {
      // Eindeutigkeit prüfen
      const { data: conflict } = await supabase
        .from(table)
        .select('id')
        .eq(column, next)
        .neq('id', id)
        .maybeSingle()
      if (conflict) {
        toast.error(`Nummer "${next}" ist bereits vergeben`)
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from(table)
        .update({ [column]: next })
        .eq('id', id)
      if (error) throw error

      onSaved?.(next)
      toast.success('Nummer aktualisiert')
      setEditing(false)
    } catch (err: any) {
      toast.error('Fehler: ' + (err.message || 'Speichern fehlgeschlagen'))
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          disabled={saving}
          placeholder={expectedPrefix ? `${expectedPrefix}YYYY-00000` : ''}
          className="text-3xl font-bold text-slate-900 bg-white border-2 border-blue-400 rounded-lg px-3 py-1 outline-none focus:border-blue-600 min-w-[280px]"
        />
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="p-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 disabled:opacity-50"
          title="Speichern (Enter)"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50"
          title="Abbrechen (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="group inline-flex items-center gap-2">
      <h1 className={className || 'text-3xl font-bold text-slate-900'}>
        {value || placeholder || '—'}
      </h1>
      {id && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-opacity"
          title="Nummer bearbeiten"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
