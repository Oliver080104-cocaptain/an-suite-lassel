import React from 'react';
import { cn } from "@/lib/utils";

export default function CurrencyDisplay({ value, className, showSign = false }) {
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0);
  
  const isNegative = value < 0;
  
  return (
    <span className={cn(
      className,
      isNegative && "text-rose-600"
    )}>
      {showSign && value > 0 && "+"}
      {formatted}
    </span>
  );
}