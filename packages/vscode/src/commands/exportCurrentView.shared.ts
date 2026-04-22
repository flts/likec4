import type { ExportColorSchemeSetting } from '@likec4/vscode-preview/protocol'
import { toValue } from 'reactive-vscode'
import * as vscode from 'vscode'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './saveTextToFile'
import type { PreviewPanel, RpcClient } from './types'

export type ExportFormat =
  | 'svg'
  | 'png'
  | 'jpeg'
  | 'mermaid'
  | 'dot'
  | 'd2'
  | 'puml'
  | 'svg-graphviz'

export interface ExportCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export interface ExportCurrentViewSelection {
  format?: ExportFormat
  pngPixelRatio?: number
  jpegQuality?: number
}

function getExplicitConfigValue<T>(key: string): T | undefined {
  const inspected = vscode.workspace.getConfiguration('likec4').inspect<T>(key)
  if (!inspected) {
    return undefined
  }
  return inspected.workspaceFolderValue
    ?? inspected.workspaceValue
    ?? inspected.globalValue
}

export function getExportConfig() {
  const config = vscode.workspace.getConfiguration('likec4')
  return {
    pngPixelRatio: config.get<number>('export.pngPixelRatio'),
    jpegQuality: config.get<number>('export.jpegQuality'),
    colorScheme: config.get<ExportColorSchemeSetting>('export.colorScheme', 'inherit'),
    imageMaxWidth: config.get<number>('export.imageMaxWidth'),
    imageMaxHeight: config.get<number>('export.imageMaxHeight'),
    lastFormat: config.get<ExportFormat>('export.lastFormat'),
  }
}

export function getQuickExportSelection(): ExportCurrentViewSelection | null {
  const format = getExplicitConfigValue<ExportFormat>('export.lastFormat')
  if (!format) {
    return null
  }

  switch (format) {
    case 'png': {
      const pngPixelRatio = getExplicitConfigValue<number>('export.pngPixelRatio')
      if (pngPixelRatio === undefined) {
        return null
      }
      return {
        format,
        pngPixelRatio,
      }
    }
    case 'jpeg': {
      const jpegQuality = getExplicitConfigValue<number>('export.jpegQuality')
      if (jpegQuality === undefined) {
        return null
      }
      return {
        format,
        jpegQuality,
      }
    }
    case 'svg':
    case 'svg-graphviz':
    case 'mermaid':
    case 'dot':
    case 'd2':
    case 'puml':
      return { format }
    default:
      return null
  }
}

export async function updateExportSetting<T extends string | number>(key: string, value: T) {
  await vscode.workspace.getConfiguration('likec4').update(key, value, vscode.ConfigurationTarget.Global)
}

function getExportFileName(viewId: string, extension: string, exportViewKind: 'sequence' | 'deployment' | null) {
  if (exportViewKind === 'sequence') {
    return `${viewId}.sequence.${extension}`
  }
  if (exportViewKind === 'deployment') {
    return `${viewId}.deployment.${extension}`
  }
  return `${viewId}.${extension}`
}

function asJpegQuality(value: number) {
  return Math.max(0, Math.min(100, value)) / 100
}

