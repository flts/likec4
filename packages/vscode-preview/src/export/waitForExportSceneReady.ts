/**
 * Waits for all images inside the element to load (or error out), with a timeout.
 */
function waitForImages(root: HTMLElement, timeoutMs: number): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
  if (images.length === 0) {
    return Promise.resolve()
  }

  const imagePromises = images.map(img => {
    if (img.complete) {
      return Promise.resolve()
    }
    return new Promise<void>(resolve => {
      const cleanup = () => {
        img.removeEventListener('load', onLoad)
        img.removeEventListener('error', onError)
      }
      const onLoad = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        resolve() // resolve even on error so we don't stall
      }
      img.addEventListener('load', onLoad, { once: true })
      img.addEventListener('error', onError, { once: true })
    })
  })

  const allImages = Promise.all(imagePromises).then(() => {})

  return new Promise<void>(resolve => {
    const timerId = window.setTimeout(() => resolve(), timeoutMs)
    allImages.then(() => {
      window.clearTimeout(timerId)
      resolve()
    })
  })
}

/**
 * Waits for one animation frame.
 */
function nextAnimationFrame(): Promise<void> {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

/**
 * Waits until the export scene is stable and ready for serialization.
 *
 * Wait sequence:
 * 1. `document.fonts.ready` — all fonts loaded
 * 2. Descendant images loaded (with timeout)
 * 3. Two animation frames — layout and paint to settle
 *
 * @param element The export root element
 * @param imageTimeoutMs Timeout in ms to wait for images (default 2000ms)
 */
export async function waitForExportSceneReady(
  element: HTMLElement,
  imageTimeoutMs = 2000,
): Promise<void> {
  // 1. Wait for all fonts to be ready
  await document.fonts.ready

  // 2. Wait for descendant images to load
  await waitForImages(element, imageTimeoutMs)

  // 3. Two animation frames for layout and paint to settle
  await nextAnimationFrame()
  await nextAnimationFrame()
}
