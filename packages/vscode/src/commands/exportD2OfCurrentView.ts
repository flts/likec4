import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './saveTextToFile'
import type { PreviewPanel, RpcClient } from './types'

export interface ExportD2OfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export function registerExportD2OfCurrentViewCommand({ sendTelemetry, rpc, preview }: ExportD2OfCurrentViewDeps) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportD2OfCurrentview, async () => {
    sendTelemetry(commands.exportD2OfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its D2 source.')
      return
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting D2',
      cancellable: false,
    }, async () => {
      const source = await rpc.exportD2View({ viewId, projectId })
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
  })
}
