import React from 'react';
import { Card } from "@/components/ui/card";
import CurrencyDisplay from "../shared/CurrencyDisplay";

export default function OfferSummary({ positions, reverseCharge = false }) {
  // Berechnungen
  const zwischensummeNetto = positions.reduce((sum, p) => {
    const menge = parseFloat(p.menge) || 0;
    const einzelpreis = parseFloat(p.einzelpreisNetto) || 0;
    return sum + (menge * einzelpreis);
  }, 0);
  
  const gesamtRabatt = positions.reduce((sum, p) => {
    const menge = parseFloat(p.menge) || 0;
    const einzelpreis = parseFloat(p.einzelpreisNetto) || 0;
    const rabatt = parseFloat(p.rabattProzent) || 0;
    return sum + ((menge * einzelpreis) * (rabatt / 100));
  }, 0);
  
  const nettoNachRabatt = zwischensummeNetto - gesamtRabatt;
  
  // USt nach Sätzen gruppieren - bei reverseCharge alles auf 0% setzen
  const ustGruppen = {};
  positions.forEach(p => {
    const ustSatz = reverseCharge ? 0 : (parseFloat(p.ustSatz) || 19);
    const gesamtNetto = parseFloat(p.gesamtNetto) || 0;
    const ustBetrag = gesamtNetto * (ustSatz / 100);
    
    if (!ustGruppen[ustSatz]) {
      ustGruppen[ustSatz] = { satz: ustSatz, betrag: 0 };
    }
    ustGruppen[ustSatz].betrag += ustBetrag;
  });
  
  const gesamtUst = Object.values(ustGruppen).reduce((sum, g) => sum + g.betrag, 0);
  const brutto = nettoNachRabatt + gesamtUst;

  return (
    <Card className="p-4 sm:p-6 bg-slate-50 border-slate-200">
      <div className="space-y-2 sm:space-y-3 text-sm sm:text-base">
        <div className="flex justify-between text-slate-600">
          <span>Zwischensumme Netto</span>
          <CurrencyDisplay value={zwischensummeNetto} />
        </div>
        
        {gesamtRabatt > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>Rabatt gesamt</span>
            <span>- <CurrencyDisplay value={gesamtRabatt} /></span>
          </div>
        )}
        
        <div className="flex justify-between font-medium text-slate-700 border-t border-slate-200 pt-2 sm:pt-3">
          <span>Nettobetrag</span>
          <CurrencyDisplay value={nettoNachRabatt} />
        </div>
        
        {Object.values(ustGruppen).map(gruppe => (
          <div key={gruppe.satz} className="flex justify-between text-slate-600">
            <span>+ {gruppe.satz}% USt</span>
            <CurrencyDisplay value={gruppe.betrag} />
          </div>
        ))}
        
        <div className="flex justify-between text-lg sm:text-xl font-bold text-slate-900 border-t-2 border-slate-300 pt-2 sm:pt-3">
          <span>Gesamtbetrag Brutto</span>
          <CurrencyDisplay value={brutto} />
        </div>
      </div>
    </Card>
  );
}