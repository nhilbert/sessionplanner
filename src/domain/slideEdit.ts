import { type El, type Node, elements, isEl, parseTree, serializeNodes } from './slideTree.ts'
import { normalizeSlideHtml } from './slides.ts'

/**
 * Changes to one element of a slide (docs/slides.md, section 7, "On the slide"): the element the user clicked is
 * named by its path – the positions among the element children, from the section down – and the change is made in
 * the slide's markup: new inline content, another picture, the element gone. The editor reads the result as a
 * slide document again, so a change made on the slide and one made in a field end in the same place.
 *
 * The path is taken from the slide as the browser shows it. The markup is sanitised, so both have the same
 * elements in the same order; `elementAt` still checks the tags on the way, because a browser repairs markup it
 * does not accept (a table row without its tbody) and the positions then differ.
 */

export type TreePath = number[]

/** The slide's markup as a tree, with its section. */
function open(html: string): { nodes: Node[]; root: El } | null {
  const nodes = parseTree(normalizeSlideHtml(html))
  const root = nodes.find((n): n is El => isEl(n) && n.tag === 'section')
  return root ? { nodes, root } : null
}

function walk(root: El, path: TreePath, tags?: string[]): El | null {
  let at = root
  for (let i = 0; i < path.length; i++) {
    const next = elements(at)[path[i]]
    if (!next || (tags && tags[i] !== next.tag)) return null
    at = next
  }
  return at
}

/** The element at a path, or null when there is none or its tags are not the ones the browser shows (`tags`, lower case, one per step). */
export function elementAt(html: string, path: TreePath, tags?: string[]): El | null {
  const tree = open(html)
  return tree ? walk(tree.root, path, tags) : null
}

function change(html: string, path: TreePath, apply: (el: El, parent: El) => void): string | null {
  const tree = open(html)
  if (!tree || !path.length) return null
  const parent = walk(tree.root, path.slice(0, -1))
  const target = parent && elements(parent)[path[path.length - 1]]
  if (!parent || !target) return null
  apply(target, parent)
  return serializeNodes(tree.nodes)
}

/** The slide with the inline content of an element replaced. */
export const setInline = (html: string, path: TreePath, children: Node[]): string | null => change(html, path, (el) => (el.children = children))

/** The slide with another picture in an img. */
export const setImage = (html: string, path: TreePath, hash: string): string | null =>
  change(html, path, (el) => {
    if (el.tag === 'img') el.attrs = { ...el.attrs, src: `asset:${hash}` }
  })

/** The slide without an element. */
export const removeAt = (html: string, path: TreePath): string | null => change(html, path, (el, parent) => (parent.children = parent.children.filter((n) => n !== el)))

/** The slide with an element emptied: what stands in a fixed place (a cell of a matrix or a table) is cleared, not removed. */
export const clearAt = (html: string, path: TreePath): string | null => change(html, path, (el) => (el.children = []))