export async function runExportCurrentView(
  deps: ExportCurrentViewDeps,
  selection: ExportCurrentViewSelection,
) {
  const { logger } = useExtensionLogger()
  const viewId = toValue(deps.preview.viewId)
  const projectId = toValue(deps.preview.projectId)
  const visible = toValue(deps.preview.visible)
  if (!viewId || !projectId || !visible) {
    logger.warn('No preview panel found')
    await vscode.window.showErrorMessage('Open a preview to export the current view.')
    return
  }

  const settings = getExportConfig()

  switch (selection.format) {
    case 'dot': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting DOT',
        cancellable: false,
      }, async () => {
        const result = await deps.rpc.layoutView({ viewId, projectId })
        if (!result) {
          await vscode.window.showWarningMessage(`Failed to export DOT for view "${viewId}".`)
          return
        }
        await saveTextToFile(result.dot, {
          defaultFileName: `${viewId}.dot`,
          extension: 'dot',
          label: 'DOT',
        })
      })
      return
    }
    case 'd2': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting D2',
        cancellable: false,
      }, async () => {
        const source = await deps.rpc.exportD2View({ viewId, projectId })
        if (!source) {
          await vscode.window.showWarningMessage(`Failed to export D2 for view "${viewId}".`)
          return
        }
        await saveTextToFile(source, {
          defaultFileName: `${viewId}.d2`,
          extension: 'd2',
          label: 'D2',
        })
      })
      return
    }
    case 'mermaid': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting Mermaid',
        cancellable: false,
      }, async () => {
        const source = await deps.rpc.exportMmdView({ viewId, projectId })
        if (!source) {
          await vscode.window.showWarningMessage(`Failed to export Mermaid for view "${viewId}".`)
          return
        }
        await saveTextToFile(source, {
          defaultFileName: `${viewId}.mmd`,
          extension: 'mmd',
          label: 'Mermaid',
        })
      })
      return
    }
    case 'puml': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting PlantUML',
        cancellable: false,
      }, async () => {
        const source = await deps.rpc.exportPumlView({ viewId, projectId })
        if (!source) {
          await vscode.window.showWarningMessage(`Failed to export PlantUML for view "${viewId}".`)
          return
        }
        await saveTextToFile(source, {
          defaultFileName: `${viewId}.puml`,
          extension: 'puml',
          label: 'PlantUML',
        })
      })
      return
    }
    case 'svg-graphviz': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting SVG (Graphviz)',
        cancellable: false,
      }, async () => {
        const source = await deps.rpc.exportSvgGraphvizView({ viewId, projectId })
        if (!source) {
          await vscode.window.showWarningMessage(`Failed to export SVG (Graphviz) for view "${viewId}".`)
          return
        }
        await saveTextToFile(source, {
          defaultFileName: `${viewId}.svg`,
          extension: 'svg',
          label: 'SVG (Graphviz)',
        })
      })
      return
    }
    case 'svg': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting SVG (manual layout)',
        cancellable: true,
      }, async (_progress, token) => {
        const ensureNotCancelled = () => {
          if (token.isCancellationRequested) {
            throw new vscode.CancellationError()
          }
        }
        const cancelled = new Promise<never>((_, reject) => {
          token.onCancellationRequested(() => reject(new vscode.CancellationError()))
        })

        const result = await Promise.race([
          deps.preview.exportSvg({
            colorScheme: settings.colorScheme,
            maxWidth: settings.imageMaxWidth!,
            maxHeight: settings.imageMaxHeight!,
          }),
          cancelled,
        ])
        if (!result.svg) {
          await vscode.window.showWarningMessage(result.error ?? 'Failed to export SVG.')
          return
        }
        ensureNotCancelled()

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
        const filename = getExportFileName(viewId, 'svg', result.exportViewKind)
        const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, filename) : undefined
        const uri = await vscode.window.showSaveDialog({
          ...(defaultUri ? { defaultUri } : {}),
          filters: {
            SVG: ['svg'],
          },
          saveLabel: 'Save SVG (manual layout)',
        })
        if (!uri) {
          return
        }
        const data = new TextEncoder().encode(result.svg)
        await vscode.workspace.fs.writeFile(uri, data)
      })
      return
    }
    case 'png': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting PNG',
        cancellable: true,
      }, async (_progress, token) => {
        const ensureNotCancelled = () => {
          if (token.isCancellationRequested) {
            throw new vscode.CancellationError()
          }
        }
        const cancelled = new Promise<never>((_, reject) => {
          token.onCancellationRequested(() => reject(new vscode.CancellationError()))
        })

        const result = await Promise.race([
          deps.preview.exportPng({
            colorScheme: settings.colorScheme,
            pixelRatio: selection.pngPixelRatio ?? settings.pngPixelRatio!,
            maxWidth: settings.imageMaxWidth!,
            maxHeight: settings.imageMaxHeight!,
          }),
          cancelled,
        ])
        if (!result.pngBytes || result.pngBytes.length <= 0) {
          await vscode.window.showWarningMessage(result.error ?? 'Failed to export PNG.')
          return
        }
        ensureNotCancelled()

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
        const filename = getExportFileName(viewId, 'png', result.exportViewKind)
        const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, filename) : undefined
        const uri = await vscode.window.showSaveDialog({
          ...(defaultUri ? { defaultUri } : {}),
          filters: {
            PNG: ['png'],
          },
          saveLabel: 'Save PNG',
        })
        if (!uri) {
          return
        }
        await vscode.workspace.fs.writeFile(uri, result.pngBytes)
      })
      return
    }
    case 'jpeg': {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting JPEG',
        cancellable: true,
      }, async (_progress, token) => {
        const ensureNotCancelled = () => {
          if (token.isCancellationRequested) {
            throw new vscode.CancellationError()
          }
        }
        const cancelled = new Promise<never>((_, reject) => {
          token.onCancellationRequested(() => reject(new vscode.CancellationError()))
        })

        const result = await Promise.race([
          deps.preview.exportJpeg({
            colorScheme: settings.colorScheme,
            maxWidth: settings.imageMaxWidth!,
            maxHeight: settings.imageMaxHeight!,
            quality: asJpegQuality(selection.jpegQuality ?? settings.jpegQuality!),
          }),
          cancelled,
        ])
        if (!result.jpegBytes || result.jpegBytes.length <= 0) {
          await vscode.window.showWarningMessage(result.error ?? 'Failed to export JPEG.')
          return
        }
        ensureNotCancelled()

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
        const filename = getExportFileName(viewId, 'jpg', result.exportViewKind)
        const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, filename) : undefined
        const uri = await vscode.window.showSaveDialog({
          ...(defaultUri ? { defaultUri } : {}),
          filters: {
            JPEG: ['jpg', 'jpeg'],
          },
          saveLabel: 'Save JPEG',
        })
        if (!uri) {
          return
        }
        await vscode.workspace.fs.writeFile(uri, result.jpegBytes)
      })
      return
    }
  }
}
