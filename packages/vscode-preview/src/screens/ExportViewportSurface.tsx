import type { DiagramView, DynamicViewDisplayVariant } from '@likec4/core/types'
import { LikeC4Diagram, pickViewBounds } from '@likec4/diagram'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
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

export type ExportViewportSurfaceReadyPayload = {
  element: HTMLElement | null
}

type ExportViewportKind = 'sequence' | 'deployment' | null

type ExportViewportProviderPayload = {
  element: HTMLElement | null
  exportViewKind: ExportViewportKind
}

type ExportViewportControllerState = {
  renderExportViewport: boolean
  exportDynamicViewVariant: DynamicViewDisplayVariant
  requestId: number
}

type ExportViewportControllerAction =
  | {
    type: 'show-export-viewport'
    variant: DynamicViewDisplayVariant
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
  const [{ renderExportViewport, exportDynamicViewVariant, requestId }, dispatch] = useReducer(
    exportViewportControllerReducer,
    {
      renderExportViewport: false,
      exportDynamicViewVariant: 'diagram' as DynamicViewDisplayVariant,
      requestId: 0,
    },
  )

  const resolveExportViewport = useCallback((payload: ExportViewportProviderPayload) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(payload)
  }, [])

  useEffect(() => {
    return extensionApi.registerExportViewportProvider(async () => {
      return await new Promise<ExportViewportProviderPayload>(resolve => {
        if (resolverRef.current) {
          resolveExportViewport({ element: null, exportViewKind: null })
        }

        const timeout = window.setTimeout(() => {
          if (resolverRef.current) {
            resolveExportViewport({ element: null, exportViewKind: null })
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
        })
      })
    }, () => {
      dispatch({ type: 'hide-export-viewport' })
      resolveExportViewport({ element: null, exportViewKind: null })
    })
  }, [currentDynamicViewVariantRef, resolveExportViewport])

  const onSurfaceReady = useCallback((payload: ExportViewportSurfaceReadyPayload) => {
    resolveExportViewport({
      element: payload.element,
      exportViewKind: getExportViewKind(viewType, exportDynamicViewVariant),
    })
  }, [exportDynamicViewVariant, resolveExportViewport, viewType])

  return {
    renderExportViewport,
    requestId,
    exportDynamicVariant: viewType === 'dynamic' ? exportDynamicViewVariant : undefined,
    onSurfaceReady,
  }
}

export function ExportViewportSurface({
  view,
  requestId,
  dynamicVariant,
  onReady,
}: {
  view: DiagramView
  requestId: number
  dynamicVariant: 'diagram' | 'sequence' | undefined
  onReady: (payload: ExportViewportSurfaceReadyPayload) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bounds = useMemo(() => pickViewBounds(view, dynamicVariant), [view, dynamicVariant])

  const width = Math.max(1, Math.ceil(bounds.width + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING))
  const height = Math.max(1, Math.ceil(bounds.height + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING))

  const surfaceStyle = useMemo(
    () => ({
      ...exportBaseStyle,
      width: `${width}px`,
      minWidth: `${width}px`,
      height: `${height}px`,
      minHeight: `${height}px`,
    }),
    [height, width],
  )

  const onInitialized = useCallback(() => {
    const root = rootRef.current
    if (!root) {
      onReady({ element: null })
      return
    }

    const x = Math.round(-bounds.x + EXPORT_PADDING)
    const y = Math.round(-bounds.y + EXPORT_PADDING)

    const viewport = root.querySelector<HTMLElement>('.react-flow__viewport')
    if (viewport) {
      viewport.style.transform = `translate(${x}px, ${y}px)`
    }

    const element = root.querySelector<HTMLElement>('.react-flow') ?? null
    onReady({ element })
  }, [bounds.x, bounds.y, onReady])

  return (
    <div ref={rootRef} style={surfaceStyle} data-testid="vscode-preview-export-surface">
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
  )
}
