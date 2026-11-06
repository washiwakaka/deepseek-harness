// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IdentitySessionSnapshot } from '../src/client/session.ts'
import { AccountChip } from '../src/client/AccountChip.tsx'

type TestView = (props: Record<string, unknown>) => ReactNode
const Chip = AccountChip as never as TestView

afterEach(cleanup)

const t = ((key: string, vars?: Record<string, string>) => {
  if (key === 'chip.signIn') return 'Sign in'
  if (key === 'chip.aria') return 'Account'
  if (key === 'chip.signedIn') return vars?.name ?? ''
  if (key === 'chip.signedInLine') return `${vars?.name ?? ''} · ${vars?.line ?? ''}`
  if (key === 'modal.title') return 'Account'
  if (key === 'modal.close') return 'Close'
  if (key === 'modal.description') return 'Sign in to post to the collaboration room. More sign-in methods can register later.'
  if (key === 'modal.signedDescription') return 'Business lines are independent.'
  if (key === 'tab.login') return 'Sign in'
  if (key === 'tab.register') return 'Register'
  if (key === 'tab.aria') return 'Sign in or register'
  if (key === 'username') return 'Username'
  if (key === 'password') return 'Password'
  if (key === 'name') return 'Display name'
  if (key === 'login') return 'Sign in'
  if (key === 'register') return 'Register'
  if (key === 'logout') return 'Sign out'
  if (key === 'auth.failed') return 'Could not sign in'
  if (key === 'method.password') return 'Username and password'
  if (key === 'oauth.later') return `${vars?.id ?? ''} (coming later)`
  if (key === 'lines.title') return 'Business lines'
  if (key === 'lines.empty') return 'No business lines yet.'
  if (key === 'lines.create') return 'Create business line'
  if (key === 'lines.id') return 'Line id'
  if (key === 'lines.name') return 'Line name'
  if (key === 'lines.active') return 'Active line'
  if (key === 'lines.use') return 'Use this line'
  if (key === 'models.title') return 'Available models'
  if (key === 'models.empty') return 'No connected models in Settings'
  if (key === 'models.hint') return 'Checked models may be @. All checked means this line does not restrict models.'
  if (key === 'manage.failed') return 'Could not save'
  if (key === 'chip.admin') return `${vars?.name ?? ''} (admin)`
  if (key === 'users.title') return 'Users'
  if (key === 'users.empty') return 'No users yet'
  if (key === 'users.none') return 'No business lines'
  if (key === 'users.admin') return 'Admin'
  if (key === 'cap.workspace') return 'Workspace'
  if (key === 'cap.terminal') return 'Terminal'
  if (key === 'cap.mcp') return 'MCP'
  if (key === 'cap.cordis') return 'Cordis'
  if (key === 'sessions.hint') {
    return 'Admins can see every session in the sidebar and can add, rename, or delete workspaces. Check Admin to promote a later user. Check Workspace to let that user add workspaces.'
  }
  return key
}) as never

function snapshot(overrides: Partial<IdentitySessionSnapshot> = {}): IdentitySessionSnapshot {
  return {
    current: undefined,
    methods: [{ id: 'password', kind: 'password' }],
    lines: [],
    models: [],
    accounts: [],
    ...overrides,
  }
}

function actions() {
  return {
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    createLine: vi.fn(async () => {}),
    joinLine: vi.fn(async () => {}),
    leaveLine: vi.fn(async () => {}),
    setLineModels: vi.fn(async () => {}),
    setActiveLine: vi.fn(async () => {}),
    setAccountAdmin: vi.fn(async () => {}),
    setAccountCapabilities: vi.fn(async () => {}),
  }
}

function useIdentity(overrides: Partial<IdentitySessionSnapshot> = {}) {
  const current = snapshot(overrides)
  return (select: (value: IdentitySessionSnapshot) => unknown) => select(current)
}

