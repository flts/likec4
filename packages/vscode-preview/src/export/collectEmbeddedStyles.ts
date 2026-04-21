/**
 * Collects all CSS text from the document's accessible stylesheets.
 * Skips cross-origin stylesheets that cannot be accessed.
 * Also collects any inline `<style>` elements inside the given root element.
 *
 * @param forElement Optional root element to also collect inline styles from.
 */
export function collectEmbeddedStyles(forElement?: HTMLElement): string {
  const sheets = new Set<string>()

  // Collect from document stylesheets
  for (const sheet of document.styleSheets) {
    try {
      const rules = Array.from(sheet.cssRules)
      const sheetText = rules.map(r => r.cssText).join('\n')
      const normalizedText = sheetText.trim()
      if (normalizedText) {
        sheets.add(normalizedText)
      }
    } catch {
      // Cross-origin stylesheet — skip silently
    }
  }

  // Collect any inline <style> elements inside the element
  if (forElement) {
    for (const style of forElement.querySelectorAll('style')) {
      const text = style.textContent?.trim()
      if (text) {
        sheets.add(text)
      }
    }
  }

  return Array.from(sheets).join('\n')
}

/**
 * Collects all CSS custom properties (variables) from the document root
 * and returns them as a `:root { ... }` CSS block string.
 * This is needed because CSS custom properties are not inherited into SVG context by default.
 */
export function collectRootCssVariables(): string {
  const rootStyle = getComputedStyle(document.documentElement)
  const vars = new Map<string, string>()

  for (const prop of rootStyle) {
    if (prop.startsWith('--')) {
      const val = rootStyle.getPropertyValue(prop).trim()
      if (val) {
        vars.set(prop, val)
      }
    }
  }

  if (vars.size === 0) {
    return ''
  }

  const declarations = Array.from(vars, ([prop, val]) => `  ${prop}: ${val};`)

  return `:root {\n${declarations.join('\n')}\n}\n`
}

/**
 * Resolves the solid background color for JPEG exports.
 * Attempts to read VS Code's editor background variable, falling back to a sensible default.
 */
export function resolveThemeBackgroundColor(): string {
  const vscodeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vscode-editor-background')
    .trim()

  if (vscodeColor) {
    return vscodeColor
  }

  // Fallback: read body background
  const bodyColor = getComputedStyle(document.body).backgroundColor
  if (bodyColor && bodyColor !== 'transparent' && bodyColor !== 'rgba(0, 0, 0, 0)') {
    return bodyColor
  }

  return '#ffffff'
}
