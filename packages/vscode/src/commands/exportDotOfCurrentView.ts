import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './exportViewSource'
import type { PreviewPanel, RpcClient } from './types'

export interface ExportDotOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export function registerExportDotOfCurrentViewCommand({ sendTelemetry, rpc, preview }: ExportDotOfCurrentViewDeps) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportDotOfCurrentview, async () => {
    sendTelemetry(commands.exportDotOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its DOT representation.')
      return
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting DOT',
      cancellable: false,
    }, async () => {
      const result = await rpc.layoutView({ viewId, projectId })
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
  })
}
