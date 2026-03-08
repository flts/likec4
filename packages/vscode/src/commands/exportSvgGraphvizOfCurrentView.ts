import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './saveTextToFile'
import type { PreviewPanel, RpcClient } from './types'

export interface ExportSvgGraphvizOfCurrentViewDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export function registerExportSvgGraphvizOfCurrentViewCommand(
  { sendTelemetry, rpc, preview }: ExportSvgGraphvizOfCurrentViewDeps,
) {
  const { logger } = useExtensionLogger()
  useCommand(commands.exportSvgGraphvizOfCurrentview, async () => {
    sendTelemetry(commands.exportSvgGraphvizOfCurrentview)
    const viewId = toValue(preview.viewId)
    const projectId = toValue(preview.projectId)
    if (!viewId || !projectId) {
      logger.warn('No preview panel found')
      await vscode.window.showInformationMessage('Open a preview to export its SVG (Graphviz) source.')
      return
    }
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting SVG (Graphviz)',
      cancellable: false,
    }, async () => {
      const source = await rpc.exportSvgGraphvizView({ viewId, projectId })
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
  })
}
