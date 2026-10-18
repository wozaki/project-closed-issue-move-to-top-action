import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOctokit } from '../src/github.js'

describe('getOctokit', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should authenticate with the given token without GITHUB_TOKEN', async () => {
    // The runner sets GITHUB_ACTION but not GITHUB_TOKEN when the token is given by the github-token input.
    vi.stubEnv('GITHUB_ACTION', 'test')
    vi.stubEnv('GITHUB_TOKEN', undefined)

    const octokit = getOctokit('test-token')

    await expect(octokit.auth()).resolves.toMatchObject({ type: 'token', token: 'test-token' })
  })
})
