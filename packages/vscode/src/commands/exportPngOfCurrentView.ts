import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import type { PreviewPanel } from './types'

export interface ExportPngOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  preview: PreviewPanel
}

export function registerExportPngOfCurrentViewCommand({
  sendTelemetry,
  preview,
}: ExportPngOfCurrentViewDeps) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportPngOfCurrentview, async () => {
    sendTelemetry(commands.exportPngOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its PNG.')
      return
    }
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

      const isPreviewWarm = toValue(preview.visible) &&
        toValue(preview.viewId) === viewId &&
        toValue(preview.projectId) === projectId

      ensureNotCancelled()
      if (!isPreviewWarm) {
        preview.open({ viewId, projectId })
      }

      const isReady = await Promise.race([
        preview.waitForReady({
          viewId,
          projectId,
          timeoutMs: isPreviewWarm ? 1_500 : 10_000,
        }),
        cancelled,
      ])
      if (!isReady) {
        await vscode.window.showWarningMessage(
          'Preview is not ready for export. Try again after it finishes rendering.',
        )
        return
      }
      ensureNotCancelled()

      const pixelRatio = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.pngPixelRatio', 3)
      const maxWidth = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxWidth', 8192)
      const maxHeight = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxHeight', 8192)

      const result = await Promise.race([
        preview.exportPng({
          pixelRatio,
          maxWidth,
          maxHeight,
        }),
        cancelled,
      ])
      if (!result.pngBytes || result.pngBytes.length <= 0) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export PNG.')
        return
      }
      ensureNotCancelled()

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
      const filename = result.exportViewKind === 'sequence'
        ? `${viewId}.sequence.png`
        : result.exportViewKind === 'deployment'
        ? `${viewId}.deployment.png`
        : `${viewId}.png`
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
      ensureNotCancelled()
      await vscode.workspace.fs.writeFile(uri, result.pngBytes)
    }).then(undefined, async (error) => {
      if (error instanceof vscode.CancellationError) {
        return
      }
      throw error
    })
  })
}
