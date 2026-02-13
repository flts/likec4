import type { ProjectId, scalar } from '@likec4/core'
import { LikeC4Model } from '@likec4/core/model'
import type { DynamicViewDisplayVariant } from '@likec4/core/types'
import {
  LikeC4Diagram,
  LikeC4EditorProvider,
  LikeC4ModelProvider,
  pickViewBounds,
  useDiagramContext,
} from '@likec4/diagram'
import { Button, Overlay } from '@mantine/core'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { only } from 'remeda'
import { likec4Container, likec4ParsingScreen } from '../App.css'
import { ErrorMessage } from '../QueryErrorBoundary'
import {
  openProjectsScreen,
  setLastClickedNode,
  setLayoutType,
  useComputedModelData,
  useDiagramView,
  useLikeC4EditorPort,
} from '../state'
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
const DEFAULT_DYNAMIC_VIEW_VARIANT: DynamicViewDisplayVariant = 'diagram'
const MAIN_FIT_VIEW_PADDING = {
  top: '70px',
  bottom: '30px',
  left: '60px',
  right: '30px',
} as const

function DynamicViewVariantTracker({
  onSync,
}: {
  onSync: (variant: DynamicViewDisplayVariant) => void
}) {
  const variant = useDiagramContext(ctx => ctx.dynamicViewVariant)
  const lastLoggedVariantRef = useRef<DynamicViewDisplayVariant | null>(null)

  useEffect(() => {
    onSync(variant)

    if (lastLoggedVariantRef.current !== variant) {
      console.log('[likec4-preview] dynamic view variant changed', variant)
      lastLoggedVariantRef.current = variant
    }
  }, [onSync, variant])

  return null
}

