import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";

export default function PdfPreview({ htmlContent, title = "PDF Vorschau" }) {
  const previewUrl = useMemo(() => {
    if (!htmlContent) return null;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [htmlContent]);

  if (!previewUrl) return null;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner p-8" style={{ aspectRatio: '1 / 1.414' }}>
        <iframe
          src={previewUrl}
          className="w-full h-full"
          title="PDF Preview"
        />
      </div>
    </Card>
  );
}