import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, Plus, Pencil, Trash2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function VermittlerList() {
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedVermittler, setSelectedVermittler] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    telefon: '',
    provisionssatz: 10,
    status: 'aktiv',
    notizen: ''
  });

  const { data: vermittler = [], isLoading } = useQuery({
    queryKey: ['vermittler'],
    queryFn: () => base44.entities.Vermittler.list('-created_date'),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vermittler.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['vermittler']);
      setEditDialogOpen(false);
      resetForm();
      toast.success('Vermittler erstellt');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vermittler.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['vermittler']);
      setEditDialogOpen(false);
      resetForm();
      toast.success('Vermittler aktualisiert');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Vermittler.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['vermittler']);
      setDeleteDialogOpen(false);
      setSelectedVermittler(null);
      toast.success('Vermittler gelöscht');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      telefon: '',
      provisionssatz: 10,
      status: 'aktiv',
      notizen: ''
    });
    setSelectedVermittler(null);
  };

  const handleCreate = () => {
    resetForm();
    setEditDialogOpen(true);
  };

  const handleEdit = (verm) => {
    setSelectedVermittler(verm);
    setFormData({
      name: verm.name || '',
      email: verm.email || '',
      telefon: verm.telefon || '',
      provisionssatz: verm.provisionssatz || 10,
      status: verm.status || 'aktiv',
      notizen: verm.notizen || ''
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (verm) => {
    setSelectedVermittler(verm);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Name ist erforderlich');
      return;
    }

    if (selectedVermittler) {
      updateMutation.mutate({ id: selectedVermittler.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const activeVermittler = vermittler.filter(v => v.status === 'aktiv');
  const inactiveVermittler = vermittler.filter(v => v.status === 'inaktiv');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Vermittler</h1>
              <p className="text-slate-500 mt-1">Verwalten Sie Ihre Vermittler und Provisionen</p>
            </div>
            <Button onClick={handleCreate} className="bg-orange-600 hover:bg-orange-700">
              <Plus className="w-4 h-4 mr-2" />
              Neuer Vermittler
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-orange-50 to-white border-orange-100">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-xl">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{vermittler.length}</div>
                <div className="text-sm text-slate-500">Gesamt</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{activeVermittler.length}</div>
                <div className="text-sm text-slate-500">Aktiv</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-slate-50 to-white border-slate-200">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-xl">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-900">{inactiveVermittler.length}</div>
                <div className="text-sm text-slate-500">Inaktiv</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Vermittler Liste */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Alle Vermittler</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Kontakt</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Provisionssatz</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {vermittler.map((verm) => (
                  <tr key={verm.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium">{verm.name}</td>
                    <td className="py-3 px-4">
                      <div className="text-sm space-y-1">
                        {verm.email && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-3 h-3" />
                            {verm.email}
                          </div>
                        )}
                        {verm.telefon && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone className="w-3 h-3" />
                            {verm.telefon}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-600">
                      {verm.provisionssatz}%
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant="outline" className={verm.status === 'aktiv' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>
                        {verm.status === 'aktiv' ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(verm)}
                          className="text-slate-600 hover:text-blue-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(verm)}
                          className="text-slate-600 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {vermittler.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Keine Vermittler vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedVermittler ? 'Vermittler bearbeiten' : 'Neuer Vermittler'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Name des Vermittlers"
                />
              </div>
              <div>
                <Label>E-Mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@beispiel.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefon</Label>
                <Input
                  value={formData.telefon}
                  onChange={(e) => setFormData({ ...formData, telefon: e.target.value })}
                  placeholder="+43 xxx xxx xxx"
                />
              </div>
              <div>
                <Label>Provisionssatz (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.provisionssatz}
                  onChange={(e) => setFormData({ ...formData, provisionssatz: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea
                value={formData.notizen}
                onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                placeholder="Interne Notizen..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} className="bg-orange-600 hover:bg-orange-700">
              {selectedVermittler ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vermittler löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Vermittler <strong>{selectedVermittler?.name}</strong> wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(selectedVermittler.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}