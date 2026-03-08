import * as vscode from 'vscode'

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
    ...(defaultUri ? { defaultUri } : {}),
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
