import React from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AlertCircle } from "lucide-react";
import CurrencyDisplay from "../shared/CurrencyDisplay";
import moment from "moment";

export default function OpenInvoicesWidget({ invoices, totalOpen }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Offene Rechnungen</h3>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Offener Betrag</p>
          <CurrencyDisplay value={totalOpen} className="text-xl font-bold text-amber-600" />
        </div>
      </div>
      
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Rechnungsnr.</TableHead>
              <TableHead>Kunde</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Fällig am</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                  Keine offenen Rechnungen
                </TableCell>
              </TableRow>
            ) : (
              invoices.slice(0, 10).map((invoice) => {
                const isOverdue = invoice.faelligAm && moment(invoice.faelligAm).isBefore(moment(), 'day');
                return (
                  <TableRow key={invoice.id} className="hover:bg-slate-50">
                    <TableCell>
                      <Link 
                        to={createPageUrl(`InvoiceDetail?id=${invoice.id}`)}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {invoice.rechnungsNummer}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{invoice.kundeName}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay value={invoice.summeBrutto} className="font-medium" />
                    </TableCell>
                    <TableCell className={isOverdue ? 'text-rose-600 font-medium' : 'text-slate-600'}>
                      {invoice.faelligAm ? moment(invoice.faelligAm).format('DD.MM.YYYY') : '-'}
                      {isOverdue && <span className="ml-2 text-xs">Überfällig</span>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}