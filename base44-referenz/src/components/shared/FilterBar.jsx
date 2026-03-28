import React from 'react';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export default function FilterBar({ 
  filters, 
  onFilterChange,
  onReset,
  yearOptions = [],
  statusOptions = [],
  typeOptions = [],
  employeeOptions = [],
  showSearch = true,
  searchPlaceholder = "Suchen..."
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-wrap gap-3">
        {showSearch && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={searchPlaceholder}
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              className="pl-9 border-slate-200"
            />
          </div>
        )}
        
        {yearOptions.length > 0 && (
          <Select value={filters.year || 'all'} onValueChange={(v) => onFilterChange({ ...filters, year: v })}>
            <SelectTrigger className="w-[130px] border-slate-200">
              <SelectValue placeholder="Jahr" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {statusOptions.length > 0 && (
          <Select value={filters.status || 'all'} onValueChange={(v) => onFilterChange({ ...filters, status: v })}>
            <SelectTrigger className="w-[160px] border-slate-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {typeOptions.length > 0 && (
          <Select value={filters.type || 'all'} onValueChange={(v) => onFilterChange({ ...filters, type: v })}>
            <SelectTrigger className="w-[160px] border-slate-200">
              <SelectValue placeholder="Typ" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {employeeOptions.length > 0 && (
          <Select value={filters.employee || 'all'} onValueChange={(v) => onFilterChange({ ...filters, employee: v })}>
            <SelectTrigger className="w-[160px] border-slate-200">
              <SelectValue placeholder="Mitarbeiter" />
            </SelectTrigger>
            <SelectContent>
              {employeeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <Button variant="ghost" size="icon" onClick={onReset} className="text-slate-500">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}