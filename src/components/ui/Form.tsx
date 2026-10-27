import { ChevronDown, type LucideIcon } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const fieldBase =
  'w-full rounded-lg border border-zinc-200 bg-white text-sm text-zinc-900 shadow-xs transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:hover:border-zinc-700'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon
  inputSize?: 'sm' | 'md'
  right?: ReactNode
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, inputSize = 'md', right, invalid, className = '', ...rest },
  ref,
) {
  const h = inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9'
  return (
    <div className={`relative ${className}`}>
      {Icon && (
        <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
      )}
      <input
        ref={ref}
        className={`${fieldBase} ${h} ${Icon ? 'pl-8' : 'pl-3'} ${right ? 'pr-9' : 'pr-3'} ${
          invalid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500/60' : ''
        }`}
        {...rest}
      />
      {right && <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{right}</div>}
    </div>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: 'sm' | 'md'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { inputSize = 'md', className = '', children, ...rest },
  ref,
) {
  const h = inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9'
  return (
    <div className={`relative ${className}`}>
      <select ref={ref} className={`${fieldBase} ${h} appearance-none pr-8 pl-3`} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-zinc-400" />
    </div>
  )
})

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      )}
    </label>
  )
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className = '',
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  className?: string
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-[13px] ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate && !checked
        }}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="size-4 cursor-pointer rounded border-zinc-300 accent-indigo-600 dark:border-zinc-700"
      />
      {label}
    </label>
  )
}

