import React from 'react';
import { FileText } from "lucide-react";

export default function EmptyState({ icon: Icon = FileText, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="p-4 bg-slate-100 rounded-2xl mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-slate-500 text-center max-w-md mb-4">{description}</p>}
      {action}
    </div>
  );
}