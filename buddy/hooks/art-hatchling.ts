// The hatchling bodies (Progression spec section 5), in art-adult.ts's format: at most 3 rows and
// 9 columns in every section, standing on the bottom row, the head near column 6 where the hats
// sit, and nothing above the rest frame's head in any section. A species not drawn here yet is
// drawn as its adult.
import type { Species } from './roll'

export const HATCHLING: Partial<Record<Species, string>> = {}
