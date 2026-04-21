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
 * - `solid-theme`: solid color background derived from the current VS Code theme (required for JPEG)
 */
export type ExportSceneBackground = 'transparent' | 'solid-theme'

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
  /** Background mode. */
  background: ExportSceneBackground
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
