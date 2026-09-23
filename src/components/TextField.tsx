import type { InputHTMLAttributes, ReactNode } from 'react'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
}

export function TextField({ label, className = '', ...rest }: TextFieldProps) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      <input className={['input', className].filter(Boolean).join(' ')} {...rest} />
    </div>
  )
}
