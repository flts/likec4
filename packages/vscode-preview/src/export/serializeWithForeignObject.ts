import { collectEmbeddedStyles, collectRootCssVariables, resolveThemeBackgroundColor } from './collectEmbeddedStyles'
import type { ExportSceneMetadata } from './exportTypes'

/**
 * Serializes an HTML element as a standalone SVG document using `<foreignObject>`.
 *
 * The SVG embeds all document styles and CSS custom properties inline, so it is
 * self-contained and can be rendered without the original page context.
 *
 * Background modes:
 * - `transparent`: no background fill
 * - `solid-theme`: filled with the current VS Code editor background color
 *
 * @param element The export root element (typically the `data-export-root` container)
 * @param metadata Scene metadata providing dimensions and background mode
 * @returns A complete SVG string
 */
export function serializeWithForeignObject(
  element: HTMLElement,
  metadata: ExportSceneMetadata,
): string {
  const { logicalWidth, logicalHeight, background } = metadata

  const embeddedStyles = collectEmbeddedStyles(element)
  const rootVars = collectRootCssVariables()

  // Serialize element HTML — use XMLSerializer for a well-formed output.
  // Fall back to outerHTML if XMLSerializer fails (e.g. very deep trees).
  let elementContent: string
  try {
    const serializer = new XMLSerializer()
    elementContent = serializer.serializeToString(element)
  } catch {
    elementContent = element.outerHTML
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml"`,
    ` width="${logicalWidth}" height="${logicalHeight}"`,
    ` viewBox="0 0 ${logicalWidth} ${logicalHeight}"`,
    ` preserveAspectRatio="xMidYMid meet">`,
    `<defs>`,
    `<style>`,
    rootVars,
    embeddedStyles,
    `</style>`,
    `</defs>`,
  ]

  if (background === 'solid-theme') {
    const bgColor = resolveThemeBackgroundColor()
    parts.push(`<rect width="100%" height="100%" fill="${bgColor}"/>`)
  }

  parts.push(
    `<foreignObject width="${logicalWidth}" height="${logicalHeight}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${logicalWidth}px;height:${logicalHeight}px;overflow:hidden;margin:0;padding:0;">`,
    elementContent,
    `</div>`,
    `</foreignObject>`,
    `</svg>`,
  )

  return parts.join('')
}

/**
 * Applies max-dimension constraints to an SVG string by rescaling the root SVG element.
 * If the SVG is within both limits, it is returned unchanged.
 */
export function applySvgMaxDimensions(
  svgText: string,
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): string {
  if (!Number.isFinite(maxWidth) && !Number.isFinite(maxHeight)) {
    return svgText
  }

  const ratioByWidth = Number.isFinite(maxWidth)
    ? maxWidth / Math.max(1, sourceWidth)
    : Number.POSITIVE_INFINITY
  const ratioByHeight = Number.isFinite(maxHeight)
    ? maxHeight / Math.max(1, sourceHeight)
    : Number.POSITIVE_INFINITY
  const scale = Math.max(0.1, Math.min(1, ratioByWidth, ratioByHeight))

  if (scale >= 1) {
    return svgText
  }

  const targetWidth = Math.max(1, Math.floor(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.floor(sourceHeight * scale))

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement

  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    return svgText
  }

  root.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`)
  root.setAttribute('width', String(targetWidth))
  root.setAttribute('height', String(targetHeight))
  if (!root.getAttribute('preserveAspectRatio')) {
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }

  return new XMLSerializer().serializeToString(root)
}
