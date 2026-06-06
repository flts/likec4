import type { LayoutedProjectsView } from '@likec4/core'
import type {
  ComputedLikeC4ModelData,
  DiagramView,
  LayoutType,
  ProjectId,
  ViewChange,
  ViewId,
} from '@likec4/core/types'
import { CancellationTokenImpl, HOST_EXTENSION } from 'vscode-messenger-common'
import { Messenger } from 'vscode-messenger-webview'
import {
  type ExportColorSchemeSetting,
  type GetLastClickedNodeHandler,
  type Handler,
  type WebviewLocateReq,
  BroadcastAILayoutStateUpdate,
  BroadcastModelUpdate,
  BroadcastProjectsUpdate,
  ExportJpeg,
  ExportPng,
  ExportSvg,
  FetchComputedModel,
  FetchLayoutedView,
  FetchProjectsOverview,
  GetLastClickedNode,
  OnOpenView,
  ReadLocalIcon,
  ViewChangeReq,
  WebviewMsgs,
} from '../protocol'
import { rasterizeSvg } from './export/rasterizeSvg'
import { applySvgMaxDimensions, serializeWithForeignObject } from './export/serializeWithForeignObject'
import type { ExportViewportProviderPayload } from './screens/ExportViewportSurface'

export type VscodeState = {
  viewId: ViewId
  projectId: ProjectId
  view: DiagramView | null
  model: ComputedLikeC4ModelData | null
  nodesDraggable: boolean
  edgesEditable: boolean
  updatedAt: number
  screen: 'view' | 'projects'
  projectsOverview: LayoutedProjectsView | null
}
const vscode = acquireVsCodeApi<VscodeState>()

const messenger = new Messenger(vscode)
messenger.start()

export const ExtensionApi = {
  navigateTo: (viewId: ViewId, projectId?: ProjectId) => {
    messenger.sendNotification(WebviewMsgs.NavigateTo, HOST_EXTENSION, { screen: 'view', viewId, projectId })
  },
  navigateToProjectsOverview: () => {
    messenger.sendNotification(WebviewMsgs.NavigateTo, HOST_EXTENSION, { screen: 'projects' })
  },
  closeMe: () => {
    messenger.sendNotification(WebviewMsgs.CloseMe, HOST_EXTENSION)
  },
  locate: (params: WebviewLocateReq) => {
    messenger.sendNotification(WebviewMsgs.Locate, HOST_EXTENSION, params)
  },
  openExternalUrl: (url: string) => {
    messenger.sendNotification(WebviewMsgs.OpenExternalUrl, HOST_EXTENSION, { url })
  },
  updateTitle: (title: string) => {
    messenger.sendNotification(WebviewMsgs.UpdateMyTitle, HOST_EXTENSION, { title })
  },

  applySemanticLayout: (viewId: ViewId) => {
    if (__HAS_AI) {
      messenger.sendNotification(WebviewMsgs.SemanticLayout, HOST_EXTENSION, { viewId })
    }
  },

  change: async (params: {
    projectId: ProjectId
    viewId: ViewId
    change: ViewChange
  }): Promise<
    | { success: true }
    | { success: false; error: string }
  > => {
    return await messenger.sendRequest(ViewChangeReq, HOST_EXTENSION, params)
  },

  fetchComputedModel: async (
    projectId: ProjectId,
    signal: AbortSignal,
  ): Promise<{
    model: ComputedLikeC4ModelData | null
    error: string | null
  }> => {
    const cancellationToken = new CancellationTokenImpl()
    signal.addEventListener('abort', () => cancellationToken.cancel())
    return await messenger.sendRequest(FetchComputedModel, HOST_EXTENSION, { projectId }, cancellationToken)
  },

  // Layoted vuew
  fetchDiagramView: async (
    params: {
      projectId: ProjectId
      viewId: ViewId
      layoutType: LayoutType
    },
    signal: AbortSignal,
  ): Promise<{
    view: DiagramView | null
    error: string | null
  }> => {
    const cancellationToken = new CancellationTokenImpl()
    signal.addEventListener('abort', () => cancellationToken.cancel())
    return await messenger.sendRequest(FetchLayoutedView, HOST_EXTENSION, params, cancellationToken)
  },

  fetchProjectsOverview: async (signal: AbortSignal): Promise<{
    projectsView: LayoutedProjectsView | null
  }> => {
    const cancellationToken = new CancellationTokenImpl()
    signal.addEventListener('abort', () => cancellationToken.cancel())
    return await messenger.sendRequest(
      FetchProjectsOverview,
      HOST_EXTENSION,
      undefined,
      cancellationToken,
    )
  },

  // Read local icon file and convert to base64 data URI
  readLocalIcon: async (uri: string) => {
    return await messenger.sendRequest(ReadLocalIcon, HOST_EXTENSION, uri)
  },

  onOpenViewNotification: (handler: Handler<typeof OnOpenView>) => {
    messenger.onNotification(OnOpenView, handler)
  },

  onAiLayoutUpdateNotification: (handler: Handler<typeof BroadcastAILayoutStateUpdate>) => {
    messenger.onNotification(BroadcastAILayoutStateUpdate, handler)
  },

  onGetLastClickedNodeRequest: (handler: GetLastClickedNodeHandler) => {
    messenger.onRequest(GetLastClickedNode, handler)
  },

  onExportSvgRequest: (handler: Handler<typeof ExportSvg>) => {
    messenger.onRequest(ExportSvg, handler)
  },

  onExportPngRequest: (handler: Handler<typeof ExportPng>) => {
    messenger.onRequest(ExportPng, handler)
  },

  onExportJpegRequest: (handler: Handler<typeof ExportJpeg>) => {
    messenger.onRequest(ExportJpeg, handler)
  },

  onModelUpdateNotification: (handler: () => void) => {
    messenger.onNotification(BroadcastModelUpdate, handler)
  },

  onProjectsUpdateNotification: (handler: () => void) => {
    messenger.onNotification(BroadcastProjectsUpdate, handler)
  },

  registerExportViewportProvider: (
    provider: (params: { colorScheme?: ExportColorSchemeSetting }) => Promise<ExportViewportProviderPayload>,
    onClear?: (() => void) | undefined,
  ) => {
    exportViewportProvider = provider
    clearExportViewport = onClear ?? null
    return () => {
      if (exportViewportProvider === provider) {
        exportViewportProvider = null
      }
      if (clearExportViewport === onClear) {
        clearExportViewport = null
      }
    }
  },
}

