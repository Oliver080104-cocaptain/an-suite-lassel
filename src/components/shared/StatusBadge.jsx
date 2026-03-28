import React from 'react';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig = {
  // Angebotsstatus
  entwurf: { label: "Entwurf", className: "bg-slate-100 text-slate-700 border-slate-200" },
  erstellt: { label: "Erstellt", className: "bg-blue-50 text-blue-700 border-blue-200" },
  versendet: { label: "Versendet", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  angenommen: { label: "Angenommen", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  abgelehnt: { label: "Abgelehnt", className: "bg-rose-50 text-rose-700 border-rose-200" },
  abgelaufen: { label: "Abgelaufen", className: "bg-amber-50 text-amber-700 border-amber-200" },
  // Rechnungsstatus
  offen: { label: "Offen", className: "bg-amber-50 text-amber-700 border-amber-200" },
  teilweise_bezahlt: { label: "Teilweise bezahlt", className: "bg-orange-50 text-orange-700 border-orange-200" },
  bezahlt: { label: "Bezahlt", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  storniert: { label: "Storniert", className: "bg-rose-50 text-rose-700 border-rose-200" },
  mahnung: { label: "Mahnung", className: "bg-red-50 text-red-700 border-red-200" },
  // Rechnungstypen
  normal: { label: "Normal", className: "bg-slate-100 text-slate-700 border-slate-200" },
  teilrechnung: { label: "Teilrechnung", className: "bg-blue-50 text-blue-700 border-blue-200" },
  schlussrechnung: { label: "Schlussrechnung", className: "bg-purple-50 text-purple-700 border-purple-200" },
  storno: { label: "Gutschrift", className: "bg-orange-50 text-orange-700 border-orange-200" },
};

export default function StatusBadge({ status, type = "status" }) {
  const config = statusConfig[status] || { label: status, className: "bg-slate-100 text-slate-700" };
  
  return (
    <Badge variant="outline" className={cn("font-medium border", config.className)}>
      {config.label}
    </Badge>
  );
}