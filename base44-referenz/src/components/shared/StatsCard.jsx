import React from 'react';
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatsCard({ title, value, subtitle, icon: Icon, trend, trendUp, className, variant = 'default' }) {
  const isOrange = variant === 'orange';
  
  return (
    <Card className={cn(
      "p-6 border-slate-100 shadow-sm hover:shadow-lg transition-all",
      isOrange 
        ? "bg-gradient-to-br from-orange-500 to-orange-600" 
        : "bg-gradient-to-br from-white to-slate-50",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className={cn(
            "text-sm font-medium tracking-wide uppercase",
            isOrange ? "text-orange-50" : "text-slate-500"
          )}>{title}</p>
          <p className={cn(
            "text-3xl font-bold tracking-tight",
            isOrange ? "text-white" : "text-slate-900"
          )}>{value}</p>
          {subtitle && <p className={cn(
            "text-sm",
            isOrange ? "text-orange-100" : "text-slate-500"
          )}>{subtitle}</p>}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-sm font-medium",
              trendUp ? "text-emerald-600" : "text-rose-600"
            )}>
              <span>{trendUp ? "↑" : "↓"}</span>
              <span>{trend}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "p-3 rounded-xl",
            isOrange 
              ? "bg-white/20 backdrop-blur-sm" 
              : "bg-gradient-to-br from-orange-100 to-orange-50"
          )}>
            <Icon className={cn(
              "w-6 h-6",
              isOrange ? "text-white" : "text-orange-600"
            )} />
          </div>
        )}
      </div>
    </Card>
  );
}