import { cn } from '@/lib/utils'
import { num } from '@/lib/money'

interface Props {
  value?: number | string | null
  className?: string
}

export default function CurrencyDisplay({ value, className }: Props) {
  // num() garantiert eine endliche Zahl — verhindert "NaN €" bei ungültigen Werten
  const formatted = new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(num(value, 0))

  return <span className={cn(className)}>{formatted}</span>
}
