import type {
  DocumentNode,
  DocumentSection,
  DocumentStyleDefinitions,
  FlowTableNode,
  LayoutNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphBoxStyle,
  ParagraphNode,
  ParagraphProps,
  ParagraphStyleProperties,
  TextRunStyle,
  UnitValue,
} from "../schema"

function cloneUnitValue(value: UnitValue): UnitValue {
  return { ...value }
}

function cloneParagraphBoxPadding(padding: ParagraphBoxPadding): ParagraphBoxPadding {
  return {
    top: cloneUnitValue(padding.top),
    right: cloneUnitValue(padding.right),
    bottom: cloneUnitValue(padding.bottom),
    left: cloneUnitValue(padding.left),
  }
}

function cloneParagraphBoxBorderSide(side: ParagraphBoxBorderSide): ParagraphBoxBorderSide {
  return {
    ...side,
    width: cloneUnitValue(side.width),
  }
}

function cloneParagraphBoxBorder(border: ParagraphBoxBorder): ParagraphBoxBorder {
  return {
    ...(border.top ? { top: cloneParagraphBoxBorderSide(border.top) } : {}),
    ...(border.right ? { right: cloneParagraphBoxBorderSide(border.right) } : {}),
    ...(border.bottom ? { bottom: cloneParagraphBoxBorderSide(border.bottom) } : {}),
    ...(border.left ? { left: cloneParagraphBoxBorderSide(border.left) } : {}),
  }
}

function cloneParagraphBoxStyle(box: ParagraphBoxStyle): ParagraphBoxStyle {
  return {
    ...(box.fill ? { fill: box.fill } : {}),
    ...(box.padding ? { padding: cloneParagraphBoxPadding(box.padding) } : {}),
    ...(box.border ? { border: cloneParagraphBoxBorder(box.border) } : {}),
  }
}

export function cloneParagraphStyleProperties(properties: ParagraphStyleProperties): ParagraphStyleProperties {
  return {
    ...properties,
    ...(properties.fontSize ? { fontSize: cloneUnitValue(properties.fontSize) } : {}),
    ...(properties.spacingBefore ? { spacingBefore: cloneUnitValue(properties.spacingBefore) } : {}),
    ...(properties.spacingAfter ? { spacingAfter: cloneUnitValue(properties.spacingAfter) } : {}),
    ...(properties.textIndent ? { textIndent: cloneUnitValue(properties.textIndent) } : {}),
    ...(properties.indentLeft ? { indentLeft: cloneUnitValue(properties.indentLeft) } : {}),
    ...(properties.indentRight ? { indentRight: cloneUnitValue(properties.indentRight) } : {}),
    ...(properties.box ? { box: cloneParagraphBoxStyle(properties.box) } : {}),
  }
}

export function mergeParagraphStyleProperties(
  ...layers: Array<ParagraphStyleProperties | undefined>
): ParagraphStyleProperties {
  return layers.reduce<ParagraphStyleProperties>((merged, layer) => {
    if (!layer) return merged
    return {
      ...merged,
      ...cloneParagraphStyleProperties(layer),
    }
  }, {})
}

export function resolveParagraphStyleProperties(
  styles: DocumentStyleDefinitions | undefined,
  styleId: string | undefined,
  localOverrides?: ParagraphStyleProperties,
): ParagraphStyleProperties {
  const style = styleId ? styles?.paragraphStyles?.[styleId]?.props : undefined
  return mergeParagraphStyleProperties(style, localOverrides)
}

export function applyParagraphStyleProperties(
  props: ParagraphProps,
  properties: ParagraphStyleProperties | undefined,
): ParagraphProps {
  if (!properties) return props
  const cloned = cloneParagraphStyleProperties(properties)
  const { headingLevel, ...rest } = cloned
  const styled: ParagraphProps = {
    ...props,
    ...rest,
  }
  if (Object.prototype.hasOwnProperty.call(properties, "headingLevel") && properties.headingLevel == null) {
    delete styled.headingLevel
  } else if (headingLevel != null) {
    styled.headingLevel = headingLevel
  }
  return styled
}

export function resolveParagraphStyleForNode(
  styles: DocumentStyleDefinitions | undefined,
  paragraph: ParagraphNode,
): ParagraphStyleProperties {
  return resolveParagraphStyleProperties(styles, paragraph.props.paragraphStyleId, paragraph.props.styleOverrides)
}

