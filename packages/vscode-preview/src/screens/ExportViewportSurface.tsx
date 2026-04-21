import type { DiagramView, DynamicViewDisplayVariant } from '@likec4/core/types'
import { LikeC4Diagram, pickViewBounds } from '@likec4/diagram'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ExportSceneBackground, ExportSceneMetadata, ExportSceneMode } from '../export/exportTypes'
import { waitForExportSceneReady } from '../export/waitForExportSceneReady'
import { ExtensionApi as extensionApi } from '../vscode'

const exportBaseStyle = {
  position: 'fixed',
  left: '-20000px',
  top: 0,
  padding: '0',
  margin: '0',
  marginRight: 'auto',
  marginBottom: 'auto',
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  background: 'transparent',
  zIndex: 2,
} as const

const EXPORT_PADDING = 20
const EXPORT_EXTRA_PADDING = 16
const EXPORT_PROVIDER_TIMEOUT_MS = 5000
/** Timeout for waiting for descendant images to load in the export scene. */
const EXPORT_IMAGE_WAIT_TIMEOUT_MS = 2000

// ---------------------------------------------------------------------------
// Phase 2 + 13: Export scene mode types and metadata
// ---------------------------------------------------------------------------

/**
 * Ready payload returned by the export surface once the scene is stable.
 * Contains the export element and associated scene metadata.
 */
export type ExportViewportSurfaceReadyPayload = {
  /** The export element (has `data-export-root`), or null on failure. */
  element: HTMLElement | null
  /** Scene metadata (Phase 13). Null when element is null. */
  metadata: ExportSceneMetadata | null
}

type ExportViewportKind = 'sequence' | 'deployment' | null

/**
 * Full provider payload passed back to the messenger export handlers.
 */
export type ExportViewportProviderPayload = {
  element: HTMLElement | null
  metadata: ExportSceneMetadata | null
  exportViewKind: ExportViewportKind
}

type ExportViewportControllerState = {
  renderExportViewport: boolean
  exportDynamicViewVariant: DynamicViewDisplayVariant
  exportSceneMode: ExportSceneMode
  requestId: number
}

type ExportViewportControllerAction =
  | {
    type: 'show-export-viewport'
    variant: DynamicViewDisplayVariant
    mode: ExportSceneMode
  }
  | {
    type: 'hide-export-viewport'
  }

function exportViewportControllerReducer(
  state: ExportViewportControllerState,
  action: ExportViewportControllerAction,
): ExportViewportControllerState {
  switch (action.type) {
    case 'show-export-viewport':
      return {
        renderExportViewport: true,
        exportDynamicViewVariant: action.variant,
        exportSceneMode: action.mode,
        requestId: state.requestId + 1,
      }
    case 'hide-export-viewport':
      if (!state.renderExportViewport) {
        return state
      }
      return {
        ...state,
        renderExportViewport: false,
      }
    default:
      return state
  }
}

function getExportViewKind(
  viewType: DiagramView['_type'] | undefined,
  dynamicVariant: DynamicViewDisplayVariant,
): ExportViewportKind {
  if (viewType === 'deployment') {
    return 'deployment'
  }
  if (viewType === 'dynamic' && dynamicVariant === 'sequence') {
    return 'sequence'
  }
  return null
}

export function useExportViewportProvider({
  viewType,
  currentDynamicViewVariantRef,
}: {
  viewType: DiagramView['_type'] | undefined
  currentDynamicViewVariantRef: React.MutableRefObject<DynamicViewDisplayVariant>
}) {
  const resolverRef = useRef<((payload: ExportViewportProviderPayload) => void) | null>(null)
  const [
    { renderExportViewport, exportDynamicViewVariant, exportSceneMode, requestId },
    dispatch,
  ] = useReducer(exportViewportControllerReducer, {
    renderExportViewport: false,
    exportDynamicViewVariant: 'diagram' as DynamicViewDisplayVariant,
    exportSceneMode: 'diagram' as ExportSceneMode,
    requestId: 0,
  })

  const resolveExportViewport = useCallback((payload: ExportViewportProviderPayload) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(payload)
  }, [])

  useEffect(() => {
    return extensionApi.registerExportViewportProvider(async () => {
      return await new Promise<ExportViewportProviderPayload>(resolve => {
        if (resolverRef.current) {
          resolveExportViewport({ element: null, metadata: null, exportViewKind: null })
        }

        const timeout = window.setTimeout(() => {
          if (resolverRef.current) {
            resolveExportViewport({ element: null, metadata: null, exportViewKind: null })
            dispatch({ type: 'hide-export-viewport' })
          }
        }, EXPORT_PROVIDER_TIMEOUT_MS)

        resolverRef.current = (payload) => {
          window.clearTimeout(timeout)
          resolve(payload)
        }

        dispatch({
          type: 'show-export-viewport',
          variant: currentDynamicViewVariantRef.current,
          mode: 'diagram',
        })
      })
    }, () => {
      dispatch({ type: 'hide-export-viewport' })
      resolveExportViewport({ element: null, metadata: null, exportViewKind: null })
    })
  }, [currentDynamicViewVariantRef, resolveExportViewport])

  const onSurfaceReady = useCallback((payload: ExportViewportSurfaceReadyPayload) => {
    resolveExportViewport({
      element: payload.element,
      metadata: payload.metadata,
      exportViewKind: getExportViewKind(viewType, exportDynamicViewVariant),
    })
  }, [exportDynamicViewVariant, resolveExportViewport, viewType])

  return {
    renderExportViewport,
    requestId,
    exportSceneMode,
    exportDynamicVariant: viewType === 'dynamic' ? exportDynamicViewVariant : undefined,
    onSurfaceReady,
  }
}

