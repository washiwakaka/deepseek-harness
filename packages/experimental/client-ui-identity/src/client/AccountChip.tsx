import { useState } from 'react'
import {
  Button, Checkbox, IconUserOutlineRegular, Input, Modal, SegmentedTabs,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IdentityAccountView } from '@deepseek-ai/dsh-experimental-api-identity/types'
import type { IdentitySessionSnapshot } from './session.ts'
import { NS, type IdentityUiKey } from './locales.ts'
import css from './AccountChip.module.css'

/** Injected identity session and Host password and line actions. */
export interface AccountChipInjected {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  createLine: (id: string, name: string) => Promise<void>
  joinLine: (lineId: string) => Promise<void>
  leaveLine: (lineId: string) => Promise<void>
  setLineModels: (lineId: string, modelIds: readonly string[]) => Promise<void>
  setActiveLine: (lineId: string | null) => Promise<void>
  setAccountAdmin: (username: string, admin: boolean) => Promise<void>
  hooks: { identity: HostObservable<IdentitySessionSnapshot> }
}

/** Full props of the sidebar account chip. */
export type AccountChipProps =
  PropsRuntime<'sidebar.account'>
  & InjectFace<AccountChipInjected>
  & PropsLocale<typeof NS>

type Copy = (key: IdentityUiKey, vars?: Record<string, string>) => string

/**
 * Next allowlist after toggling one catalog model. Empty means every connected model.
 * @param catalog - Settings mention routes on the panel.
 * @param currentIds - stored allowlist; empty means unrestricted.
 * @param toggled - catalog id the checkbox addressed.
 * @param on - whether that box is becoming checked.
 */
function nextLineModelIds(
  catalog: readonly string[],
  currentIds: readonly string[],
  toggled: string,
  on: boolean,
): readonly string[] {
  const selected = new Set(currentIds.length === 0 ? catalog : currentIds)
  if (on) selected.add(toggled)
  else selected.delete(toggled)
  if (selected.size === 0 || (catalog.length > 0 && catalog.every(id => selected.has(id)))) return []
  return catalog.filter(id => selected.has(id))
}

/**
 * Username/password fields for the password method.
 * @param t - identity dictionary.
 * @param mode - sign-in or register.
 * @param login - Host sign-in.
 * @param registerAccount - Host register then Client sign-in.
 * @param onDone - close the dialog after success.
 */
