import type { LayoutedProjectsView } from '@likec4/core'
import type {
  ComputedLikeC4ModelData,
  DiagramView,
  LayoutType,
  ProjectId,
  ViewChange,
  ViewId,
} from '@likec4/core/types'
import { toBlob, toSvg } from 'html-to-image'
import { CancellationTokenImpl, HOST_EXTENSION } from 'vscode-messenger-common'
import { Messenger } from 'vscode-messenger-webview'
import {
  type GetLastClickedNodeHandler,
  type Handler,
  type WebviewLocateReq,
  BroadcastModelUpdate,
  BroadcastProjectsUpdate,
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
  WebviewReady,
} from '../protocol'

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
  notifyReady: (payload: { screen: 'view'; viewId: ViewId; projectId: ProjectId }) => {
    messenger.sendNotification(WebviewReady, HOST_EXTENSION, payload)
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

  onGetLastClickedNodeRequest: (handler: GetLastClickedNodeHandler) => {
    messenger.onRequest(GetLastClickedNode, handler)
  },

  onExportPngRequest: (handler: Handler<typeof ExportPng>) => {
    messenger.onRequest(ExportPng, handler)
  },

  onExportSvgRequest: (handler: Handler<typeof ExportSvg>) => {
    messenger.onRequest(ExportSvg, handler)
  },

  onModelUpdateNotification: (handler: () => void) => {
    messenger.onNotification(BroadcastModelUpdate, handler)
  },

  onProjectsUpdateNotification: (handler: () => void) => {
    messenger.onNotification(BroadcastProjectsUpdate, handler)
  },

  registerExportViewportProvider: (
    provider: () => Promise<HTMLElement | null>,
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

const emptyGif = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
let exportViewportProvider: null | (() => Promise<HTMLElement | null>) = null
let clearExportViewport: null | (() => void) = null

ExtensionApi.onExportPngRequest(async (params) => {
  console.log('[likec4-preview] export-png request')
  const requestedPixelRatio = params?.pixelRatio
  const pixelRatio = Number.isFinite(requestedPixelRatio)
    ? Math.min(4, Math.max(1, Number(requestedPixelRatio)))
    : 3

  const diagramViewport = exportViewportProvider
    ? await exportViewportProvider()
    : null
  if (!diagramViewport) {
    console.warn('[likec4-preview] export-png: react-flow viewport not found')
    clearExportViewport?.()
    return {
      pngBytes: null,
      error: 'Diagram viewport not found',
    }
  }
  const rect = diagramViewport.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    console.warn('[likec4-preview] export-png: diagram has zero size', rect)
    clearExportViewport?.()
    return {
      pngBytes: null,
      error: 'Diagram is not ready to export',
    }
  }
  try {
    const options = {
      backgroundColor: 'transparent',
      cacheBust: false,
      imagePlaceholder: emptyGif,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      pixelRatio,
    }
    // use toBlob directly to avoid expensive data URL roundtrip
    console.time('toBlob (PNG)')
    const blob = await toBlob(diagramViewport, options)
    console.timeEnd('toBlob (PNG)')
    if (!blob || blob.size === 0) {
      clearExportViewport?.()
      return {
        pngBytes: null,
        error: 'Failed to export PNG',
      }
    }

    const pngBytes = new Uint8Array(await blob.arrayBuffer())
    clearExportViewport?.()
    return {
      pngBytes,
      error: null,
    }
  } catch (err) {
    console.error(err)
    clearExportViewport?.()
    return {
      pngBytes: null,
      error: 'Failed to export PNG',
    }
  }
})

ExtensionApi.onExportSvgRequest(async () => {
  console.log('[likec4-preview] export-svg request')
  const diagramViewport = exportViewportProvider
    ? await exportViewportProvider()
    : null
  if (!diagramViewport) {
    console.warn('[likec4-preview] export-svg: react-flow viewport not found')
    clearExportViewport?.()
    return {
      svg: null,
      error: 'Diagram viewport not found',
    }
  }
  const rect = diagramViewport.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    console.warn('[likec4-preview] export-svg: diagram has zero size', rect)
    clearExportViewport?.()
    return {
      svg: null,
      error: 'Diagram is not ready to export',
    }
  }
  try {
    const options = {
      backgroundColor: 'transparent',
      cacheBust: false,
      imagePlaceholder: emptyGif,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      pixelRatio: 1,
    }
    console.time('toSvg')
    const dataUrl = await toSvg(diagramViewport, options)
    console.timeEnd('toSvg')
    if (!dataUrl || !dataUrl.startsWith('data:image/svg+xml')) {
      clearExportViewport?.()
      return {
        svg: null,
        error: 'Failed to export SVG',
      }
    }

    const encoded = dataUrl.split(',')[1] ?? ''
    const svg = decodeURIComponent(encoded)
    clearExportViewport?.()
    return {
      svg,
      error: null,
    }
  } catch (err) {
    console.error(err)
    clearExportViewport?.()
    return {
      svg: null,
      error: 'Failed to export SVG',
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
