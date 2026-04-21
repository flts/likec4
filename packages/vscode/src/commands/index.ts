import useTelemetry from '#useTelemetry'
import { useDiagramPanel } from '../panel'
import { useLanguageClient } from '../useLanguageClient'
import { useRpc } from '../useRpc'
import { registerExportCurrentViewCommand } from './exportCurrentView'
import { registerExportCurrentViewQuickCommand } from './exportCurrentViewQuick'
import { registerExportD2OfCurrentViewCommand } from './exportD2OfCurrentView'
import { registerExportDotOfCurrentViewCommand } from './exportDotOfCurrentView'
import { registerExportJpegOfCurrentViewCommand } from './exportJpegOfCurrentView'
import { registerExportMermaidOfCurrentViewCommand } from './exportMermaidOfCurrentView'
import { registerExportPngOfCurrentViewCommand } from './exportPngOfCurrentView'
import { registerExportPumlOfCurrentViewCommand } from './exportPumlOfCurrentView'
import { registerExportSvgGraphvizOfCurrentViewCommand } from './exportSvgGraphvizOfCurrentView'
import { registerExportSvgOfCurrentViewCommand } from './exportSvgOfCurrentView'
import { registerLocateCommand } from './locate'
import { registerOpenPreviewCommand } from './openPreview'
import { registerOpenProjectsOverviewCommand } from './openProjectsOverview'
import { registerPreviewContextOpenSourceCommand } from './previewContextOpenSource'
import { registerPrintDotOfCurrentViewCommand } from './printDotOfCurrentView'
import { registerReloadProjectsCommand } from './reloadProjects'
import { registerRestartCommand } from './restart'
import { registerValidateLayoutCommand } from './validateLayout'

export function registerCommands() {
  const {
    restartLanguageServer: restartServer,
  } = useLanguageClient()
  const rpc = useRpc()
  const preview = useDiagramPanel()
  const telemetry = useTelemetry()

  function sendTelemetry(command: string) {
    telemetry.sendTelemetry('command', { command })
  }

  const deps = { sendTelemetry, rpc, preview }

  registerRestartCommand({
    sendTelemetry,
    restartServer,
  })

  registerOpenPreviewCommand(deps)
  registerOpenProjectsOverviewCommand(deps)
  registerLocateCommand(deps)
  registerPreviewContextOpenSourceCommand(deps)
  registerExportCurrentViewCommand(deps)
  registerExportCurrentViewQuickCommand(deps)
  registerPrintDotOfCurrentViewCommand(deps)
  registerValidateLayoutCommand(deps)
  registerReloadProjectsCommand(deps)
}
