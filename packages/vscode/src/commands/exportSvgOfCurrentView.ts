import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import { saveTextToFile } from './exportViewSource'
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
      preview.open({ viewId, projectId })
      const isReady = await preview.waitForReady({ viewId, projectId, timeoutMs: 10_000 })
      if (!isReady) {
        await vscode.window.showWarningMessage(
          'Preview is not ready for export. Try again after it finishes rendering.',
        )
        return
      }
      const result = await preview.exportSvg()
      if (!result.svg) {
        await vscode.window.showWarningMessage(result.error ?? 'Failed to export SVG.')
        return
      }
      await saveTextToFile(result.svg, {
        defaultFileName: `${viewId}.svg`,
        extension: 'svg',
        label: 'SVG (manual layout)',
      })
    })
  })
}
