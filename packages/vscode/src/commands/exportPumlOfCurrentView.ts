import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './saveTextToFile'
import type { PreviewPanel, RpcClient } from './types'

export interface ExportPumlOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export function registerExportPumlOfCurrentViewCommand({ sendTelemetry, rpc, preview }: ExportPumlOfCurrentViewDeps) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportPumlOfCurrentview, async () => {
    sendTelemetry(commands.exportPumlOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its PlantUML source.')
      return
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting PlantUML',
      cancellable: false,
    }, async () => {
      const source = await rpc.exportPumlView({ viewId, projectId })
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
  })
}