let exportViewportProvider:
  | null
  | ((params: { colorScheme?: ExportColorSchemeSetting }) => Promise<ExportViewportProviderPayload>) = null
let clearExportViewport: null | (() => void) = null

ExtensionApi.onExportSvgRequest(async (params) => {
  console.log('[likec4-preview] export-svg request')
  const maxWidth = Number.isFinite(params?.maxWidth)
    ? Math.max(512, Math.floor(Number(params?.maxWidth)))
    : Number.POSITIVE_INFINITY
  const maxHeight = Number.isFinite(params?.maxHeight)
    ? Math.max(512, Math.floor(Number(params?.maxHeight)))
    : Number.POSITIVE_INFINITY

  const exportViewport = exportViewportProvider
    ? await exportViewportProvider({ colorScheme: params?.colorScheme ?? 'inherit' })
    : { element: null, metadata: null, exportViewKind: null }
  const element = exportViewport.element
  const metadata = exportViewport.metadata

  if (!element || !metadata) {
    console.warn('[likec4-preview] export-svg: export scene not ready')
    clearExportViewport?.()
    return {
      svg: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Diagram viewport not found',
    }
  }

  try {
    // Serialize to SVG using the SVG ForeignObject backend
    console.time('serializeWithForeignObject (SVG)')
    const svgText = serializeWithForeignObject(element, {
      ...metadata,
      background: 'transparent',
    })
    console.timeEnd('serializeWithForeignObject (SVG)')

    // Apply max-dimension constraints
    const svg = applySvgMaxDimensions(
      svgText,
      metadata.logicalWidth,
      metadata.logicalHeight,
      maxWidth,
      maxHeight,
    )
    clearExportViewport?.()
    return {
      svg,
      exportViewKind: exportViewport.exportViewKind,
      error: null,
    }
  } catch (err) {
    console.error(err)
    clearExportViewport?.()
    return {
      svg: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Failed to export SVG',
    }
  }
})

