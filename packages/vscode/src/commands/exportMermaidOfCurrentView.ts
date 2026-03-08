import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './saveTextToFile'
import type { PreviewPanel, RpcClient } from './types'

export interface ExportMermaidOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export function registerExportMermaidOfCurrentViewCommand(
  { sendTelemetry, rpc, preview }: ExportMermaidOfCurrentViewDeps,
) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportMmdOfCurrentview, async () => {
    sendTelemetry(commands.exportMmdOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its Mermaid source.')
      return
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting Mermaid',
      cancellable: false,
    }, async () => {
      const source = await rpc.exportMmdView({ viewId, projectId })
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
  })
}
