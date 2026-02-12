import { toValue, useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import { useExtensionLogger } from '../useExtensionLogger'
import type { PreviewPanel, RpcClient } from './types'

type ExportSourceCommand = {
  commandId: string
  label: string
  extension: string
  getSource: (params: { viewId: string; projectId: string }) => Promise<string | null>
}

export interface ExportViewSourceDeps {
  sendTelemetry(commandId: string): void
  rpc: RpcClient
  preview: PreviewPanel
}

export async function saveTextToFile(
  source: string,
  {
    defaultFileName,
    extension,
    label,
  }: { defaultFileName: string; extension: string; label: string },
) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
  const defaultUri = workspaceFolder ? vscode.Uri.joinPath(workspaceFolder, defaultFileName) : undefined
  const uri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      [label]: [extension],
    },
    saveLabel: `Save ${label}`,
  })
  if (!uri) {
    return
  }
  const data = new TextEncoder().encode(source)
  await vscode.workspace.fs.writeFile(uri, data)
}

export function registerExportViewSourceCommands({ sendTelemetry, rpc, preview }: ExportViewSourceDeps) {
  const { logger } = useExtensionLogger()
  const commandsToRegister: ExportSourceCommand[] = [
    {
      commandId: commands.exportD2OfCurrentview,
      label: 'D2',
      extension: 'd2',
      getSource: ({ viewId, projectId }) => rpc.exportD2View({ viewId, projectId }),
    },
    {
      commandId: commands.exportMmdOfCurrentview,
      label: 'Mermaid',
      extension: 'mmd',
      getSource: ({ viewId, projectId }) => rpc.exportMmdView({ viewId, projectId }),
    },
    {
      commandId: commands.exportPumlOfCurrentview,
      label: 'PlantUML',
      extension: 'puml',
      getSource: ({ viewId, projectId }) => rpc.exportPumlView({ viewId, projectId }),
    },
    {
      commandId: commands.exportSvgGraphvizOfCurrentview,
      label: 'SVG (Graphviz)',
      extension: 'svg',
      getSource: ({ viewId, projectId }) => rpc.exportSvgGraphvizView({ viewId, projectId }),
    },
  ]

  for (const command of commandsToRegister) {
    useCommand(command.commandId, async () => {
      sendTelemetry(command.commandId)
      const viewId = toValue(preview.viewId)
      const projectId = toValue(preview.projectId)
      if (!viewId || !projectId) {
        logger.warn('No preview panel found')
        await vscode.window.showInformationMessage(`Open a preview to export its ${command.label} source.`)
        return
      }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Exporting ${command.label}`,
        cancellable: false,
      }, async () => {
        const source = await command.getSource({ viewId, projectId })
        if (!source) {
          await vscode.window.showWarningMessage(`Failed to export ${command.label} for view "${viewId}".`)
          return
        }
        await saveTextToFile(source, {
          defaultFileName: `${viewId}.${command.extension}`,
          extension: command.extension,
          label: command.label,
        })
      })
    })
  }
}