function PasswordForm({
  t, mode, login, registerAccount, onDone,
}: {
  t: Copy
  mode: 'login' | 'register'
  login: (username: string, password: string) => Promise<void>
  registerAccount: (username: string, password: string, name: string) => Promise<void>
  onDone: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canLogin = username.trim() !== '' && password !== ''
  const canRegister = canLogin && displayName.trim() !== ''
  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void action().then(() => {
      setBusy(false)
      setPassword('')
      onDone()
    }, (reason: unknown) => {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : t('auth.failed'))
    })
  }
  return (
    <form
      className={css.form}
      aria-label={t('method.password')}
      onSubmit={(event) => {
        event.preventDefault()
        if (mode === 'login') {
          run(() => login(username.trim(), password))
          return
        }
        run(() => registerAccount(username.trim(), password, displayName.trim()))
      }}
    >
      <div className={css.fields}>
        <Input
          name="username"
          autoComplete="username"
          placeholder={t('username')}
          aria-label={t('username')}
          value={username}
          disabled={busy}
          data-modal-autofocus=""
          onChange={(event) => { setUsername(event.target.value) }}
        />
        <Input
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={t('password')}
          aria-label={t('password')}
          value={password}
          disabled={busy}
          onChange={(event) => { setPassword(event.target.value) }}
        />
        {mode === 'register' && (
          <Input
            name="name"
            autoComplete="nickname"
            placeholder={t('name')}
            aria-label={t('name')}
            value={displayName}
            disabled={busy}
            onChange={(event) => { setDisplayName(event.target.value) }}
          />
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        disabled={busy || (mode === 'login' ? !canLogin : !canRegister)}
      >
        {mode === 'login' ? t('login') : t('register')}
      </Button>
      {error !== null && <span className={css.error} role="status">{error}</span>}
    </form>
  )
}

/**
 * Signed-in account panel: business lines and per-line models.
 * @param t - identity dictionary.
 * @param current - signed-in account.
 * @param snapshot - Host lines and Settings catalog.
 * @param actions - Host mutations.
 * @param onLogout - sign out then close.
 */
function AccountPanel({
  t, current, snapshot, createLine, joinLine, leaveLine, setLineModels, setActiveLine, setAccountAdmin, onLogout,
}: {
  t: Copy
  current: IdentityAccountView
  snapshot: IdentitySessionSnapshot
  createLine: (id: string, name: string) => Promise<void>
  joinLine: (lineId: string) => Promise<void>
  leaveLine: (lineId: string) => Promise<void>
  setLineModels: (lineId: string, modelIds: readonly string[]) => Promise<void>
  setActiveLine: (lineId: string | null) => Promise<void>
  setAccountAdmin: (username: string, admin: boolean) => Promise<void>
  onLogout: () => void
}) {
  const [lineId, setLineId] = useState('')
  const [lineName, setLineName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void action().then(() => {
      setBusy(false)
    }, (reason: unknown) => {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : t('manage.failed'))
    })
  }
  const membership = current.memberships.find(row => row.lineId === current.activeLineId)
  return (
    <div className={css.signed}>
      <span className={css.who}>
        {current.admin ? t('chip.admin', { name: current.name }) : current.name}
      </span>
      {current.admin && (
        <section className={css.section} aria-label={t('users.title')}>
          <span className={css.heading}>{t('users.title')}</span>
          <span className={css.hint}>{t('sessions.hint')}</span>
          {snapshot.accounts.length === 0
            ? <span className={css.hint}>{t('users.empty')}</span>
            : (
              <ul className={css.list}>
                {snapshot.accounts.map((account) => {
                  const lineNames = account.memberships
                    .map(row => snapshot.lines.find(line => line.id === row.lineId)?.name ?? row.lineId)
                  return (
                    <li key={account.id} className={css.row}>
                      <span>
                        {account.admin ? t('chip.admin', { name: account.name }) : account.name}
                        <span className={css.hint}>
                          {lineNames.length === 0 ? t('users.none') : lineNames.join(' · ')}
                        </span>
                      </span>
                      <Checkbox
                        checked={account.admin}
                        disabled={busy || account.id === current.id || account.seedAdmin}
                        label={t('users.admin')}
                        onChange={(next) => {
                          run(() => setAccountAdmin(account.id, next))
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
        </section>
      )}
      <section className={css.section} aria-label={t('lines.title')}>
        <span className={css.heading}>{t('lines.title')}</span>
        {snapshot.lines.length === 0
          ? <span className={css.hint}>{t('lines.empty')}</span>
          : (
            <ul className={css.list}>
              {snapshot.lines.map((line) => {
                const joined = current.memberships.some(row => row.lineId === line.id)
                const active = current.activeLineId === line.id
                return (
                  <li key={line.id} className={css.row}>
                    <Checkbox
                      checked={joined}
                      disabled={busy}
                      label={line.name}
                      onChange={(next) => {
                        run(() => next ? joinLine(line.id) : leaveLine(line.id))
                      }}
                    />
                    {joined && (
                      <Button
                        variant={active ? 'primary' : 'outline'}
                        disabled={busy || active}
                        onClick={() => { run(() => setActiveLine(line.id)) }}
                      >
                        {active ? t('lines.active') : t('lines.use')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        {current.admin && (
          <form
            className={css.create}
            aria-label={t('lines.create')}
            onSubmit={(event) => {
              event.preventDefault()
              const id = lineId.trim()
              const name = lineName.trim()
              if (id === '' || name === '') return
              run(() => createLine(id, name).then(() => {
                setLineId('')
                setLineName('')
              }))
            }}
          >
            <Input
              name="line-id"
              placeholder={t('lines.id')}
              aria-label={t('lines.id')}
              value={lineId}
              disabled={busy}
              onChange={(event) => { setLineId(event.target.value) }}
            />
            <Input
              name="line-name"
              placeholder={t('lines.name')}
              aria-label={t('lines.name')}
              value={lineName}
              disabled={busy}
              onChange={(event) => { setLineName(event.target.value) }}
            />
            <Button type="submit" variant="outline" disabled={busy || lineId.trim() === '' || lineName.trim() === ''}>
              {t('lines.create')}
            </Button>
          </form>
        )}
      </section>
      <section className={css.section} aria-label={t('models.title')}>
        <span className={css.heading}>{t('models.title')}</span>
        {membership === undefined
          ? <span className={css.hint}>{t('lines.empty')}</span>
          : snapshot.models.length === 0
            ? <span className={css.hint}>{t('models.empty')}</span>
            : (
              <>
                <span className={css.hint}>{t('models.hint')}</span>
                <ul className={css.list}>
                  {snapshot.models.map((model) => {
                    const catalog = snapshot.models.map(row => row.id)
                    const checked = membership.modelIds.length === 0 || membership.modelIds.includes(model.id)
                    return (
                      <li key={model.id}>
                        <Checkbox
                          checked={checked}
                          disabled={busy}
                          label={model.name}
                          onChange={(next) => {
                            run(() => setLineModels(
                              membership.lineId,
                              nextLineModelIds(catalog, membership.modelIds, model.id, next),
                            ))
                          }}
                        />
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
      </section>
      <Button variant="outline" onClick={onLogout}>{t('logout')}</Button>
      {error !== null && <span className={css.error} role="status">{error}</span>}
    </div>
  )
}

/** Sidebar chip above New Session; opens the sign-in or account dialog. */
export function AccountChip({
  t, wide, login, register, logout, createLine, joinLine, leaveLine, setLineModels, setActiveLine, setAccountAdmin, useIdentity,
}: AccountChipProps) {
  const snapshot = useIdentity(value => value)
  const current = snapshot.current
  const methods = snapshot.methods
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const oauth = methods.filter(method => method.kind === 'oauth')
  const hasPassword = methods.some(method => method.kind === 'password')
  const lineName = current === undefined || current.activeLineId === null
    ? undefined
    : snapshot.lines.find(line => line.id === current.activeLineId)?.name
  const label = current === undefined
    ? t('chip.signIn')
    : lineName === undefined
      ? t('chip.signedIn', { name: current.name })
      : t('chip.signedInLine', { name: current.name, line: lineName })
  return (
    <>
      <button
        type="button"
        className={wide ? css.chip : `${css.chip} ${css.narrow}`}
        aria-label={current === undefined ? t('chip.aria') : label}
        onClick={() => { setOpen(true) }}
      >
        <IconUserOutlineRegular size={wide ? 16 : 18} />
        {wide && <span className={css.label}>{label}</span>}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('modal.title')}
        closeLabel={t('modal.close')}
        description={current === undefined ? t('modal.description') : t('modal.signedDescription')}
      >
        {current !== undefined
          ? (
            <AccountPanel
              t={t}
              current={current}
              snapshot={snapshot}
              createLine={createLine}
              joinLine={joinLine}
              leaveLine={leaveLine}
              setLineModels={setLineModels}
              setActiveLine={setActiveLine}
              setAccountAdmin={setAccountAdmin}
              onLogout={() => { void logout().then(() => { setOpen(false) }) }}
            />
          )
          : (
            <>
              <SegmentedTabs
                label={t('tab.aria')}
                size="sm"
                value={mode}
                onChange={setMode}
                items={[
                  { value: 'login', label: t('tab.login'), id: 'identity-tab-login', panelId: 'identity-panel-login' },
                  { value: 'register', label: t('tab.register'), id: 'identity-tab-register', panelId: 'identity-panel-register' },
                ]}
              />
              {hasPassword && (
                <PasswordForm
                  t={t}
                  mode={mode}
                  login={login}
                  registerAccount={register}
                  onDone={() => { setOpen(false) }}
                />
              )}
              {oauth.length > 0 && (
                <div className={css.methods}>
                  {oauth.map(method => (
                    <Button key={method.id} variant="outline" disabled>
                      {t('oauth.later', { id: method.id })}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
      </Modal>
    </>
  )
}
