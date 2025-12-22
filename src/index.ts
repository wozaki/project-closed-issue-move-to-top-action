import * as core from '@actions/core'
import { getContext, getOctokit } from './github.js'
import { run } from './run.js'

try {
  const githubToken = core.getInput('github-token', { required: true })
  const projectNumberInput = core.getInput('project-number', { required: true })
  const projectNumber = Number(projectNumberInput)
  if (Number.isNaN(projectNumber) || projectNumber <= 0 || !Number.isInteger(projectNumber)) {
    throw new Error(`project-number must be a positive integer, got: ${projectNumberInput}`)
  }

  const inputs = {
    projectNumber,
    organization: core.getInput('organization', { required: true }),
    statusName: core.getInput('status-name', { required: false }) || 'Done',
  }
  await run(inputs, getOctokit(githubToken), await getContext())
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
