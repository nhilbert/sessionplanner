import type { ReactNode } from 'react'
import { Checkbox, cx } from '@/components/ui'

/** A checkbox with its text beside it; the text toggles it too. */
export function Option({ checked, onChange, children, className }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-[13px]', className)} onClick={() => onChange(!checked)}>
      <Checkbox checked={checked} onChange={onChange} label={typeof children === 'string' ? children : undefined} />
      <span>{children}</span>
    </span>
  )
}
