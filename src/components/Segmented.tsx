export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string> {
  name: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ name, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="seg" style={{ width: '100%' }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className="seg-opt"
          style={{ flex: 1, justifyContent: 'center', padding: '6px 4px', fontSize: 11 }}
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  )
}
