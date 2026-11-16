// Handing a file to the browser's download flow.

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Downloads the file held in a data URL (how imported meshes are stored).
 *  Goes through a Blob: long data URLs are unreliable as a link target. */
export async function downloadDataUrl(dataUrl: string, filename: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  triggerDownload(blob, filename)
}
