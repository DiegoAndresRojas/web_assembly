import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: boolean
}

export function Button({
  variant = 'secondary',
  icon = false,
  className = '',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, icon ? 'btn-icon' : '', className]
    .filter(Boolean)
    .join(' ')
  return <button className={classes} {...rest} />
}