describe('AccountChip', () => {
  it('opens the sign-in dialog from the sidebar chip', async () => {
    const props = actions()
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity()}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Username and password' }))
    await vi.waitFor(() => {
      expect(props.login).toHaveBeenCalledWith('alice', 'password1')
    })
  })

  it('shows the signed-in name and signs out from the dialog', async () => {
    const props = actions()
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity({
        current: { id: 'alice', name: 'Alice', admin: false, seedAdmin: false, activeLineId: null, memberships: [] },
      })}
    /> as never)
    expect(screen.getByRole('button', { name: 'Alice' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    expect(screen.getAllByText('No business lines yet.').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => {
      expect(props.logout).toHaveBeenCalled()
    })
  })

  it('lists a later oauth method as disabled', () => {
    render(<Chip
      t={t}
      wide
      {...actions()}
      useIdentity={useIdentity({
        methods: [
          { id: 'password', kind: 'password' },
          { id: 'github', kind: 'oauth' },
        ],
      })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('button', { name: 'github (coming later)' })).toHaveProperty('disabled', true)
  })

  it('joins a business line and restricts models on the active line', async () => {
    const props = actions()
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity({
        current: {
          id: 'alice',
          name: 'Alice',
          admin: false,
          seedAdmin: false,
          activeLineId: 'core',
          memberships: [{ lineId: 'core', modelIds: [] }],
        },
        lines: [
          { id: 'core', name: 'Core' },
          { id: 'guest', name: 'Guest' },
        ],
        models: [{ id: 'mock/mock', name: 'mock · Mock' }],
      })}
    /> as never)
    expect(screen.getByRole('button', { name: 'Alice · Core' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alice · Core' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Guest' }))
    await vi.waitFor(() => {
      expect(props.joinLine).toHaveBeenCalledWith('guest')
    })
    expect(screen.getByRole('checkbox', { name: 'mock · Mock' })).toHaveProperty('checked', true)
    expect(screen.queryByRole('form', { name: 'Create business line' })).toBeNull()
  })

  it('creates a line, switches the active line, and materializes a restricted allowlist', async () => {
    const props = actions()
    props.createLine.mockRejectedValueOnce('dup')
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity({
        current: {
          id: 'alice',
          name: 'Alice',
          admin: true,
          seedAdmin: true,
          activeLineId: 'core',
          memberships: [
            { lineId: 'core', modelIds: [] },
            { lineId: 'guest', modelIds: [] },
          ],
        },
        lines: [
          { id: 'core', name: 'Core' },
          { id: 'guest', name: 'Guest' },
        ],
        models: [
          { id: 'mock/mock', name: 'mock · Mock' },
          { id: 'mock/other', name: 'mock · Other' },
        ],
      })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Alice · Core' }))
    expect(screen.getByRole('checkbox', { name: 'mock · Mock' })).toHaveProperty('checked', true)
    expect(screen.getByRole('checkbox', { name: 'mock · Other' })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'mock · Other' }))
    await vi.waitFor(() => {
      expect(props.setLineModels).toHaveBeenCalledWith('core', ['mock/mock'])
    })
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Use this line' })).toHaveProperty('disabled', false)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use this line' }))
    await vi.waitFor(() => {
      expect(props.setActiveLine).toHaveBeenCalledWith('guest')
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Core' }))
    await vi.waitFor(() => {
      expect(props.leaveLine).toHaveBeenCalledWith('core')
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Line id' }), { target: { value: 'ops' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Line name' }), { target: { value: 'Ops' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Create business line' }))
    await vi.waitFor(() => {
      expect(props.createLine).toHaveBeenCalledWith('ops', 'Ops')
      expect(screen.getByRole('status').textContent).toBe('Could not save')
    })
    props.createLine.mockResolvedValueOnce(undefined)
    fireEvent.submit(screen.getByRole('form', { name: 'Create business line' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Line id' })).toHaveProperty('value', '')
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Create business line' }))
  })

  it('writes an unrestricted allowlist when every catalog model is checked', async () => {
    const props = actions()
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity({
        current: {
          id: 'alice',
          name: 'Alice',
          admin: false,
          seedAdmin: false,
          activeLineId: 'core',
          memberships: [{ lineId: 'core', modelIds: ['mock/mock'] }],
        },
        lines: [{ id: 'core', name: 'Core' }],
        models: [
          { id: 'mock/mock', name: 'mock · Mock' },
          { id: 'mock/other', name: 'mock · Other' },
        ],
      })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Alice · Core' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'mock · Other' }))
    await vi.waitFor(() => {
      expect(props.setLineModels).toHaveBeenCalledWith('core', [])
    })
  })

  it('shows a sign-in error and a narrow chip', async () => {
    const props = actions()
    props.login.mockRejectedValueOnce(new Error('nope'))
    render(<Chip t={t} wide={false} {...props} useIdentity={useIdentity()} /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Username and password' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('nope')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  })

  it('lists every account and line for an admin', async () => {
    const props = actions()
    render(<Chip
      t={t}
      wide
      {...props}
      useIdentity={useIdentity({
        current: { id: 'alice', name: 'Alice', admin: true, seedAdmin: true, activeLineId: null, memberships: [] },
        lines: [{ id: 'core', name: 'Core' }],
        accounts: [
          { id: 'alice', name: 'Alice', admin: true, seedAdmin: true, activeLineId: null, memberships: [] },
          { id: 'carol', name: 'Carol', admin: true, seedAdmin: true, activeLineId: null, memberships: [] },
          {
            id: 'bob',
            name: 'Bob',
            admin: false,
            seedAdmin: false,
            capabilities: ['mcp'],
            activeLineId: 'core',
            memberships: [
              { lineId: 'core', modelIds: [] },
              { lineId: 'ops', modelIds: [] },
            ],
          },
        ],
      })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    expect(screen.getAllByText('Alice (admin)').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Users' })).toBeTruthy()
    expect(screen.getByText(
      'Admins can see every session in the sidebar and can add, rename, or delete workspaces. Check Admin to promote a later user. Check Workspace to let that user add workspaces.',
    )).toBeTruthy()
    expect(screen.getAllByText('No business lines').length).toBeGreaterThan(0)
    expect(screen.getByText('Carol (admin)')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getAllByText('Core').length).toBeGreaterThan(0)
    expect(screen.getByText('Core · ops')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox', { name: 'Admin' })
    expect(boxes[0]).toHaveProperty('disabled', true)
    expect(boxes[1]).toHaveProperty('disabled', true)
    fireEvent.click(boxes[2]!)
    await vi.waitFor(() => {
      expect(props.setAccountAdmin).toHaveBeenCalledWith('bob', true)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Terminal' }))
    await vi.waitFor(() => {
      expect(props.setAccountCapabilities).toHaveBeenCalledWith('bob', ['terminal', 'mcp'])
      expect(screen.getByRole('checkbox', { name: 'MCP' })).toHaveProperty('disabled', false)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'MCP' }))
    await vi.waitFor(() => {
      expect(props.setAccountCapabilities).toHaveBeenCalledWith('bob', [])
    })
  })

  it('shows an empty admin user list', () => {
    render(<Chip
      t={t}
      wide
      {...actions()}
      useIdentity={useIdentity({
        current: { id: 'alice', name: 'Alice', admin: true, seedAdmin: true, activeLineId: null, memberships: [] },
      })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    expect(screen.getByText('No users yet')).toBeTruthy()
  })

  it('registers from the register tab', async () => {
    const props = actions()
    render(<Chip t={t} wide {...props} useIdentity={useIdentity()} /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Register' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Alice' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Username and password' }))
    await vi.waitFor(() => {
      expect(props.register).toHaveBeenCalledWith('alice', 'password1', 'Alice')
    })
  })
})
