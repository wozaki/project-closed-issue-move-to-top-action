import * as assert from 'node:assert'
import * as fs from 'node:fs/promises'
import { Octokit } from '@octokit/action'
import { retry } from '@octokit/plugin-retry'
import type { WebhookEvent } from '@octokit/webhooks-types'

export const getOctokit = (token?: string) => {
  const OctokitWithRetry = Octokit.plugin(retry)
  return token ? new OctokitWithRetry({ auth: token }) : new OctokitWithRetry()
}

export type Context = {
  repo: {
    owner: string
    repo: string
  }
  sha: string
  payload: WebhookEvent
}

export const getContext = async (): Promise<Context> => {
  // https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables
  return {
    repo: getRepo(),
    sha: getEnv('GITHUB_SHA'),
    payload: JSON.parse(await fs.readFile(getEnv('GITHUB_EVENT_PATH'), 'utf-8')) as WebhookEvent,
  }
}

const getRepo = () => {
  const [owner, repo] = getEnv('GITHUB_REPOSITORY').split('/')
  assert.ok(owner, 'GITHUB_REPOSITORY must have an owner part')
  assert.ok(repo, 'GITHUB_REPOSITORY must have a repo part')
  return { owner, repo }
}

const getEnv = (name: string): string => {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return value
}