export function ViewScreen() {
  const { error, model } = useComputedModelData()
  const editor = useLikeC4EditorPort()
  const likec4Model = useMemo(() => model ? LikeC4Model.create(model) : null, [model])

  if (!likec4Model) {
    return (
      <>
        <section>
          {error ? <ErrorMessage error={error} /> : <p>Parsing your model...</p>}
          <p>
            <Button color="gray" onClick={extensionApi.closeMe}>
              Close
            </Button>
          </p>
        </section>
      </>
    )
  }

  return (
    <LikeC4ModelProvider key={likec4Model.projectId} likec4model={likec4Model}>
      {error && <ErrorMessage error={error} />}
      <LikeC4EditorProvider editor={editor}>
        <LikeC4ViewMemo projectId={likec4Model.project.id} />
      </LikeC4EditorProvider>
    </LikeC4ModelProvider>
  )
}
const LikeC4ViewMemo = memo<{ projectId: ProjectId }>(({ projectId }) => {
  const {
    view,
    error,
  } = useDiagramView(projectId)

  const exportViewportRef = useRef<HTMLDivElement>(null)
  const exportResolverRef = useRef<
    ((payload: {
      element: HTMLElement | null
      exportViewKind: 'sequence' | 'deployment' | null
    }) => void) | null
  >(null)
  const dynamicViewVariantRef = useRef<DynamicViewDisplayVariant>(DEFAULT_DYNAMIC_VIEW_VARIANT)

  const [renderExportViewport, setRenderExportViewport] = useState(false)
  const [exportDynamicViewVariant, setExportDynamicViewVariant] = useState<DynamicViewDisplayVariant>(
    DEFAULT_DYNAMIC_VIEW_VARIANT,
  )

  const setRenderExportViewportState = useCallback((value: boolean) => {
    setRenderExportViewport(prev => (prev === value ? prev : value))
  }, [])

  const syncDynamicViewVariantRef = useCallback((value: DynamicViewDisplayVariant) => {
    dynamicViewVariantRef.current = value
  }, [])

  const exportDynamicVariant = view?._type === 'dynamic' ? exportDynamicViewVariant : undefined
  const bounds = useMemo(() => pickViewBounds(view!, exportDynamicVariant), [view, exportDynamicVariant])
  const exportWidth = Math.max(1, Math.ceil(bounds.width + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING))
  const exportHeight = Math.max(1, Math.ceil(bounds.height + EXPORT_PADDING * 2 + EXPORT_EXTRA_PADDING))

  const exportSurfaceStyle = useMemo(
    () => ({
      ...exportBaseStyle,
      width: `${exportWidth}px`,
      minWidth: `${exportWidth}px`,
      height: `${exportHeight}px`,
      minHeight: `${exportHeight}px`,
    }),
    [exportWidth, exportHeight],
  )

  const resolveExportViewport = useCallback((payload: {
    element: HTMLElement | null
    exportViewKind: 'sequence' | 'deployment' | null
  }) => {
    const resolve = exportResolverRef.current
    exportResolverRef.current = null
    resolve?.(payload)
  }, [])

  useEffect(() => {
    return extensionApi.registerExportViewportProvider(async () => {
      return await new Promise<{ element: HTMLElement | null; exportViewKind: 'sequence' | 'deployment' | null }>(
        resolve => {
          const timeout = window.setTimeout(() => {
            if (exportResolverRef.current) {
              resolveExportViewport({ element: null, exportViewKind: null })
              setRenderExportViewportState(false)
            }
          }, 5000)

          exportResolverRef.current = (payload) => {
            window.clearTimeout(timeout)
            resolve(payload)
          }

          setExportDynamicViewVariant(prev => {
            const next = dynamicViewVariantRef.current
            return prev === next ? prev : next
          })
          setRenderExportViewportState(true)
        },
      )
    }, () => {
      setRenderExportViewportState(false)
      resolveExportViewport({ element: null, exportViewKind: null })
    })
  }, [resolveExportViewport, setRenderExportViewportState])

  const onExportDiagramReady = useCallback(() => {
    const root = exportViewportRef.current
    if (!root || !bounds) {
      console.error('exportViewportRef.current is null')
      resolveExportViewport({ element: null, exportViewKind: null })
      return
    }

    console.log('[likec4-preview] export view ready', view.id, projectId)

    const x = Math.round(-bounds.x + EXPORT_PADDING)
    const y = Math.round(-bounds.y + EXPORT_PADDING)

    const viewport = root.querySelector<HTMLElement>('.react-flow__viewport')
    if (viewport) {
      viewport.style.transform = `translate(${x}px, ${y}px)`
    }

    const el = root.querySelector<HTMLElement>('.react-flow') ?? null
    const exportViewKind = view?._type === 'deployment'
      ? 'deployment'
      : view?._type === 'dynamic' && exportDynamicViewVariant === 'sequence'
      ? 'sequence'
      : null
    resolveExportViewport({
      element: el,
      exportViewKind,
    })
  }, [bounds, exportDynamicViewVariant, projectId, resolveExportViewport, view?._type, view.id])

  if (!view) {
    return (
      <div className={likec4ParsingScreen}>
        {error && <ErrorMessage error={error} />}
        <section>
          <p>Parsing your model...</p>
          <p>
            <Button color="gray" onClick={extensionApi.closeMe}>
              Close
            </Button>
          </p>
        </section>
      </div>
    )
  }

  return (
    <>
      <div
        className={likec4Container}
        data-likec4-diagram
        data-vscode-context='{"preventDefaultContextMenuItems": true}'>
        <LikeC4Diagram
          view={view}
          fitViewPadding={MAIN_FIT_VIEW_PADDING}
          controls
          enableFocusMode
          enableDynamicViewWalkthrough
          enableElementDetails
          enableRelationshipBrowser
          enableElementTags
          enableSearch
          enableRelationshipDetails
          enableCompareWithLatest
          showNavigationButtons
          enableNotations
          onNavigateTo={(_to, event) => {
            const to = _to as scalar.ViewId
            setLastClickedNode()
            extensionApi.locate({ view: to, projectId })
            extensionApi.navigateTo(to, projectId)
            event?.stopPropagation()
          }}
          onNodeContextMenu={(element) => {
            setLastClickedNode(element)
          }}
          onCanvasContextMenu={event => {
            setLastClickedNode()
            event.stopPropagation()
            event.preventDefault()
          }}
          onEdgeClick={(edge) => {
            if (view._type === 'dynamic' && edge.astPath) {
              extensionApi.locate({
                projectId,
                view: view.id,
                astPath: edge.astPath,
              })
              return
            }
            const relationId = only(edge.relations)
            if (relationId) {
              extensionApi.locate({
                projectId,
                relation: relationId,
              })
            }
          }}
          onEdgeContextMenu={(edge, event) => {
            setLastClickedNode()
            event.stopPropagation()
            event.preventDefault()
          }}
          onOpenSource={(params) => {
            setLastClickedNode()
            extensionApi.locate({
              projectId,
              ...params,
            })
          }}
          onInitialized={() => {
            console.log('[likec4-preview] view initialized', view.id, projectId)
            extensionApi.locate({
              projectId,
              view: view.id,
            })
            extensionApi.notifyReady({
              screen: 'view',
              viewId: view.id,
              projectId,
            })
          }}
          onLogoClick={openProjectsScreen}
          onLayoutTypeChange={setLayoutType}
        >
          {view._type === 'dynamic' && <DynamicViewVariantTracker onSync={syncDynamicViewVariantRef} />}
        </LikeC4Diagram>
        {error && (
          <>
            <Overlay blur={2} backgroundOpacity={0.2} />
            <ErrorMessage error={error} />
          </>
        )}
      </div>

      {renderExportViewport && (
        <div ref={exportViewportRef} style={exportSurfaceStyle}>
          <LikeC4Diagram
            view={view}
            fitView={false}
            fitViewPadding={0}
            background="transparent"
            reduceGraphics={false}
            dynamicViewVariant={exportDynamicVariant}
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
            onInitialized={onExportDiagramReady}
          />
        </div>
      )}
    </>
  )
})
