import assert from 'node:assert/strict'
import test from 'node:test'
import { Room } from '../game.js'

function roomWithPlayers(t, playerCount, rounds) {
  // These tests exercise turn progression without calling a live image model.
  const imageApiUrl = process.env.IMAGE_API_URL
  process.env.IMAGE_API_URL = ''
  const room = new Room('rounds-test')
  t.after(() => {
    room.dispose()
    if (imageApiUrl === undefined) delete process.env.IMAGE_API_URL
    else process.env.IMAGE_API_URL = imageApiUrl
  })
  const players = Array.from({ length: playerCount }, (_, index) => `player-${index}`)
  for (const id of players) room.join({ send() {} }, id)
  room.handle(players[0], { type: 'settings', settings: { rounds, promptSeconds: 30, guessSeconds: 30 } })
  room.handle(players[0], { type: 'start' })
  return { room, players }
}

for (const [playerCount, rounds] of [[2, 3], [2, 4], [2, 5], [2, 6], [2, 8], [2, 10], [12, 3]]) {
  test(`${playerCount} players complete exactly ${rounds} selected rounds`, (t) => {
    const { room, players } = roomWithPlayers(t, playerCount, rounds)
    for (let round = 1; round <= rounds; round++) {
      for (const id of players) {
        const state = room.view(id)
        assert.equal(state.phase, 'play', 'do not reveal before the selected final round')
        assert.equal(state.play.turn, round)
        assert.equal(state.play.turns, rounds)
        assert.equal(state.play.submitted, null, 'clear submissions for each round')
        assert.equal(state.play.task.kind, round === 1 ? 'prompt' : 'guess')
        room.handle(id, { type: 'submit', text: `${id} round ${round}` })
      }
    }

    assert.equal(room.phase, 'reveal')
    for (const chain of room.game.chains) {
      assert.equal(chain.steps.length, rounds * 2 - 1)
      assert.equal(chain.steps[0].text, `${chain.ownerId} round 1`)
      assert.equal(chain.steps.at(-1).kind, 'guess')
      const texts = chain.steps.filter((step) => step.kind !== 'image')
      assert.equal(texts.length, rounds)
      for (let turn = 0; turn < rounds; turn++) {
        assert.ok(texts[turn].text.endsWith(`round ${turn + 1}`))
        if (turn > 0) assert.notEqual(texts[turn].playerId, texts[turn - 1].playerId)
      }
    }
    const reveal = room.view(players[0]).reveal
    assert.equal(reveal.total, rounds * 2 - 1)
    assert.equal(reveal.steps.length, 1, 'keep later chain steps hidden until revealed')
  })
}

test('timed-out rounds continue past the player count and retain each round’s draft', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { room, players } = roomWithPlayers(t, 2, 3)
  for (let round = 1; round <= 3; round++) {
    assert.equal(room.phase, 'play')
    room.handle(players[0], { type: 'draft', text: `draft round ${round}` })
    t.mock.timers.tick(31_000)
  }
  assert.equal(room.phase, 'reveal')
  const texts = room.game.chains.flatMap((chain) => chain.steps.filter((step) => step.kind !== 'image'))
  assert.deepEqual(texts.filter((step) => step.playerId === players[0]).map((step) => step.text).sort(), [
    'draft round 1', 'draft round 2', 'draft round 3',
  ])
  assert.equal(texts.filter((step) => step.text === '(ran out of time)').length, 3)
})
