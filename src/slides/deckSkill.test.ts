import { describe, expect, it } from 'vitest'
import { SLIDE_LAYOUTS } from '@/domain/slideFormat'
import { normalizeSlideHtml } from '@/domain/slides'
import { deckSkill } from './deckSkill'
import { findDecks } from './importDeck'

describe('the skill for other AIs', () => {
  const text = deckSkill()

  it('names every layout a person writes, with its example, and leaves out what the app generates', () => {
    for (const l of SLIDE_LAYOUTS) {
      if (l.generated) expect(text, l.layout).not.toContain(`### ${l.layout}\n`)
      else {
        expect(text, l.layout).toContain(`### ${l.layout}\n`)
        expect(text, l.layout).toContain(l.example)
      }
    }
  })

  it('needs no tools of this repository, and says where a deck goes', () => {
    expect(text).not.toMatch(/scripts\/|private-|npm |python3 /)
    expect(text).toContain('geht an den Anbieter')
  })

  it('starts as a skill, so that an assistant that knows them can use the file as it is', () => {
    expect(text.split('\n').slice(0, 4).join('\n')).toMatch(/^---\nname: folien-uebersetzen\ndescription: .+\n---$/)
  })

  it('describes what the import reads: the example folder is found as a deck', async () => {
    const file = (name: string, body: string) => Object.defineProperty(new File([body], name.split('/').pop()!), 'webkitRelativePath', { value: name })
    const slide = '<section class="slide statement"><p class="big">Ein Satz</p></section>'
    const [deck] = await findDecks([file('deck.json', '{"title":"Titel des Foliensatzes"}'), file('01-statement.html', slide)])
    expect(deck.meta.title).toBe('Titel des Foliensatzes')
    expect(deck.fragments).toHaveLength(1)
    expect(normalizeSlideHtml(slide)).toContain('statement')
  })
})
