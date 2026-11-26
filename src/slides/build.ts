import { STAGE_ATTR } from '@/domain/build'

/**
 * A slide that builds, as a host shows it (docs/slide-builds.md): the stage it stands at, and what becomes of the
 * units still to come – hidden for the room, faint for whoever presents.
 */
export interface Staged {
  at: number
  rest: 'hidden' | 'faint'
}

/**
 * Sets a rendered slide to a stage: the units the host numbered (src/domain/build.ts) that are still to come keep
 * their room and are hidden or faint, the ones of a stage that has just arrived come in with the stylesheet's motion.
 * The marks live on the elements only; the slide's markup is not touched.
 */
export function showStage(root: ParentNode, stage: number, rest: Staged['rest'], arriving: boolean): void {
  for (const el of root.querySelectorAll(`[${STAGE_ATTR}]`)) {
    const n = Number(el.getAttribute(STAGE_ATTR))
    el.classList.toggle('b-wait', rest === 'hidden' && n > stage)
    el.classList.toggle('b-ghost', rest === 'faint' && n > stage)
    el.classList.toggle('b-in', arriving && n === stage)
  }
}
