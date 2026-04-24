import { useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import {
  type ExportCurrentViewDeps,
  getQuickExportSelection,
  runExportCurrentView,
} from './exportCurrentView.shared'

export function registerExportCurrentViewQuickCommand(deps: ExportCurrentViewDeps) {
  useCommand(commands.quickExportCurrentview, async () => {
    deps.sendTelemetry(commands.quickExportCurrentview)
    const selection = getQuickExportSelection()
    if (!selection) {
      await vscode.commands.executeCommand(commands.exportCurrentview)
      return
    }
    await runExportCurrentView(deps, selection)
  })
}
