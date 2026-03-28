import { cn } from '@/lib/utils'

interface Props {
  value?: number | null
  className?: string
}

export default function CurrencyDisplay({ value, className }: Props) {
  const formatted = new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value ?? 0)

  return <span className={cn(className)}>{formatted}</span>
}
