// Writes docs/art/stages.txt: every species at every stage, its frames side by side,
// with a crown on the hat row so its place above the head shows. Run from the repo root:
//   node tools/art-sheet.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SPECIES = [
  'duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle',
  'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk',
]
const STAGES = [
  ['hatchling', 'art-hatchling.ts'],
  ['adult', 'art-adult.ts'],
  ['elder', 'art-elder.ts'],
]
// Each frame's name and the eye it is drawn with. Fidget A is the rest frame a column right.
const FRAMES = [['rest', '·'], ['fidget A', '·'], ['fidget B', '·'], ['flinch', 'O'], ['celebrate', '^'], ['sleep', '-']]
const CROWN = '   .WWW.'
const W = 12

// A stage file's object: from the "{" after its type to the file's last "}", evaluated as
// JavaScript. The entries are String.raw templates, so they read back exactly as written.
function load(file) {
  const src = readFileSync(`buddy/hooks/${file}`, 'utf8').replace(/\r/g, '')
  const from = src.indexOf('{', src.indexOf('Record<Species, string>'))
  return new Function(`return ${src.slice(from, src.lastIndexOf('}') + 1)}`)()
}

// An entry's sections, split at its "~" lines, as sprites.ts splits them.
function sections(entry) {
  const out = [[]]
  for (const line of entry.split('\n').slice(1, -1)) {
    if (line === '~') out.push([])
    else out.at(-1).push(line)
  }
  return out
}

const art = Object.fromEntries(STAGES.map(([stage, file]) => [stage, load(file)]))
const lines = []
for (const species of SPECIES) {
  lines.push(`== ${species} ==`)
  for (const [stage] of STAGES) {
    const [rest, fidgetB, flinch, celebrate, sleep] = sections(art[stage][species])
    const frames = [rest, rest.map(r => ' ' + r), fidgetB, flinch, celebrate, sleep]
    const head = Math.max(0, rest.findIndex(r => r.trim() !== ''))
    lines.push(`-- ${stage}`, FRAMES.map(([name]) => name.padEnd(W)).join('  ').trimEnd())
    const drawn = frames.map((rows, i) => {
      const sprite = ['', ...rows.map(r => r.split('{E}').join(FRAMES[i][1]))]
      sprite[head] = CROWN
      return sprite.map(r => r.padEnd(W))
    })
    for (let row = 0; row < 5; row++) lines.push(drawn.map(f => f[row]).join('  ').trimEnd())
    lines.push('')
  }
}
mkdirSync('docs/art', { recursive: true })
writeFileSync('docs/art/stages.txt', lines.join('\n'))
console.log('wrote docs/art/stages.txt')
