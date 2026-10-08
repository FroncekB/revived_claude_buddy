// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section.
import type { Species } from './roll'

export const HATCHLING: Record<Species, string> = {
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
  ('{E} {E} )
~

      .
   .' ,'
  ('{E} {E} )
~

    .   !
  .' '.
 ('{E} {E} )
~

     .
  \.' './
  ('{E} {E} )
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
  owl: String.raw`

  .~~~~.
 (({E})({E}))
  '-\/-'
~

  .~~~~.
 (({E})(-))
  '-\/-'
~

 .~~~~. !
(({E})({E}))
/'-<>-'\
~

 \.~~~~./
 (({E})({E}))
  '-\/-'
~


 .({E})({E}).
 (__\/__)
`,
  penguin: String.raw`

   ({E}v{E})
  /(:::)\
    ^ ^
~

   ({E}v{E})
  \(:::)/
    ^ ^
~

  ({E}o{E}) !
 -(:::)-
   ^ ^
~

  \({E}v{E})/
   (:::)
   ^   ^
~


   ({E}v{E})
  _(:::)_
`,
  turtle: String.raw`

   .==.
  (/\/\)
  '({E}{E})'
~

   .==.
  (/\/\)
 ' ({E}{E}) '
~

  .==. !
 (/{E}{E}\)
 '    '
~

   .==.
 \(/\/\)/
  '({E}{E})'
~


   .==.
  (/{E}{E}\)
`,
  snail: String.raw`

 {E} {E}  .-.
 \_\__(e)
  ~~~~~~
~

 {E}  {E} .-.
 |_/__(e)
  ~~~~~~
~

  !   .-.
 {E}{E}___(e)
  ~~~~~~
~

{E}   {E} .-.
 \_/__(e)
  ~~~~~~
~


      .-.
  _{E}{E}_(e)
`,
  ghost: String.raw`

   .-'-.
  / {E} {E} \
  '~~~~~'
~

   .-'-.
  / {E}o{E} \
  '~~~~~'
~

  .-'-. !
 / {E} {E} \
 '~~~~~'
~

  \.-'-./
  / {E} {E} \
  '~~~~~'
~


  / {E} {E} \
  '-----'
`,
  axolotl: String.raw`

   ,---,
  }({E}.{E}){
   (___)~
~

   ,---,
  {({E}.{E})}
   (___)~
~

  ,---, !
}}({E}.{E}){{
  (_o_)~
~

   ,---,
  }({E}.{E}){
  \(___)/
~


  }({E}.{E}){
  ~(___)~
`,
  capybara: String.raw`

  o____o
 ( {E}  {E} )
  '(oo)'
~

  o____o
 ( {E}  {E} )
  '(..)'
~

 o____o !
( {E}  {E} )
/'(oo)'\
~

 \o____o/
 ( {E}  {E} )
  '(oo)'
~


  o____o
 ({E}(..){E})
`,
  cactus: String.raw`

  (_\/_)
  _|{E}{E}|_
  \____/
~

  (_\/_/
  _|{E}{E}|_
  \____/
~

   (\/) !
  _|{E}{E}|_
  \____/
~

  \_\/_/
  _|{E}{E}|_
  \____/
~


  (/{E}{E}\)
  \____/
`,
  robot: String.raw`

    _|_
  |[{E}_{E}]|
  d[___]b
~

    _*_
  |[{E}_{E}]|
  d[___]b
~

  * _|_ *
  |[{E}!{E}]|
  d[___]b
~

  \ _|_ /
  |[{E}_{E}]|
  d[___]b
~


    _\_
  _[{E}.{E}]_
`,
  rabbit: String.raw`

   (\ /)
  =({E}.{E})=
   (" ")
~

   (\ _)
  =({E}.{E})=
   (" ")
~

  (| |) !
 =({E}o{E})=
  (" ")
~

   (\ /)
  \({E}w{E})/
   (' ')
~


   __ __
  =({E}.{E})=
`,
  mushroom: String.raw`

   .o-.
  (____)
   |{E}{E}|
~

   .o-. .
  (____)
   |{E}{E}|
~

  .o-.
 (____) !
   |{E}{E}|
~

   .o-.
  (____)
  \|{E}{E}|/
~


   .o-.
  (_{E}{E}_)
`,
  chonk: String.raw`

  /\__/\
 ( {E}  {E} )
 (__ww__)
~

  /\__/\
 ( {E}  {E} )
~(__ww__)
~

 /\__/\ !
( {E}  {E} )
/(_oo_)\
~

  /\__/\
 \({E}  {E})/
 (__ww__)
~


  /\__/\
 (_{E}ww{E}_)
`,
}
