import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function MitarbeiterManagement() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', abteilung: '' });

  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ['mitarbeiter'],
    queryFn: () => base44.entities.Mitarbeiter.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Mitarbeiter.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mitarbeiter']);
      setDialogOpen(false);
      setFormData({ name: '', email: '', abteilung: '' });
      toast.success('Mitarbeiter erstellt');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Mitarbeiter.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['mitarbeiter']);
      toast.success('Mitarbeiter gelöscht');
    },
  });

  const handleCreate = () => {
    if (!formData.name) {
      toast.error('Name ist erforderlich');
      return;
    }
    createMutation.mutate({ ...formData, aktiv: true });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Mitarbeiter Verwaltung</h3>
          <p className="text-sm text-slate-500 mt-1">
            Mitarbeiter für Performance-Tracking anlegen
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-orange-600 hover:bg-orange-700">
          <Plus className="w-4 h-4 mr-2" />
          Mitarbeiter
        </Button>
      </div>

      <div className="grid gap-3">
        {mitarbeiter.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg">
                <Users className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <div className="font-medium text-slate-900">{m.name}</div>
                {m.email && (
                  <div className="text-sm text-slate-500 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {m.email}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {m.abteilung && (
                <Badge variant="outline" className="text-xs">
                  {m.abteilung}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(m.id)}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {mitarbeiter.length === 0 && (
          <div className="py-8 text-center text-slate-400">
            Keine Mitarbeiter vorhanden
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Mitarbeiter</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Max Mustermann"
              />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="max@beispiel.com"
              />
            </div>
            <div>
              <Label>Abteilung</Label>
              <Input
                value={formData.abteilung}
                onChange={(e) => setFormData({ ...formData, abteilung: e.target.value })}
                placeholder="z.B. Vertrieb, Montage"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate} className="bg-orange-600 hover:bg-orange-700">
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}