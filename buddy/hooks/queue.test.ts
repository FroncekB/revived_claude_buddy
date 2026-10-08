import { expect, test } from 'claude-code/testing'

import { mergeQueues, queueNewest } from './queue'

test('a queue keeps its newest items', () => {
  expect(queueNewest(undefined, [1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5])
  expect(queueNewest([1, 2], [3], 3)).toEqual([1, 2, 3])
  expect(queueNewest([1, 2], [], 3)).toEqual([1, 2])
})

test('a failed save puts its items back in front of anything queued since, seed by seed', () => {
  expect(mergeQueues({ a: [1] }, { a: [2], b: [3] }, 3)).toEqual({ a: [1, 2], b: [3] })
  expect(mergeQueues({ a: [1] }, {}, 3)).toEqual({ a: [1] })
  // Over the cap, the oldest go.
  expect(mergeQueues({ a: [1, 2] }, { a: [3, 4] }, 3)).toEqual({ a: [2, 3, 4] })
})
