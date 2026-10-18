import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ISSUES, PROJECT_NUMBER } from './fixture.js'
import {
  fetchIssueNodeId,
  fetchItems,
  fetchProject,
  getToken,
  type Item,
  moveItem,
  type Project,
  runAction,
  setStatus,
  waitForItems,
} from './support.js'

// The inputs that the runner passes for the README usage: organization is omitted and status-name has its default.
const inputs = (overrides: Record<string, string> = {}) => ({
  'project-number': String(PROJECT_NUMBER),
  'status-name': 'Done',
  'github-token': getToken(),
  ...overrides,
})

const findItem = (items: Item[], issueNumber: number): Item => {
  const item = items.find((i) => i.issueNumber === issueNumber)
  if (!item) {
    throw new Error(`Issue #${issueNumber} must be in the fixture project`)
  }
  return item
}

describe('move closed issue to top', () => {
  let project: Project
  let anchor: Item
  let todo: Item
  let done: Item

  beforeAll(async () => {
    project = await fetchProject()
    const items = await fetchItems()
    anchor = findItem(items, ISSUES.anchor)
    todo = findItem(items, ISSUES.todo)
    done = findItem(items, ISSUES.done)
  })

  // Puts the anchor at the top and the issues under test below it.
  beforeEach(async () => {
    await setStatus(project, anchor.id, 'Done')
    await setStatus(project, todo.id, 'Todo')
    await setStatus(project, done.id, 'Done')
    await moveItem(project, anchor.id, null)
    await moveItem(project, todo.id, anchor.id)
    await moveItem(project, done.id, todo.id)
    await waitForItems(
      'the initial state',
      (items) =>
        items.map((i) => i.issueNumber).join() === [ISSUES.anchor, ISSUES.todo, ISSUES.done].join() &&
        findItem(items, ISSUES.todo).status === 'Todo' &&
        findItem(items, ISSUES.done).status === 'Done',
    )
  })

  it('updates the status and moves the issue to the top', async () => {
    const result = await runAction({ number: ISSUES.todo, nodeId: await fetchIssueNodeId(ISSUES.todo) }, inputs())

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Updating status: Todo → Done')
    await waitForItems(
      `#${ISSUES.todo} at the top in Done`,
      (items) => items[0]?.issueNumber === ISSUES.todo && items[0]?.status === 'Done',
    )
  })

  it('moves the issue to the top without updating the status already set', async () => {
    const result = await runAction({ number: ISSUES.done, nodeId: await fetchIssueNodeId(ISSUES.done) }, inputs())

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Updating status')
    await waitForItems(
      `#${ISSUES.done} at the top in Done`,
      (items) => items[0]?.issueNumber === ISSUES.done && items[0]?.status === 'Done',
    )
  })

  it('skips the issue not in the project', async () => {
    const result = await runAction(
      { number: ISSUES.notInProject, nodeId: await fetchIssueNodeId(ISSUES.notInProject) },
      inputs(),
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`Issue #${ISSUES.notInProject} not in project, skipping`)
  })

  it('fails when the status does not exist', async () => {
    const result = await runAction(
      { number: ISSUES.todo, nodeId: await fetchIssueNodeId(ISSUES.todo) },
      inputs({ 'status-name': 'No such status' }),
    )

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Status option "No such status" not found')
  })

  it('fails when the project does not exist', async () => {
    const result = await runAction(
      { number: ISSUES.todo, nodeId: await fetchIssueNodeId(ISSUES.todo) },
      inputs({ 'project-number': '99999' }),
    )

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Project #99999 not found')
  })
})
