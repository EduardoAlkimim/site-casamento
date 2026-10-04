import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import styles from './Field.module.css'

type Common = { label: string; hint?: string; error?: string; required?: boolean }

type InputFieldProps = Common & InputHTMLAttributes<HTMLInputElement> & { multiline?: false }
type TextareaFieldProps = Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true }

export function Field(props: InputFieldProps | TextareaFieldProps) {
  const { label, hint, error, required, multiline, className, ...rest } = props
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = {
    id,
    className: styles.control,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  }

  return (
    <div className={[styles.field, error && styles.invalid, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea rows={5} {...control} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...control} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