/**
 * Phase 1: Export surface component that renders a hidden, non-interactive LikeC4Diagram
 * positioned off-screen. Exposes a stable export element marked with `data-export-root`.
 *
 * Phase 3: Readiness is hardened — we wait for `document.fonts.ready`, descendant
 * images, and two animation frames before resolving the `onReady` callback.
 *
 * Phase 13: Returns metadata (logicalWidth, logicalHeight, mode, background) alongside the element.
 */
export function ExportViewportSurface({
  view,
  requestId,
  dynamicVariant,
  mode,
  onReady,
}: {
  view: DiagramView
  requestId: number
  dynamicVariant: 'diagram' | 'sequence' | undefined
  /** Phase 2: explicit scene mode. */
  mode: ExportSceneMode
  onReady: (payload: ExportViewportSurfaceReadyPayload) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bounds = useMemo(() => pickViewBounds(view, dynamicVariant), [view, dynamicVariant])

  const logicalWidth = Math.max(
    1,
    Math.ceil(bounds.width + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING),
  )
  const logicalHeight = Math.max(
    1,
    Math.ceil(bounds.height + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING),
  )

  const surfaceStyle = useMemo(
    () => ({
      ...exportBaseStyle,
      width: `${logicalWidth}px`,
      minWidth: `${logicalWidth}px`,
      height: `${logicalHeight}px`,
      minHeight: `${logicalHeight}px`,
    }),
    [logicalWidth, logicalHeight],
  )

  // Phase 3: Harden readiness — wait for fonts, images, and animation frames
  // before calling onReady. Also apply the viewport transform here.
  const onInitialized = useCallback(() => {
    const root = rootRef.current
    if (!root) {
      onReady({ element: null, metadata: null })
      return
    }

    // Export the inner diagram container, not the hidden/off-screen wrapper.
    // The wrapper intentionally uses opacity and large negative left values.
    const exportElement = root.querySelector<HTMLElement>('[data-export-root]')
    if (!exportElement) {
      onReady({ element: null, metadata: null })
      return
    }
    const attributionNodes = exportElement.querySelectorAll('.react-flow__attribution')
    attributionNodes.forEach(node => node.remove())

    // Apply the viewport translation so diagram content is positioned correctly
    // within the export surface.
    const x = Math.round(-bounds.x + EXPORT_PADDING)
    const y = Math.round(-bounds.y + EXPORT_PADDING)

    const viewport = root.querySelector<HTMLElement>('.react-flow__viewport')
    if (viewport) {
      viewport.style.transform = `translate(${x}px, ${y}px)`
    }

    // Phase 13: Build scene metadata
    const background: ExportSceneBackground = 'transparent'
    const metadata: ExportSceneMetadata = {
      logicalWidth,
      logicalHeight,
      mode,
      background,
      exportViewKind: null, // will be set by the provider
    }

    // Phase 3: Wait for scene readiness before resolving
    waitForExportSceneReady(root, EXPORT_IMAGE_WAIT_TIMEOUT_MS).then(
      () => onReady({ element: exportElement, metadata }),
      () => onReady({ element: exportElement, metadata }), // proceed even on error
    )
  }, [bounds.x, bounds.y, logicalWidth, logicalHeight, mode, onReady])

  return (
    // Keep wrapper hidden/off-screen so it doesn't affect interactive UI.
    <div
      ref={rootRef}
      style={surfaceStyle}
      data-export-scene-mode={mode}
      data-testid="vscode-preview-export-surface"
    >
      {/* Phase 1: Stable export root without hidden wrapper styles. */}
      <div data-export-root="" data-export-diagram="" style={{ width: '100%', height: '100%' }}>
        <LikeC4Diagram
          key={`export-${view.id}-${dynamicVariant ?? 'none'}-${requestId}`}
          view={view}
          fitView={false}
          fitViewPadding={0}
          background="transparent"
          reduceGraphics={false}
          dynamicViewVariant={dynamicVariant}
          pannable={false}
          zoomable={false}
          controls={false}
          showNavigationButtons={false}
          enableElementDetails={false}
          enableRelationshipBrowser={false}
          enableElementTags={false}
          enableSearch={false}
          enableRelationshipDetails={false}
          enableCompareWithLatest={false}
          enableNotations={false}
          enableFocusMode={false}
          enableDynamicViewWalkthrough={false}
          nodesSelectable={false}
          onInitialized={onInitialized}
        />
      </div>
    </div>
  )
}
