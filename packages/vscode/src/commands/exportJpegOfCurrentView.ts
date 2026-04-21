import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import type { PreviewPanel } from './types'

export interface ExportJpegOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  preview: PreviewPanel
}

export function registerExportJpegOfCurrentViewCommand(
  { sendTelemetry, preview }: ExportJpegOfCurrentViewDeps,
) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportJpegOfCurrentview, async () => {
    sendTelemetry(commands.exportJpegOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its JPEG.')
      return
    }
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

      const maxWidth = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxWidth', 8192)
      const maxHeight = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxHeight', 8192)
      // JPEG at 2x pixel ratio is typically sufficient given compression.
      const pixelRatio = 2

      const result = await Promise.race([
        preview.exportJpeg({
          maxWidth,
          maxHeight,
          pixelRatio,
        }),
        cancelled,
      ])
      if (!result.jpegBytes || result.jpegBytes.length <= 0) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export JPEG.')
        return
      }
      ensureNotCancelled()

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
      // Use `.jpg` for saved files while keeping the MIME type as `image/jpeg`.
      const filename = result.exportViewKind === 'sequence'
        ? `${viewId}.sequence.jpg`
        : result.exportViewKind === 'deployment'
        ? `${viewId}.deployment.jpg`
        : `${viewId}.jpg`
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
    }).then(undefined, async (error) => {
      if (error instanceof vscode.CancellationError) {
        return
      }
      throw error
    })
  })
}
