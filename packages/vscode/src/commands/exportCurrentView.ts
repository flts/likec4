import type { ExportColorSchemeSetting } from '@likec4/vscode-preview/protocol'
import { useCommand } from 'reactive-vscode'
import * as vscode from 'vscode'
import { commands } from '../meta'
import {
  type ExportCurrentViewDeps,
  type ExportFormat,
  getExportConfig,
  runExportCurrentView,
  updateExportSetting,
} from './exportCurrentView.shared'

type FormatQuickPickItem = vscode.QuickPickItem & { format: ExportFormat }
type ColorSchemeQuickPickItem = vscode.QuickPickItem & { value: ExportColorSchemeSetting }
type NumberQuickPickItem = vscode.QuickPickItem & { value: number }

const formatItems: Array<{ label: string; description?: string; format: ExportFormat }> = [
  { label: 'SVG', description: 'SVG export', format: 'svg' },
  { label: 'SVG (Graphviz)', description: 'Graphviz rendered SVG export', format: 'svg-graphviz' },
  { label: 'PNG', description: 'PNG image export', format: 'png' },
  { label: 'JPEG', description: 'JPEG image export', format: 'jpeg' },
  { label: 'Mermaid', description: 'Mermaid source', format: 'mermaid' },
  { label: 'DOT', description: 'Graphviz DOT source', format: 'dot' },
  { label: 'D2', description: 'D2 source', format: 'd2' },
  { label: 'PlantUML', description: 'PlantUML source', format: 'puml' },
]

const jpegQualityPresets = [60, 75, 85, 92, 100] as const

const colorSchemeItems: Array<{
  label: string
  description: string
  value: ExportColorSchemeSetting
}> = [
  {
    label: 'Inherit',
    description: 'Use the current VS Code theme',
    value: 'inherit',
  },
  {
    label: 'Light',
    description: 'Force light theme for this export',
    value: 'light',
  },
  {
    label: 'Dark',
    description: 'Force dark theme for this export',
    value: 'dark',
  },
]

async function showQuickPickWithDefault<T extends vscode.QuickPickItem>(
  items: readonly T[],
  options: vscode.QuickPickOptions & { activeItem?: T },
) {
  return await new Promise<T | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<T>()
    quickPick.items = items
    quickPick.canSelectMany = false
    quickPick.title = options.title
    quickPick.placeholder = options.placeHolder
    quickPick.ignoreFocusOut = options.ignoreFocusOut ?? false
    quickPick.matchOnDescription = options.matchOnDescription ?? false
    quickPick.matchOnDetail = options.matchOnDetail ?? false

    if (options.activeItem) {
      quickPick.activeItems = [options.activeItem]
    }

    quickPick.onDidAccept(() => {
      const [selected] = quickPick.selectedItems
      quickPick.hide()
      resolve(selected)
    })
    quickPick.onDidHide(() => {
      quickPick.dispose()
      resolve(undefined)
    })

    quickPick.show()
  })
}

async function pickFormat(lastFormat?: ExportFormat) {
  const items: FormatQuickPickItem[] = formatItems.map(item => ({
    ...item,
    ...(item.format === lastFormat ? { detail: 'Previously selected' } : {}),
  }))
  const activeItem = items.find(item => item.format === lastFormat)

  return await showQuickPickWithDefault<FormatQuickPickItem>(
    items,
    {
      canPickMany: false,
      title: 'Export current view',
      placeHolder: 'Select export format',
      ...(activeItem ? { activeItem } : {}),
    },
  )
}

async function pickColorScheme(currentValue: ExportColorSchemeSetting) {
  const items: ColorSchemeQuickPickItem[] = colorSchemeItems.map(item => ({
    ...item,
    ...(item.value === currentValue ? { detail: 'Current setting' } : {}),
  }))
  const activeItem = items.find(item => item.value === currentValue)

  const selected = await showQuickPickWithDefault<ColorSchemeQuickPickItem>(
    items,
    {
      canPickMany: false,
      title: 'Export color scheme',
      placeHolder: 'Select color scheme for this export',
      ...(activeItem ? { activeItem } : {}),
    },
  )

  return selected?.value
}