ExtensionApi.onExportPngRequest(async (params) => {
  console.log('[likec4-preview] export-png request')
  const pixelRatio = Number.isFinite(params?.pixelRatio)
    ? Math.min(4, Math.max(1, Number(params?.pixelRatio)))
    : 3
  const maxWidth = Number.isFinite(params?.maxWidth)
    ? Math.max(512, Math.floor(Number(params?.maxWidth)))
    : Number.POSITIVE_INFINITY
  const maxHeight = Number.isFinite(params?.maxHeight)
    ? Math.max(512, Math.floor(Number(params?.maxHeight)))
    : Number.POSITIVE_INFINITY

  const exportViewport = exportViewportProvider
    ? await exportViewportProvider({ colorScheme: params?.colorScheme ?? 'inherit' })
    : { element: null, metadata: null, exportViewKind: null }
  const element = exportViewport.element
  const metadata = exportViewport.metadata

  if (!element || !metadata) {
    console.warn('[likec4-preview] export-png: export scene not ready')
    clearExportViewport?.()
    return {
      pngBytes: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Diagram viewport not found',
    }
  }

  try {
    // Serialize to SVG using the SVG ForeignObject backend
    console.time('serializeWithForeignObject (PNG)')
    const svgText = serializeWithForeignObject(element, {
      ...metadata,
      background: 'transparent',
    })
    console.timeEnd('serializeWithForeignObject (PNG)')

    // Rasterize SVG to PNG
    console.time('rasterizeSvg (PNG)')
    const blob = await rasterizeSvg(svgText, metadata.logicalWidth, metadata.logicalHeight, {
      format: 'png',
      pixelRatio,
      maxWidth,
      maxHeight,
    })
    console.timeEnd('rasterizeSvg (PNG)')

    if (!blob || blob.size === 0) {
      clearExportViewport?.()
      return {
        pngBytes: null,
        exportViewKind: exportViewport.exportViewKind,
        error: 'Failed to export PNG',
      }
    }

    const pngBytes = new Uint8Array(await blob.arrayBuffer())
    clearExportViewport?.()
    return {
      pngBytes,
      exportViewKind: exportViewport.exportViewKind,
      error: null,
    }
  } catch (err) {
    console.error(err)
    clearExportViewport?.()
    return {
      pngBytes: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Failed to export PNG',
    }
  }
})

ExtensionApi.onExportJpegRequest(async (params) => {
  console.log('[likec4-preview] export-jpeg request')
  const maxWidth = Number.isFinite(params?.maxWidth)
    ? Math.max(512, Math.floor(Number(params?.maxWidth)))
    : Number.POSITIVE_INFINITY
  const maxHeight = Number.isFinite(params?.maxHeight)
    ? Math.max(512, Math.floor(Number(params?.maxHeight)))
    : Number.POSITIVE_INFINITY
  // quality in 0..1, default 0.92
  const quality = Number.isFinite(params?.quality)
    ? Math.max(0.1, Math.min(1, Number(params?.quality)))
    : 0.92
  const pixelRatio = 2

  const exportViewport = exportViewportProvider
    ? await exportViewportProvider({ colorScheme: params?.colorScheme ?? 'inherit' })
    : { element: null, metadata: null, exportViewKind: null }
  const element = exportViewport.element
  const metadata = exportViewport.metadata

  if (!element || !metadata) {
    console.warn('[likec4-preview] export-jpeg: export scene not ready')
    clearExportViewport?.()
    return {
      jpegBytes: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Diagram viewport not found',
    }
  }

  try {
    // Serialize with solid-theme background (JPEG has no transparency)
    console.time('serializeWithForeignObject (JPEG)')
    const svgText = serializeWithForeignObject(element, {
      ...metadata,
      background: 'solid-theme',
    })
    console.timeEnd('serializeWithForeignObject (JPEG)')

    // Rasterize SVG to JPEG
    console.time('rasterizeSvg (JPEG)')
    const blob = await rasterizeSvg(svgText, metadata.logicalWidth, metadata.logicalHeight, {
      format: 'jpeg',
      pixelRatio,
      maxWidth,
      maxHeight,
      quality,
      backgroundColor: metadata.backgroundColor,
    })
    console.timeEnd('rasterizeSvg (JPEG)')

    if (!blob || blob.size === 0) {
      clearExportViewport?.()
      return {
        jpegBytes: null,
        exportViewKind: exportViewport.exportViewKind,
        error: 'Failed to export JPEG',
      }
    }

    const jpegBytes = new Uint8Array(await blob.arrayBuffer())
    clearExportViewport?.()
    return {
      jpegBytes,
      exportViewKind: exportViewport.exportViewKind,
      error: null,
    }
  } catch (err) {
    console.error(err)
    clearExportViewport?.()
    return {
      jpegBytes: null,
      exportViewKind: exportViewport.exportViewKind,
      error: 'Failed to export JPEG',
    }
  }
})

export function getVscodeState(): VscodeState {
  const state = vscode.getState()
  return {
    viewId: state?.viewId ?? __VIEW_ID as ViewId,
    projectId: state?.projectId ?? __PROJECT_ID as ProjectId,
    view: state?.view ?? null,
    model: state?.model ?? null,
    nodesDraggable: state?.nodesDraggable ?? __INTERNAL_STATE?.nodesDraggable ?? true,
    edgesEditable: state?.edgesEditable ?? __INTERNAL_STATE?.edgesEditable ?? true,
    updatedAt: state?.updatedAt ?? 0,
    screen: state?.screen ?? __SCREEN,
    projectsOverview: state?.projectsOverview ?? null,
  }
}

export const saveVscodeState = (state: Partial<VscodeState>) => {
  vscode.setState({
    ...getVscodeState(),
    ...state,
    updatedAt: Date.now(),
  })
}
