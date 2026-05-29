import type { CompanionBones, Hat, Species } from "./types"

// Single code-point sentinel that marks where the eye glyph goes. The art below
// is authored with the readable `{E}` token; it is collapsed to this one-column
// sentinel when BODIES is built so every stored line is exactly 12 columns wide
// (the literal `{E}` token is 3 chars and would otherwise inflate the count).
// U+E000 is a Private Use Area code point that never appears in the art itself.
const EYE = String.fromCharCode(0xe000)

// Each sprite is 5 lines tall, 12 wide (after {E}→1char substitution).
// Multiple frames per species for idle fidget animation.
// Line 0 is the hat slot — must be blank in frames 0-1; frame 2 may use it.
// Authored with the literal `{E}` token for readability; normalized below.
const BODY_SRC: Record<Species, string[][]> = {
  duck: [
    ["            ", "    __      ", "  <({E} )___  ", "   (  ._>   ", "    `--´    "],
    ["            ", "    __      ", "  <({E} )___  ", "   (  ._>   ", "    `--´~   "],
    ["            ", "    __      ", "  <({E} )___  ", "   (  .__>  ", "    `--´    "],
  ],
  goose: [
    ["            ", "     ({E}>    ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
    ["            ", "    ({E}>     ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
    ["            ", "     ({E}>>   ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
  ],
  cat: [
    ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")   '],
    ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")~  '],
    ["            ", "   /\\-/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")   '],
  ],
  dragon: [
    ["            ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (   ~~   ) ", "  `-vvvv-´  "],
    ["            ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (        ) ", "  `-vvvv-´  "],
    ["   ~    ~   ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (   ~~   ) ", "  `-vvvv-´  "],
  ],
  octopus: [
    ["            ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  /\\/\\/\\/\\  "],
    ["            ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  \\/\\/\\/\\/  "],
    ["     o      ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  /\\/\\/\\/\\  "],
  ],
  owl: [
    ["            ", "   /\\  /\\   ", "  (({E})({E}))  ", "  (  ><  )  ", "   `----´   "],
    ["            ", "   /\\  /\\   ", "  (({E})({E}))  ", "  (  ><  )  ", "   .----.   "],
    ["            ", "   /\\  /\\   ", "  (({E})(-))  ", "  (  ><  )  ", "   `----´   "],
  ],
  penguin: [
    ["            ", "  .---.     ", "  ({E}>{E})     ", " /(   )\\    ", "  `---´     "],
    ["            ", "  .---.     ", "  ({E}>{E})     ", " |(   )|    ", "  `---´     "],
    ["  .---.     ", "  ({E}>{E})     ", " /(   )\\    ", "  `---´     ", "   ~ ~      "],
  ],
  turtle: [
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[______]\\ ", "  ``    ``  "],
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[______]\\ ", "   ``  ``   "],
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[======]\\ ", "  ``    ``  "],
  ],
  snail: [
    ["            ", " {E}    .--.  ", "  \\  ( @ )  ", "   \\_`--´   ", "  ~~~~~~~   "],
    ["            ", "  {E}   .--.  ", "  |  ( @ )  ", "   \\_`--´   ", "  ~~~~~~~   "],
    ["            ", " {E}    .--.  ", "  \\  ( @  ) ", "   \\_`--´   ", "   ~~~~~~   "],
  ],
  ghost: [
    ["            ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  ~`~``~`~  "],
    ["            ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  `~`~~`~`  "],
    ["    ~  ~    ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  ~~`~~`~~  "],
  ],
  robot: [
    ["            ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ ==== ]  ", "  `------´  "],
    ["            ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ -==- ]  ", "  `------´  "],
    ["     *      ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ ==== ]  ", "  `------´  "],
  ],
  rabbit: [
    ["            ", "   (\\__/)   ", "  ( {E}  {E} )  ", " =(  ..  )= ", '  (")__(")  '],
    ["            ", "   (|__/)   ", "  ( {E}  {E} )  ", " =(  ..  )= ", '  (")__(")  '],
    ["            ", "   (\\__/)   ", "  ( {E}  {E} )  ", " =( .  . )= ", '  (")__(")  '],
  ],
  chonk: [
    ["            ", "  /\\    /\\  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´  "],
    ["            ", "  /\\    /|  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´  "],
    ["            ", "  /\\    /\\  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´~ "],
  ],
}

// Collapse the readable `{E}` token to the one-column EYE sentinel so every
// stored line is exactly 12 columns wide. renderSprite swaps EYE for the glyph.
const BODIES: Record<Species, string[][]> = Object.fromEntries(
  Object.entries(BODY_SRC).map(([species, frames]) => [
    species,
    frames.map((frame) => frame.map((line) => line.replaceAll("{E}", EYE))),
  ]),
) as Record<Species, string[][]>

const HAT_LINES: Record<Hat, string> = {
  none: "",
  crown: "   \\^^^/    ",
  tophat: "   [___]    ",
  propeller: "    -+-     ",
  halo: "   (   )    ",
  wizard: "    /^\\     ",
  beanie: "   (___)    ",
  tinyduck: "    ,>      ",
}

export { BODIES }

export function renderSprite(bones: CompanionBones, frame = 0): string[] {
  const frames = BODIES[bones.species]
  const body = frames[frame % frames.length]!.map((line) => line.replaceAll(EYE, bones.eye))
  const lines = [...body]
  // Only replace with hat if line 0 is empty (some fidget frames use it for smoke etc)
  if (bones.hat !== "none" && !lines[0]!.trim()) lines[0] = HAT_LINES[bones.hat]
  // Drop blank hat slot — wastes a row when there's no hat and no frame uses it.
  // Only safe when ALL frames have blank line 0; otherwise heights oscillate.
  if (!lines[0]!.trim() && frames.every((f) => !f[0]!.trim())) lines.shift()
  return lines
}

export function spriteFrameCount(species: Species): number {
  return BODIES[species].length
}

export function renderFace(bones: CompanionBones): string {
  const e = bones.eye
  switch (bones.species) {
    case "duck":
    case "goose":
      return `(${e}>`
    case "cat":
      return `=${e}ω${e}=`
    case "dragon":
      return `<${e}~${e}>`
    case "octopus":
      return `~(${e}${e})~`
    case "owl":
      return `(${e})(${e})`
    case "penguin":
      return `(${e}>)`
    case "turtle":
      return `[${e}_${e}]`
    case "snail":
      return `${e}(@)`
    case "ghost":
      return `/${e}${e}\\`
    case "robot":
      return `[${e}${e}]`
    case "rabbit":
      return `(${e}..${e})`
    case "chonk":
      return `(${e}.${e})`
  }
}
