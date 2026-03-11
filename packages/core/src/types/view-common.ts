import type * as aux from './_aux'
import type { AnyAux } from './_aux'
import type { _stage } from './const'

import type { GlobalPredicateId, GlobalStyleID } from './global'
import type * as scalar from './scalar'
import type {
  BorderStyle,
  Color,
  ElementShape,
  IconPosition,
  IconSize,
  ShapeSize,
  SpacingSize,
  TextSize,
} from './styles'

export interface AnyIncludePredicate<Expr> {
  include: Expr[]
  exclude?: never
}
export interface AnyExcludePredicate<Expr> {
  include?: never
  exclude: Expr[]
}

export interface AnyViewRuleStyle<Expr> {
  targets: Expr[]
  notation?: string
  style: {
    border?: BorderStyle
    opacity?: number
    multiple?: boolean
    size?: ShapeSize
    padding?: SpacingSize
    textSize?: TextSize
    color?: Color
    shape?: ElementShape
    icon?: scalar.Icon
    iconColor?: Color
    iconSize?: IconSize
    iconPosition?: IconPosition
  }
}

export interface ViewRuleGlobalStyle {
  styleId: GlobalStyleID
}
export function isViewRuleGlobalStyle(rule: object): rule is ViewRuleGlobalStyle {
  return 'styleId' in rule
}

export interface ViewRuleGlobalPredicateRef {
  predicateId: GlobalPredicateId
}
export function isViewRuleGlobalPredicateRef(rule: object): rule is ViewRuleGlobalPredicateRef {
  return 'predicateId' in rule
}

export type RankValue = 'max' | 'min' | 'same' | 'sink' | 'source'

export interface ViewRuleRank<Expr> {
  targets: Expr[]
  rank: RankValue
}

export type AutoLayoutDirection = 'TB' | 'BT' | 'LR' | 'RL'
export function isAutoLayoutDirection(autoLayout: unknown): autoLayout is AutoLayoutDirection {
  return autoLayout === 'TB' || autoLayout === 'BT' || autoLayout === 'LR' || autoLayout === 'RL'
}

/**
 * Controls the style of edges in auto-layout mode.
 * Maps to graphviz `splines` attribute.
 *
 * - `default` - curved lines that avoid nodes (graphviz `spline`)
 * - `ortho`   - orthogonal (right-angle) lines
 * - `curved`  - curved lines (may overlap nodes)
 * - `polyline`- straight line segments that avoid nodes
 * - `line`    - straight lines
 * - `none`    - no edge lines are drawn
 */
export type AutoLayoutEdgeStyle = 'default' | 'ortho' | 'curved' | 'polyline' | 'line' | 'none'
export function isAutoLayoutEdgeStyle(value: unknown): value is AutoLayoutEdgeStyle {
  return (
    value === 'default'
    || value === 'ortho'
    || value === 'curved'
    || value === 'polyline'
    || value === 'line'
    || value === 'none'
  )
}

export interface ViewRuleAutoLayout {
  direction: AutoLayoutDirection
  nodeSep?: number
  rankSep?: number
}

export function isViewRuleAutoLayout(rule: object): rule is ViewRuleAutoLayout {
  return 'direction' in rule
}

export interface ViewRuleEdgeStyle {
  edgeStyle: AutoLayoutEdgeStyle
}

export function isViewRuleEdgeStyle(rule: object): rule is ViewRuleEdgeStyle {
  return 'edgeStyle' in rule && !('direction' in rule)
}

export interface ViewAutoLayout {
  direction: ViewRuleAutoLayout['direction']
  rankSep?: number
  nodeSep?: number
  edgeStyle?: AutoLayoutEdgeStyle
}

export type ViewType = 'element' | 'dynamic' | 'deployment'

export interface BaseViewProperties<A extends AnyAux> extends aux.WithOptionalTags<A>, aux.WithOptionalLinks {
  readonly id: aux.StrictViewId<A>
  readonly title: string | null
  readonly description: scalar.MarkdownOrString | null
  /**
   * Source file containing this view, relative to the project root.
   * Undefined if the view is auto-generated.
   */
  readonly sourcePath?: string | undefined
}

export interface BaseParsedViewProperties<A extends AnyAux> extends BaseViewProperties<A> {
  /**
   * Internal field to identify the stage of the view.
   * This is used to create the correct type of the view.
   */
  readonly [_stage]: 'parsed'
  /**
   * URI to the source file of this view.
   * Undefined if the view is auto-generated.
   */
  readonly docUri?: string | undefined
}

export type NodeNotation = {
  kinds: string[]
  shape: ElementShape
  color: Color
  title: string
}

export interface ViewWithNotation {
  notation?: {
    nodes: NodeNotation[]
  }
}
export interface ViewWithHash {
  /**
   * Hash of the view object.
   * This is used to detect changes in layout
   */
  hash: string
}
