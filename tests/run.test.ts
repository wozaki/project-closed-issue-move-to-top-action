import type { Octokit } from '@octokit/action'
import type { IssuesEvent } from '@octokit/webhooks-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../src/github.js'
import { run } from '../src/run.js'

describe('run', () => {
  let mockOctokit: Octokit
  let mockContext: Context
  let graphqlMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    graphqlMock = vi.fn()
    mockOctokit = {
      graphql: graphqlMock,
    } as unknown as Octokit

    mockContext = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      sha: 'abc123',
      payload: {
        action: 'closed',
        issue: {
          node_id: 'I_kwDOABCDEF',
          number: 1,
          title: 'Test Issue',
          state: 'closed',
        },
      } as IssuesEvent,
    }
  })

  // Helper functions to reduce boilerplate
  const mockProjectId = () =>
    graphqlMock.mockResolvedValueOnce({
      organization: { projectV2: { id: 'PVT_project123' } },
    })

  const mockIssueInProject = (status: string) =>
    graphqlMock.mockResolvedValueOnce({
      node: {
        projectItems: {
          nodes: [
            {
              id: 'PVTI_item123',
              project: { id: 'PVT_project123' },
              fieldValueByName: { name: status },
            },
          ],
        },
      },
    })

  const mockStatusField = () =>
    graphqlMock.mockResolvedValueOnce({
      node: {
        field: {
          id: 'PVTF_field123',
          name: 'Status',
          options: [{ id: 'PVTFO_done123', name: 'Done' }],
        },
      },
    })

  const mockUpdateStatus = () =>
    graphqlMock.mockResolvedValueOnce({
      updateProjectV2ItemFieldValue: {
        projectV2Item: { id: 'PVTI_item123' },
      },
    })

  const mockMoveToTop = () =>
    graphqlMock.mockResolvedValueOnce({
      updateProjectV2ItemPosition: {
        items: { nodes: [{ id: 'PVTI_item123' }] },
      },
    })

  it('should update status and move issue to top of column', async () => {
    mockProjectId()
    mockIssueInProject('In Progress')
    mockStatusField()
    mockUpdateStatus()
    mockMoveToTop()

    await run({ projectNumber: 1, organization: 'test-org', statusName: 'Done' }, mockOctokit, mockContext)

    expect(graphqlMock).toHaveBeenCalledTimes(5)
  })

  it('should skip status update when already in correct status', async () => {
    mockProjectId()
    mockIssueInProject('Done')
    mockMoveToTop()

    await run({ projectNumber: 1, organization: 'test-org', statusName: 'Done' }, mockOctokit, mockContext)

    expect(graphqlMock).toHaveBeenCalledTimes(3)
  })

  it('should skip when issue is not in project', async () => {
    mockProjectId()
    graphqlMock.mockResolvedValueOnce({
      node: { projectItems: { nodes: [] } },
    })

    await run({ projectNumber: 1, organization: 'test-org', statusName: 'Done' }, mockOctokit, mockContext)

    expect(graphqlMock).toHaveBeenCalledTimes(2)
  })

  it('should handle errors gracefully', async () => {
    // Project not found
    graphqlMock.mockResolvedValueOnce({
      organization: null,
      user: null,
    })

    await expect(
      run({ projectNumber: 999, organization: 'nonexistent', statusName: 'Done' }, mockOctokit, mockContext),
    ).rejects.toThrow('Project #999 not found')

    // Issue node ID not available
    const contextWithoutIssue = {
      ...mockContext,
      payload: {
        action: 'opened',
        issue: { node_id: undefined, number: 1, title: 'Test', state: 'open' },
      } as unknown as IssuesEvent,
    }

    await expect(
      run({ projectNumber: 1, organization: 'test-org', statusName: 'Done' }, mockOctokit, contextWithoutIssue),
    ).rejects.toThrow('Issue node ID is not available')
  })
})
