import React from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PageHeader({ title, subtitle, backLink, backLabel, actions }) {
  return (
    <div className="mb-8">
      {backLink && (
        <Link to={createPageUrl(backLink)} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{backLabel || "Zurück"}</span>
        </Link>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-slate-500 mt-1 text-sm sm:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">{actions}</div>}
      </div>
    </div>
  );
}