import { type ViewChange, invariant } from '@likec4/core'
import { GrammarUtils } from 'langium'
import { findLast, isNumber } from 'remeda'
import { TextEdit } from 'vscode-languageserver-types'
import { type ParsedAstView, type ParsedLikeC4LangiumDocument, ast, toAstViewLayoutDirection } from '../ast'
import type { LikeC4Services } from '../module'

const { findNodeForKeyword } = GrammarUtils

type ChangeViewLayoutArg = {
  view: ParsedAstView
  doc: ParsedLikeC4LangiumDocument
  viewAst: ast.LikeC4View
  layout: ViewChange.ChangeAutoLayout['layout']
}

export function changeViewLayout(_services: LikeC4Services, {
  view,
  viewAst,
  layout,
}: ChangeViewLayoutArg): TextEdit {
  // Should never happen
  invariant(viewAst.body, `View ${view.id} has no body`)
  const viewCstNode = viewAst.$cstNode
  invariant(viewCstNode, 'viewCstNode')
  const newdirection = toAstViewLayoutDirection(layout.direction)
  const existingRule = findLast(viewAst.body.rules, ast.isViewRuleAutoLayout) as ast.ViewRuleAutoLayout | undefined

  let newAutoLayoutRule = `autoLayout ${newdirection}`

  if (isNumber(layout.rankSep)) {
    newAutoLayoutRule += ` ${layout.rankSep}`
    if (isNumber(layout.nodeSep)) {
      newAutoLayoutRule += ` ${layout.nodeSep}`
    }
  }

  if (existingRule && existingRule.$cstNode) {
    return TextEdit.replace(existingRule.$cstNode.range, newAutoLayoutRule)
  }

  const insertPos = findNodeForKeyword(viewAst.body.$cstNode, '}')?.range.start
  invariant(insertPos, 'Closing brace not found')

  let insert = `\t${newAutoLayoutRule}`
  if (layout.edgeStyle != null && layout.edgeStyle !== 'spline') {
    insert += `\n\tedgeStyle ${layout.edgeStyle}`
  }
  insert += '\n\t'

  return TextEdit.insert(insertPos, insert)
}