export function resolveStyledParagraphProps(
  styles: DocumentStyleDefinitions | undefined,
  paragraph: ParagraphNode,
  localOverrides?: ParagraphStyleProperties,
): ParagraphProps {
  const properties = mergeParagraphStyleProperties(
    resolveParagraphStyleProperties(styles, paragraph.props.paragraphStyleId),
    paragraph.props.styleOverrides,
    localOverrides,
  )
  return applyParagraphStyleProperties(paragraph.props, properties)
}

function paragraphNeedsStyleResolution(paragraph: ParagraphNode): boolean {
  return Boolean(paragraph.props.paragraphStyleId || paragraph.props.styleOverrides)
}

function resolveParagraphNodeForDocumentStyles(
  styles: DocumentStyleDefinitions | undefined,
  node: ParagraphNode,
): ParagraphNode {
  if (!paragraphNeedsStyleResolution(node)) return node
  return {
    ...node,
    props: resolveStyledParagraphProps(styles, node),
  }
}

function resolveFlowTableParagraphStyles(
  styles: DocumentStyleDefinitions | undefined,
  table: FlowTableNode,
): FlowTableNode {
  let changed = false
  const nodes = Object.fromEntries(
    Object.entries(table.nodes).map(([nodeId, node]) => {
      if (node.type !== "paragraph") return [nodeId, node]
      const resolved = resolveParagraphNodeForDocumentStyles(styles, node)
      if (resolved !== node) changed = true
      return [nodeId, resolved]
    }),
  ) as FlowTableNode["nodes"]

  return changed ? { ...table, nodes } : table
}

function resolveLayoutNodeParagraphStyles(
  styles: DocumentStyleDefinitions | undefined,
  node: LayoutNode,
): LayoutNode {
  if (node.type === "paragraph") return resolveParagraphNodeForDocumentStyles(styles, node)
  if (node.type === "flow-table") return resolveFlowTableParagraphStyles(styles, node as unknown as FlowTableNode) as unknown as LayoutNode
  return node
}

function resolveSectionParagraphStyles(
  styles: DocumentStyleDefinitions | undefined,
  section: DocumentSection,
): DocumentSection {
  let changed = false
  const nodes = Object.fromEntries(
    Object.entries(section.nodes).map(([nodeId, node]) => {
      const resolved = resolveLayoutNodeParagraphStyles(styles, node)
      if (resolved !== node) changed = true
      return [nodeId, resolved]
    }),
  )

  return changed ? { ...section, nodes } : section
}

export function resolveDocumentParagraphStyles(doc: DocumentNode): DocumentNode {
  let changed = false
  const styles = doc.document.styles
  const sections = doc.document.sections.map((section) => {
    const resolved = resolveSectionParagraphStyles(styles, section)
    if (resolved !== section) changed = true
    return resolved
  })

  return changed
    ? {
      ...doc,
      document: {
        ...doc.document,
        sections,
      },
    }
    : doc
}

export function setParagraphStyleOverrides(
  paragraph: ParagraphNode,
  overrides: ParagraphStyleProperties | undefined,
): ParagraphNode {
  const nextProps: ParagraphProps = { ...paragraph.props }
  if (overrides && Object.keys(overrides).length > 0) {
    nextProps.styleOverrides = cloneParagraphStyleProperties(overrides)
  } else {
    delete nextProps.styleOverrides
  }
  return { ...paragraph, props: nextProps }
}

function cloneTextRunStyle(style: TextRunStyle): TextRunStyle {
  return {
    ...style,
    ...(style.fontSize ? { fontSize: cloneUnitValue(style.fontSize) } : {}),
  }
}

export function mergeTextRunStyleProperties(...layers: Array<TextRunStyle | undefined>): TextRunStyle {
  return layers.reduce<TextRunStyle>((merged, layer) => {
    if (!layer) return merged
    return {
      ...merged,
      ...cloneTextRunStyle(layer),
    }
  }, {})
}

export function resolveTextRunStyleProperties(
  styles: DocumentStyleDefinitions | undefined,
  styleId: string | undefined,
  localOverrides?: TextRunStyle,
): TextRunStyle {
  const style = styleId ? styles?.textRunStyles?.[styleId]?.style : undefined
  return mergeTextRunStyleProperties(style, localOverrides)
}
