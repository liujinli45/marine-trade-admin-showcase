import assert from 'node:assert/strict'
import test from 'node:test'

import { findSecretMatches, isForbiddenTrackedPath } from './secret-scan.mjs'

test('blocks runtime configuration, backups, release files and private key containers', () => {
  for (const file of [
    '.env.production',
    'apps/site/.env.local',
    '.runtime/generated.env',
    'backups/latest/manifest.json',
    'release-artifacts/platform.tar.gz',
    'deploy/server.pem',
    'deploy/signing.p12',
  ]) {
    assert.equal(isForbiddenTrackedPath(file), true, file)
  }
})

test('allows documented example environments and ordinary source files', () => {
  for (const file of [
    '.env.example',
    '.env.production.example',
    'apps/site/.env.test.example',
    'src/config.js',
  ]) {
    assert.equal(isForbiddenTrackedPath(file), false, file)
  }
})

test('detects common credential formats without flagging placeholders', () => {
  assert.deepEqual(findSecretMatches(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')), ['private key'])
  assert.deepEqual(findSecretMatches(`token=ghp_${'a'.repeat(30)}`), ['GitHub token'])
  assert.deepEqual(findSecretMatches(`key=AKIA${'A'.repeat(16)}`), ['AWS access key'])
  assert.deepEqual(findSecretMatches(`OPENAI_API_KEY=sk-proj-${'x'.repeat(24)}`), [
    'OpenAI API key',
  ])
  assert.deepEqual(findSecretMatches('JWT_SECRET=replace-with-a-random-secret'), [])
})
