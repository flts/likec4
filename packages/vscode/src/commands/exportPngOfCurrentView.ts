import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import type { PreviewPanel } from './types'

export interface ExportPngOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  preview: PreviewPanel
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
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
      cancellable: false,
    }, async () => {
      preview.open({ viewId, projectId })
      const isReady = await preview.waitForReady({ viewId, projectId, timeoutMs: 10_000 })
      if (!isReady) {
        await vscode.window.showWarningMessage(
          'Preview is not ready for export. Try again after it finishes rendering.',
        )
        return
      }
      const result = await preview.exportPng()
      if (!result.base64Png) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export PNG.')
        return
      }
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
      const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, `${viewId}.png`) : undefined
      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          PNG: ['png'],
        },
        saveLabel: 'Save PNG',
      })
      if (!uri) {
        return
      }
      const bytes = decodeBase64ToBytes(result.base64Png)
      await vscode.workspace.fs.writeFile(uri, bytes)
    })
  })
}
