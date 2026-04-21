import { resolveThemeBackgroundColor } from './collectEmbeddedStyles'
import type { ExportSceneMetadata } from './exportTypes'

/**
 * Serializes an HTML element to an SVG string using the SnapDOM library.
 *
 * SnapDOM captures the DOM subtree by deeply cloning it, inlining computed styles,
 * converting images/fonts to data URIs, and producing a self-contained SVG.
 * This approach handles fonts, pseudo-elements, and CSS counters more accurately
 * than the foreignObject approach, at the cost of a heavier up-front clone.
 *
 * This backend is loaded lazily via dynamic import so it does not increase the
 * initial bundle size when the foreignObject backend is the default.
 *
 * @param element The export root element (typically the `data-export-root` container)
 * @param metadata Scene metadata providing dimensions and background mode
 * @returns A complete SVG string, or null if SnapDOM failed
 */
export async function serializeWithSnapdom(
  element: HTMLElement,
  metadata: ExportSceneMetadata,
): Promise<string | null> {
  try {
    // Lazy-load SnapDOM to keep initial bundle small
    const { snapdom } = await import('@zumer/snapdom')

    const backgroundColor = metadata.background === 'solid-theme'
      ? resolveThemeBackgroundColor()
      : undefined

    const capture = await snapdom(element, {
      ...(backgroundColor !== undefined ? { backgroundColor } : {}),
    })

    const svgImg = await capture.toSvg()

    // The image src is a data URL like: "data:image/svg+xml,..." or base64 encoded
    const src = svgImg.src
    if (!src) {
      return null
    }

    const prefix = 'data:image/svg+xml,'
    const prefixBase64 = 'data:image/svg+xml;base64,'

    if (src.startsWith(prefixBase64)) {
      return atob(src.slice(prefixBase64.length))
    } else if (src.startsWith(prefix)) {
      return decodeURIComponent(src.slice(prefix.length))
    }

    // Unknown encoding — try splitting on comma
    const comma = src.indexOf(',')
    if (comma !== -1) {
      const payload = src.slice(comma + 1)
      try {
        return atob(payload)
      } catch {
        return decodeURIComponent(payload)
      }
    }

    return null
  } catch (err) {
    console.error('[likec4-export] serializeWithSnapdom failed:', err)
    return null
  }
}
