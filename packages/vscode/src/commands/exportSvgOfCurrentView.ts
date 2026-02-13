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
      cancellable: false,
    }, async () => {
      const isPreviewWarm = toValue(preview.visible) &&
        toValue(preview.viewId) === viewId &&
        toValue(preview.projectId) === projectId

      if (!isPreviewWarm) {
        preview.open({ viewId, projectId })
      }

      const isReady = await preview.waitForReady({
        viewId,
        projectId,
        timeoutMs: isPreviewWarm ? 1_500 : 10_000,
      })
      if (!isReady) {
        await vscode.window.showWarningMessage(
          'Preview is not ready for export. Try again after it finishes rendering.',
        )
        return
      }
      const maxWidth = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxWidth', 8192)
      const maxHeight = vscode.workspace
        .getConfiguration('likec4')
        .get<number>('export.imageMaxHeight', 8192)

      const result = await preview.exportSvg({
        maxWidth,
        maxHeight,
      })
      if (!result.svg) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export SVG.')
        return
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
      const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, `${viewId}.svg`) : undefined
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
  })
}
