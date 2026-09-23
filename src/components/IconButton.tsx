import type { ButtonHTMLAttributes } from 'react'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  /** Bigger touch target for the board/gizmo tool switcher vs. the small
   *  per-row eye/opacity/kill icons. */
  size?: 'sm' | 'md'
}

export function IconButton({
  active = false,
  size = 'sm',
  className = '',
  ...rest
}: IconButtonProps) {
  const base = size === 'md' ? 'tool-btn' : 'icon-btn'
  const activeClass = active ? `${base}--active` : ''
  return <button className={[base, activeClass, className].filter(Boolean).join(' ')} {...rest} />
}
