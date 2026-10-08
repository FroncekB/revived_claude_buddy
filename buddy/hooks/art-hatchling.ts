// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section. A species not drawn here yet is
// drawn as its adult.
import type { Species } from './roll'

export const HATCHLING: Partial<Record<Species, string>> = {
  duck: String.raw`

    __
   ({E}>
   (__)
~

    __
   ({E}>
  /(__)
~

   __  !
  ({E}>
  (__)
~

  \ __ /
   ({E}>
   (__)
~


   ({E}>_
   (___)
`,
  goose: String.raw`

    ({E}>
   {,,,}
  ^^^ ^^^
~

    ({E}O
   {,,,}/
  ^^^ ^^^
~

   ({E}>  !
  {,,,}
 ^^^ ^^^
~

  \ ({E}> /
   {,,,}
  ^^^ ^^^
~


   {,,{E}<}
  ^^^ ^^^
`,
  blob: String.raw`

     .
   .' '.
   ('{E} {E})
~

      .
   .' ,'
   ('{E} {E})
~

    .   !
  .' '.
  ('{E} {E})
~

    .
  .' '.
 \('{E} {E})/
~


   .-'-.
  ('{E}.{E} )
`,
  cat: String.raw`

  /\   /\
  =({E}.{E})=
  (")(")'
~

  /\   /|
  =({E}.{E})=
  (")("),
~

/\   /\ !
=({E}o{E})=
/(")(")\
~

  /\   /\
  \({E}w{E})/
  (")(")'
~


 /\___/\_
 (_{E}.{E}__)
`,
  dragon: String.raw`

   n  n
 /({E}vv{E})\
  \/\/\/
~

   n  n
 /({E}~~{E})\
  \/\/\/~
~

  n  n  !
/({E}^^{E})\
 \/\/\/
~

 \ n  n /
  ({E}vv{E})
  \/\/\/
~


  ({E}vv{E})
 \/\/\/\/
`,
  octopus: String.raw`

   ,--,
  ({E}  {E})
   /||\
~

   ,--,
  ({E}  {E})
   \||/
~

  ,--, !
 ({E}  {E})
 /|  |\
~

   ,--,
 \({E}  {E})/
    ||
~


   ,--,
 ~({E}  {E})~
`,
}