async function pickPngPixelRatio(currentValue?: number) {
  const items: NumberQuickPickItem[] = [1, 2, 3, 4].map(value => ({
    label: String(value),
    ...(value === currentValue ? { description: 'Current setting' } : {}),
    value,
  }))
  const activeItem = items.find(item => item.value === currentValue)

  const selected = await showQuickPickWithDefault<NumberQuickPickItem>(
    items,
    {
      canPickMany: false,
      title: 'PNG pixel ratio',
      placeHolder: 'Select PNG pixel ratio',
      ...(activeItem ? { activeItem } : {}),
    },
  )
  return selected?.value
}

async function pickJpegQuality(currentValue?: number) {
  const hasPresetMatch = currentValue !== undefined &&
    jpegQualityPresets.includes(currentValue as typeof jpegQualityPresets[number])
  const items: NumberQuickPickItem[] = [
    ...jpegQualityPresets.map(value => ({
      label: String(value),
      ...(value === currentValue ? { description: 'Current setting' } : {}),
      value,
    })),
    {
      label: 'Custom...',
      description: hasPresetMatch ? 'Enter a value between 0 and 100' : `Current setting: ${currentValue}`,
      value: -1,
    },
  ]
  const activeItem = items.find(item => item.value === currentValue)
    ?? items.find(item => item.value === -1)

  const selected = await showQuickPickWithDefault<NumberQuickPickItem>(
    items,
    {
      canPickMany: false,
      title: 'JPEG quality',
      placeHolder: 'Select JPEG quality',
      ...(activeItem ? { activeItem } : {}),
    },
  )
  if (!selected) {
    return undefined
  }
  if (selected.value !== -1) {
    return selected.value
  }

  const input = await vscode.window.showInputBox({
    title: 'JPEG quality',
    prompt: 'Enter a value between 0 and 100',
    ...(currentValue !== undefined ? { value: String(currentValue) } : {}),
    validateInput: value => {
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        return 'Enter an integer between 0 and 100'
      }
      return null
    },
  })
  if (input === undefined) {
    return undefined
  }
  return Number(input)
}

export function registerExportCurrentViewCommand(deps: ExportCurrentViewDeps) {
  useCommand(commands.exportCurrentview, async () => {
    deps.sendTelemetry(commands.exportCurrentview)

    const settings = getExportConfig()
    const selectedFormat = await pickFormat(settings.lastFormat)
    if (!selectedFormat) {
      return
    }

    const requiresColorSchemePrompt = selectedFormat.format === 'svg'
      || selectedFormat.format === 'png'
      || selectedFormat.format === 'jpeg'

    let colorScheme: ExportColorSchemeSetting = settings.colorScheme ?? 'inherit'
    if (requiresColorSchemePrompt) {
      const selectedColorScheme = await pickColorScheme(colorScheme)
      if (!selectedColorScheme) {
        return
      }
      colorScheme = selectedColorScheme
      await updateExportSetting('export.colorScheme', colorScheme)
    }

    if (selectedFormat.format === 'png') {
      const pixelRatio = await pickPngPixelRatio(settings.pngPixelRatio)
      if (pixelRatio === undefined) {
        return
      }
      await updateExportSetting('export.lastFormat', selectedFormat.format)
      await updateExportSetting('export.pngPixelRatio', pixelRatio)
      await runExportCurrentView(deps, {
        format: 'png',
        pngPixelRatio: pixelRatio,
      })
      return
    }

    if (selectedFormat.format === 'jpeg') {
      const quality = await pickJpegQuality(settings.jpegQuality)
      if (quality === undefined) {
        return
      }
      await updateExportSetting('export.lastFormat', selectedFormat.format)
      await updateExportSetting('export.jpegQuality', quality)
      await runExportCurrentView(deps, {
        format: 'jpeg',
        jpegQuality: quality,
      })
      return
    }

    await updateExportSetting('export.lastFormat', selectedFormat.format)
    await runExportCurrentView(deps, { format: selectedFormat.format })
  })
}
