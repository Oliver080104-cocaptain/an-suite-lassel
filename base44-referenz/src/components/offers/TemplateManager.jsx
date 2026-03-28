import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, Trash2, Plus, Save, X } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QUICK_TEMPLATES } from './DescriptionEditor';

export default function TemplateManager({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', text: '', kategorie: 'sonstige' });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['descriptionTemplates'],
    queryFn: () => base44.entities.DescriptionTemplate.list('sortierung'),
    enabled: open
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DescriptionTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['descriptionTemplates']);
      setNewTemplate({ name: '', text: '', kategorie: 'sonstige' });
      toast.success('Vorlage erstellt');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DescriptionTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['descriptionTemplates']);
      setEditingTemplate(null);
      toast.success('Vorlage aktualisiert');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DescriptionTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['descriptionTemplates']);
      toast.success('Vorlage gelöscht');
    }
  });

  const handleCreate = () => {
    if (!newTemplate.name || !newTemplate.text) {
      toast.error('Name und Text sind erforderlich');
      return;
    }
    createMutation.mutate(newTemplate);
  };

  const handleUpdate = () => {
    if (!editingTemplate.name || !editingTemplate.text) {
      toast.error('Name und Text sind erforderlich');
      return;
    }
    updateMutation.mutate({ id: editingTemplate.id, data: editingTemplate });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Schnellvorlagen verwalten</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* Neue Vorlage erstellen */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Neue Vorlage erstellen
            </h3>
            <div className="space-y-3">
              <Input
                placeholder="Vorlagenname (z.B. 'Verputzarbeiten')"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
              <Select
                value={newTemplate.kategorie}
                onValueChange={(val) => setNewTemplate({ ...newTemplate, kategorie: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verputz">Verputz</SelectItem>
                  <SelectItem value="dach">Dach</SelectItem>
                  <SelectItem value="tauben">Tauben</SelectItem>
                  <SelectItem value="reinigung">Reinigung</SelectItem>
                  <SelectItem value="sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Vorlagentext..."
                value={newTemplate.text}
                onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
                className="min-h-[150px]"
              />
              <Button
                onClick={handleCreate}
                disabled={createMutation.isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Vorlage erstellen
              </Button>
            </div>
          </Card>

          {/* Bestehende Vorlagen */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Bestehende Vorlagen</h3>
            {isLoading ? (
              <div className="text-center text-slate-500 py-8">Lade Vorlagen...</div>
            ) : (
              <div className="space-y-3">
                {/* Eigene Vorlagen */}
                {templates.map((template) => (
                  <Card key={template.id} className="p-4">
                    {editingTemplate?.id === template.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editingTemplate.name}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                        />
                        <Select
                          value={editingTemplate.kategorie}
                          onValueChange={(val) => setEditingTemplate({ ...editingTemplate, kategorie: val })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="verputz">Verputz</SelectItem>
                            <SelectItem value="dach">Dach</SelectItem>
                            <SelectItem value="tauben">Tauben</SelectItem>
                            <SelectItem value="reinigung">Reinigung</SelectItem>
                            <SelectItem value="sonstige">Sonstige</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea
                          value={editingTemplate.text}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, text: e.target.value })}
                          className="min-h-[150px]"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={handleUpdate}
                            disabled={updateMutation.isLoading}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            Speichern
                          </Button>
                          <Button
                            onClick={() => setEditingTemplate(null)}
                            variant="outline"
                            size="sm"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold text-sm">{template.name}</h4>
                            <span className="text-xs text-slate-500">{template.kategorie}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingTemplate(template)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Vorlage wirklich löschen?')) {
                                  deleteMutation.mutate(template.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{template.text}</p>
                      </div>
                    )}
                  </Card>
                ))}
                
                {/* Standard-Vorlagen (nicht bearbeitbar) */}
                {QUICK_TEMPLATES.map((template) => (
                  <Card key={template.id} className="p-4 bg-slate-50">
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-sm">{template.label}</h4>
                          <span className="text-xs text-slate-500">Standard-Vorlage</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{template.text}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}