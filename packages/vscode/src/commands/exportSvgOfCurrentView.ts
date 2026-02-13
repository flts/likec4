import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import type { PreviewPanel } from './types'

export interface ExportSvgOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  preview: PreviewPanel
}

export function registerExportSvgOfCurrentViewCommand({
  sendTelemetry,
  preview,
}: ExportSvgOfCurrentViewDeps) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportSvgOfCurrentview, async () => {
    sendTelemetry(commands.exportSvgOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its SVG.')
      return
    }
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

      const maxWidth = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxWidth', 8192)
      const maxHeight = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxHeight', 8192)

      const result = await Promise.race([
        preview.exportSvg({
          maxWidth,
          maxHeight,
        }),
        cancelled,
      ])
      if (!result.svg) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export SVG.')
        return
      }
      ensureNotCancelled()

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
      const filename = result.exportViewKind === 'sequence'
        ? `${viewId}.sequence.svg`
        : result.exportViewKind === 'deployment'
        ? `${viewId}.deployment.svg`
        : `${viewId}.svg`
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
      ensureNotCancelled()
      const data = new TextEncoder().encode(result.svg)
      await vscode.workspace.fs.writeFile(uri, data)
    }).then(undefined, async (error) => {
      if (error instanceof vscode.CancellationError) {
        return
      }
      throw error
    })
  })
}
