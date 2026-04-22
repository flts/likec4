/**
 * The format of the exported image.
 */
export type ExportFormat = 'svg' | 'png' | 'jpeg'

/**
 * The scene mode for the export.
 * - `diagram`: export the diagram only (default)
 * - `diagram-with-legend`: export the diagram with a legend overlay
 */
export type ExportSceneMode = 'diagram' | 'diagram-with-legend'

/**
 * The background mode for the export.
 * - `transparent`: transparent background (suitable for SVG/PNG)
 * - `solid-theme`: solid color background derived from the resolved export theme (required for JPEG)
 */
export type ExportSceneBackground = 'transparent' | 'solid-theme'

/** Resolved light/dark color scheme used by the export surface. */
export type ExportSceneColorScheme = 'light' | 'dark'

/**
 * Metadata describing the export scene dimensions and rendering options.
 */
export interface ExportSceneMetadata {
  /** Logical width of the diagram in CSS pixels. */
  logicalWidth: number
  /** Logical height of the diagram in CSS pixels. */
  logicalHeight: number
  /** Export scene mode. */
  mode: ExportSceneMode
  /** Resolved light/dark scheme applied only to the export surface. */
  colorScheme: ExportSceneColorScheme
  /** Background mode. */
  background: ExportSceneBackground
  /** Solid background color resolved from the export surface theme. */
  backgroundColor: string
  /** The view kind, used to determine the output filename suffix. */
  exportViewKind: 'sequence' | 'deployment' | null
}

/**
 * The full export scene payload, containing the export root element and its metadata.
 */
export interface ExportScenePayload {
  /** The DOM element that acts as the export root. Has `data-export-root` attribute. */
  element: HTMLElement
  /** Scene metadata. */
  metadata: ExportSceneMetadata
}
