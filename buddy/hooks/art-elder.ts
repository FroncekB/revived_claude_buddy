// The elder bodies (Progression spec section 5), in art-adult.ts's format: the adult's size with
// marks of age, every section drawn new, and nothing above the rest frame's head in any section.
// A species not drawn here yet is drawn as its adult.
import type { Species } from './roll'

export const ELDER: Partial<Record<Species, string>> = {
  duck: String.raw`
   ~__
  <({E} )___
  ( ._> / |
   '---' _|
~
   ~__
  <({E} )___
  ( ._> \/|
   '---' _|
~
   ~__  !
  <({E} )___
 \( ._> /\|
   '---' _|
~
 \ ~__
  <({E} )___/
  ( ._> / |
   '---' _|
~

   ~__
  <({E} )____|
  (_.__>_/_|
`,
  goose: String.raw`
   ,-({E}>
  (#
 _(#  )_/|
 ^^  ^^  |
~
   ,-({E}O
  (#
 _(#  )_/|
  ^^ ^^  |
~
 ! ({E}>
   (#
 _(#  )_ |
 ^^  ^^  |
~
   ,-({E}> |
  (#     |
\_(#  )_/
 ^^  ^^
~

   .---.
 _(# {E}<)_ |
 ^^  ^^  _|
`,
  blob: String.raw`
     ~
  .--'--.
 (={E}   {E}=)
(____~____)
~
      ~
  .--'--.
 (={E}   {E}=)
(_____~___)
~
     |   !
  .--'--.
 (={E}   {E}=)
(____o____)
~
     ~
  .--'--.
\(={E}   {E}=)/
(___\_/___)
~

  .--~--.
(={E}     {E}=)
(_________)
`,
  cat: String.raw`
  /\_/\
 ( {E} {E} )
==\vwv/===
/ (")(")@ \
~
  /\_/\
 ( {E} {E} )
==\vwv/===
/ (")(")_@\
~
  /\_/\  !
 ( {E} {E} )
==\vov/===
 /(")(")\ @
~
  /\_/\
 ( {E} {E} )
\=\vwv/=/
  (")(")@
~

  /\_/\___
 ( {E} {E}    )@
==\vwv/___)
`,
  dragon: String.raw`
  @)    (@
 (  {E}  {E}  )
 ~\  vv  /~
 '/\_||_/\'
~
  @)    (@
 (  {E}  {E}  )
 ~\  ~~  /~
 '/\_||_/\'~
~
  @)    (@ !
 (  {E}  {E}  )
 ~\  ^^  /~
 '/\_||_/\'
~
  @)    (@
 (  {E}  {E}  )
 ~\  vv  /~*
\/\_||_/\/
~

  @)____(@
 (  {E}  {E}  )
~~\__||__/~~
`,
  octopus: String.raw`
  ,~~~~,
 ( {E} ({E}))
 (  __  )_
 //|||||\ |
~
  ,~~~~,
 ( {E} ({E}))
 (  __  )_
 \\|||||/ |
~
  ,~~~~, !
 ( {E} ({E}))
 (  oo  )_
/// ||\\ |
~
\\,~~~~,  |
 \( {E} ({E}))|
 (  \/  )/
  /||||\
~

  ,~~~~,
 ( {E} ({E}))_
~~|||||~~  |
`,
}
