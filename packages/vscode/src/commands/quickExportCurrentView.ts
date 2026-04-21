import { useCommand } from 'reactive-vscode'
import { commands } from '../meta'
import {
  type ExportCurrentViewDeps,
  getExportConfig,
  runExportCurrentView,
} from './exportCurrentView.shared'

export function registerQuickExportCurrentViewCommand(deps: ExportCurrentViewDeps) {
  useCommand(commands.quickExportCurrentview, async () => {
    deps.sendTelemetry(commands.quickExportCurrentview)
    const settings = getExportConfig()
    await runExportCurrentView(deps, {
      format: settings.lastFormat,
      pngPixelRatio: settings.pngPixelRatio,
      jpegPixelRatio: settings.jpegPixelRatio,
      jpegQuality: settings.jpegQuality,
    })
  })
}
