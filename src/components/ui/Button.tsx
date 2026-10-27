import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Misc'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'xs' | 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-600/50',
  secondary:
    'border border-zinc-200 bg-white text-zinc-700 shadow-xs hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white',
  ghost:
    'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-500 active:bg-rose-700 disabled:bg-rose-600/50',
  'danger-ghost': 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
}

const sizes: Record<Size, string> = {
  xs: 'h-7 gap-1.5 px-2 text-xs',
  sm: 'h-8 gap-1.5 px-2.5 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, children, className = '', disabled, ...rest },
  ref,
) {
  const iconSize = size === 'md' ? 'size-4' : 'size-3.5'
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={`focus-ring inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className={iconSize} /> : Icon && <Icon className={iconSize} />}
      {children}
      {IconRight && <IconRight className={iconSize} />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  size?: 'xs' | 'sm' | 'md'
  active?: boolean
  loading?: boolean
  tone?: 'default' | 'danger'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'sm', active, loading, tone = 'default', className = '', ...rest },
  ref,
) {
  const box = size === 'xs' ? 'size-6' : size === 'sm' ? 'size-8' : 'size-9'
  const ic = size === 'xs' ? 'size-3.5' : 'size-4'
  const toneCls =
    tone === 'danger'
      ? 'text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400'
      : active
        ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100'
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={`focus-ring inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${box} ${toneCls} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className={ic} /> : <Icon className={ic} />}
    </button>
  )
})
