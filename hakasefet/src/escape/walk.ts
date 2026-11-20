import type { WalkStep } from './types'

/** A walkthrough step as an engine action body (without id / by / now). */
export function walkAction(step: WalkStep): Record<string, unknown> {
  if ('take' in step) return { type: 'TAKE', hotspot: step.take }
  if ('solve' in step) return { type: 'SOLVE', hotspot: step.solve, input: step.input }
  if ('reveal' in step) return { type: 'REVEAL', hotspot: step.reveal }
  if ('read' in step) return { type: 'READ', hotspot: step.read }
  if ('act' in step) return { type: 'ACT', hotspot: step.act }
  if ('combine' in step) return { type: 'COMBINE', a: step.combine[0], b: step.combine[1] }
  if ('waitUntil' in step) return { type: 'WAIT', until: step.waitUntil }
  return { type: 'USE', hotspot: step.use, item: step.item }
}
