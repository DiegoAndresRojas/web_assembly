// Every icon the app uses, in one place — the .dc.html template repeated
// these as raw inline <svg> at each usage site; centralizing them here is
// a deliberate cleanup the port makes possible.
import type { SVGProps } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox'> {
  size?: number
}

function Icon({
  path,
  viewBox = '0 0 256 256',
  size = 15,
  ...rest
}: IconProps & { path: string; viewBox?: string }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="currentColor" {...rest}>
      <path d={path} />
    </svg>
  )
}

export function BackIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"
    />
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
    />
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
    />
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192Z"
    />
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"
    />
  )
}

export function OpacityIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M128,24a8,8,0,0,0-5.66,2.34l-58,58A88,88,0,0,0,128,232a88,88,0,0,0,63.63-147.63l-58-58A8,8,0,0,0,128,24Zm0,192V40l52.31,52.32A72,72,0,0,1,128,216Z"
    />
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"
    />
  )
}

export function CameraTrackIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,256,176V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z"
    />
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0ZM122.34,157.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,132.69V40a8,8,0,0,0-16,0v92.69L93.66,106.34a8,8,0,0,0-11.32,11.32Z"
    />
  )
}

// ---------- assembly locks (24×24 geometry) ----------
export function LockIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"
    />
  )
}

export function LockOpenIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M7 10V7a5 5 0 0 1 9.53-2.11l-1.81.84A3 3 0 0 0 9 7v3h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Z"
    />
  )
}

export function RestoreIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M12 5a7 7 0 1 1-6.3 3.9l1.8.9A5 5 0 1 0 12 7v3L7.5 6 12 2v3Z"
    />
  )
}

// ---------- transport / timeline (24×24 geometry) ----------

export function PlayIcon(props: IconProps) {
  return <Icon {...props} viewBox="0 0 24 24" path="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
}

export function PauseIcon(props: IconProps) {
  return <Icon {...props} viewBox="0 0 24 24" path="M6 4h4v16H6zM14 4h4v16h-4z" />
}

export function SkipBackIcon(props: IconProps) {
  return <Icon {...props} viewBox="0 0 24 24" path="M5 4h3v16H5zM19 5.1v13.8a1 1 0 0 1-1.55.83L8.9 12.83a1 1 0 0 1 0-1.66l8.55-6.9A1 1 0 0 1 19 5.1Z" />
}

export function RepeatIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M4 11V9a3 3 0 0 1 3-3h10V3l4 4-4 4V8H7a1 1 0 0 0-1 1v2H4ZM20 13v2a3 3 0 0 1-3 3H7v3l-4-4 4-4v3h10a1 1 0 0 0 1-1v-2h2Z"
    />
  )
}

export function MagnetIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M5 3h4v8a3 3 0 0 0 6 0V3h4v8a7 7 0 0 1-14 0V3Z"
    />
  )
}

export function RecordIcon(props: IconProps) {
  return <Icon {...props} viewBox="0 0 24 24" path="M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" />
}

export function ArrowUpIcon(props: IconProps) {
  return <Icon {...props} viewBox="0 0 24 24" path="M12 3 20 11.5h-5.5V21h-5v-9.5H4L12 3Z" />
}

export function DuplicateIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M9 3h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3v-2h2V5h-9v2H8V4a1 1 0 0 1 1-1ZM4 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm1 2v9h9v-9H5Z"
    />
  )
}

export function FilmIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 15}
      height={props.size ?? 15}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M3 8.6h18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.6Z" />
      <path d="M3.4 3.1 21 5.3l-.4 3.1L3 6.2l.4-3.1Z" />
    </svg>
  )
}

/** A chevron pointing outward from a node, used for the four link-drag
 *  handles (top/right/bottom/left) — one shape, rotated per side, instead
 *  of four separate hand-authored paths. */
export function LinkHandleIcon({
  side,
  ...rest
}: IconProps & { side: 'top' | 'right' | 'bottom' | 'left' }) {
  const rotation = { top: 0, right: 90, bottom: 180, left: 270 }[side]
  return (
    <svg
      width={rest.size ?? 10}
      height={rest.size ?? 10}
      viewBox="0 0 256 256"
      fill="currentColor"
      style={{ transform: `rotate(${rotation}deg)` }}
      {...rest}
    >
      <path d="M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z" />
    </svg>
  )
}

export function SelectIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M5 3 L5 19 L9.5 15.5 L12.5 21 L15 19.5 L12 14 L19 14 Z"
    />
  )
}

export function MoveIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path={
        'M10 10 H14 V14 H10 Z ' +
        'M12 2 L15 8 H9 Z ' +
        'M12 22 L9 16 H15 Z ' +
        'M2 12 L8 9 V15 Z ' +
        'M22 12 L16 15 V9 Z'
      }
    />
  )
}

export function RotateIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      viewBox="0 0 24 24"
      path="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
    />
  )
}
