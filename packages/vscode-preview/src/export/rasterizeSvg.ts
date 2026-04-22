import { resolveThemeBackgroundColor } from './collectEmbeddedStyles'

export interface RasterizeOptions {
  /** Target image format. */
  format: 'png' | 'jpeg'
  /**
   * Device pixel ratio / scale factor for rasterization.
   * Higher values produce sharper images at the cost of larger file size.
   * Defaults to 1.
   */
  pixelRatio?: number
  /**
   * Max logical width constraint. If the source is wider, it will be downscaled.
   * Infinite means no constraint.
   */
  maxWidth?: number
  /**
   * Max logical height constraint. If the source is taller, it will be downscaled.
   * Infinite means no constraint.
   */
  maxHeight?: number
  /**
   * JPEG quality in range 0..1. Only used when `format` is `'jpeg'`.
   * Defaults to 0.92.
   */
  quality?: number
  /** Solid background color used for JPEG export. */
  backgroundColor?: string
}

/**
 * Rasterizes an SVG string to a PNG or JPEG Blob using an offscreen Canvas.
 *
 * The SVG is loaded as an Image via a Blob URL, drawn onto a canvas at the
 * requested pixel ratio, and then converted to the target format.
 *
 * For JPEG exports, a solid background is filled before drawing the SVG to
 * eliminate transparency artifacts.
 *
 * @param svgText Complete SVG string (not a data URL)
 * @param sourceWidth Logical width of the SVG in CSS pixels
 * @param sourceHeight Logical height of the SVG in CSS pixels
 * @param options Rasterization options
 * @returns A Blob of the rasterized image, or null on failure
 */
export async function rasterizeSvg(
  svgText: string,
  sourceWidth: number,
  sourceHeight: number,
  options: RasterizeOptions,
): Promise<Blob | null> {
  const {
    format,
    pixelRatio = 1,
    maxWidth = Infinity,
    maxHeight = Infinity,
    quality = 0.92,
    backgroundColor,
  } = options

  // Apply max-dimension scaling
  const ratioByWidth = Number.isFinite(maxWidth)
    ? maxWidth / Math.max(1, sourceWidth)
    : Number.POSITIVE_INFINITY
  const ratioByHeight = Number.isFinite(maxHeight)
    ? maxHeight / Math.max(1, sourceHeight)
    : Number.POSITIVE_INFINITY
  const effectivePixelRatio = Math.max(0.1, Math.min(pixelRatio, ratioByWidth, ratioByHeight))

  const canvasWidth = Math.max(1, Math.ceil(sourceWidth * effectivePixelRatio))
  const canvasHeight = Math.max(1, Math.ceil(sourceHeight * effectivePixelRatio))

  const svgUrl = svgToDataUrl(svgText)

  const image = await loadImage(svgUrl)

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  // For JPEG, fill the canvas with the solid theme background first
  // (JPEG has no alpha channel, transparent areas become black without this)
  if (format === 'jpeg') {
    ctx.fillStyle = backgroundColor ?? resolveThemeBackgroundColor()
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  }

  ctx.scale(effectivePixelRatio, effectivePixelRatio)
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight)

  return await canvasToBlob(canvas, format, quality)
}

function svgToDataUrl(svgText: string): string {
  const utf8 = new TextEncoder().encode(svgText)
  let binary = ''
  for (const byte of utf8) {
    binary += String.fromCharCode(byte)
  }
  const encoded = btoa(binary)
  return `data:image/svg+xml;base64,${encoded}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load SVG as image (source length: ${src.length})`))
    img.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg',
  quality: number,
): Promise<Blob | null> {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), mimeType, quality)
  })
}
