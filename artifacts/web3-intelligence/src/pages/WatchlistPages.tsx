import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Activity, AlertTriangle, Check,
  ChevronRight, CircleAlert, Clock3, Database, ExternalLink, Eye, LoaderCircle,
  LockKeyhole, Plus, RefreshCw, Shield, Trash2, Wallet,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetWalletWatchActivityQueryKey,
  getListAdminUsersQueryKey, getListAdminWalletWatchesQueryKey, getListWalletWatchesQueryKey,
  useCreateWalletWatch, useDeleteAdminWalletWatch, useDeleteWalletWatch,
  useGetCurrentUser, useGetWalletWatchActivity, useListAdminUsers,
  useListAdminWalletWatches, useListWalletWatches, useUpdateAdminUser,
} from '@workspace/api-client-react';
import type { AdminUserRole, AdminUserStatus, WalletWatchNetwork } from '@workspace/api-client-react';

const networks: WalletWatchNetwork[] = ['ethereum', 'polygon', 'avalanche', 'solana'];

function displayDate(value?: string | null) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function compactAddress(value: string) {
  return value.length > 26 ? `${value.slice(0, 12)}…${value.slice(-9)}` : value;
}

function SectionHeading({ overline, title, copy }: { overline: string; title: string; copy?: string }) {
  return <div className="watch-heading">
    <div className="watch-overline">{overline}</div>
    <h1>{title}</h1>
    {copy && <p>{copy}</p>}
  </div>;
}

function PublicDataBoundary({ compact = false }: { compact?: boolean }) {
  return <aside className={`watch-boundary ${compact ? 'compact' : ''}`} data-testid="notice-public-data-limitations">
    <span className="boundary-icon"><AlertTriangle size={15} /></span>
    <div>
      <strong>Public RPC coverage is partial</strong>
      <p>Transfer events are not a complete wallet history. This feed does not reliably identify buys or sells, NFTs, or staking activity. A missing event is not proof that nothing happened.</p>
    </div>
    {!compact && <span className="boundary-readonly"><LockKeyhole size={12} /> READ ONLY</span>}
  </aside>;
}

function QueryError({ message, retry, testId }: { message: string; retry: () => void; testId: string }) {
  return <div className="watch-error" role="alert" data-testid={testId}>
    <CircleAlert size={17} /><span>{message}</span>
    <button type="button" onClick={retry} data-testid={`${testId}-retry`}>Retry</button>
  </div>;
}

function WatchlistLoading() {
  return <div className="watch-skeleton-list" role="status" aria-label="Loading watchlist" data-testid="status-watchlist-loading">
    {[0, 1, 2].map((item) => <div className="watch-skeleton" key={item}><i /><span /><b /></div>)}
  </div>;
}

export function WatchlistPage() {
  const queryClient = useQueryClient();
  const watches = useListWalletWatches();
  const createWatch = useCreateWalletWatch();
  const deleteWatch = useDeleteWalletWatch();
  const [network, setNetwork] = useState<WalletWatchNetwork>('ethereum');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    createWatch.mutate({
      data: { network, address: address.trim(), label: label.trim(), alertsEnabled },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListWalletWatchesQueryKey() });
        setAddress('');
        setLabel('');
        setAlertsEnabled(false);
      },
      onError: () => setFormError('The watch could not be added. Check the address and try again.'),
    });
  };

  const removeWatch = (watchId: number, watchLabel: string) => {
    if (!window.confirm(`Remove “${watchLabel}” from your watchlist?`)) return;
    deleteWatch.mutate({ params: { watchId } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWalletWatchesQueryKey() }),
    });
  };

  const rows = watches.data ?? [];
  return <div className="content watch-content">
    <SectionHeading overline="PERSONAL MONITOR / 01" title="Your watchlist" copy="Keep public addresses close. Each watch opens a provider-backed view of recent observable transfers." />
    <div className="watchlist-topline">
      <div className="watchlist-count" data-testid="text-watch-count"><span>{watches.isLoading ? '—' : rows.length.toString().padStart(2, '0')}</span><small>ADDRESSES WATCHED</small></div>
      <div className="watchlist-mode"><span className="mode-dot" /> PRIVATE TO YOUR ACCOUNT <span className="mode-separator">/</span> PUBLIC CHAIN DATA</div>
    </div>
    <PublicDataBoundary />
    <div className="watch-layout">
      <section className="panel watch-list-panel">
        <div className="watch-panel-head">
          <div><div className="watch-section-title">Tracked addresses</div><div className="watch-section-sub">Manage labels and open an address activity view</div></div>
          <span className="watch-panel-index">WATCHES / {rows.length.toString().padStart(2, '0')}</span>
        </div>
        {watches.isLoading ? <WatchlistLoading /> : watches.isError ?
          <QueryError message="Your watchlist could not be loaded." retry={() => watches.refetch()} testId="status-watchlist-error" /> :
          rows.length === 0 ? <div className="watch-empty" data-testid="empty-wallet-watchlist">
            <div className="watch-empty-mark"><Wallet size={19} /></div><strong>No watched addresses</strong>
            <p>Add a public address to begin a limited, read-only activity view. No wallet connection is required.</p>
          </div> :
          <div className="watch-rows">
            {rows.map((watch) => <article className="watch-row" key={watch.id} data-testid={`card-watch-${watch.id}`}>
              <div className="watch-network-mark" data-network={watch.network}>{watch.network.slice(0, 2).toUpperCase()}</div>
              <div className="watch-row-main">
                <Link href={`/watchlist/${watch.id}`} className="watch-label" data-testid={`link-watch-detail-${watch.id}`}>{watch.label}<ChevronRight size={14} /></Link>
                <span className="watch-address mono" data-testid={`text-watch-address-${watch.id}`}>{compactAddress(watch.address)}</span>
              </div>
              <div className="watch-row-meta"><span className="network-tag" data-testid={`text-watch-network-${watch.id}`}>{watch.network}</span><small><Clock3 size={11} />{displayDate(watch.lastCheckedAt)}</small></div>
              <div className="watch-row-actions">
                <Link href={`/watchlist/${watch.id}`} className="watch-icon-button" aria-label={`View activity for ${watch.label}`} data-testid={`button-open-watch-${watch.id}`}><Eye size={15} /></Link>
                <button type="button" className="watch-icon-button danger" aria-label={`Remove ${watch.label}`} onClick={() => removeWatch(watch.id, watch.label)} disabled={deleteWatch.isPending} data-testid={`button-delete-watch-${watch.id}`}><Trash2 size={15} /></button>
              </div>
            </article>)}
          </div>}
        {rows.length > 0 && !watches.isLoading && <div className="watch-list-foot"><span>{rows.length} {rows.length === 1 ? 'address' : 'addresses'} in your watchlist</span><span>Updated on demand by the public RPC provider</span></div>}
      </section>

      <aside className="panel add-watch-panel">
        <div className="add-watch-symbol"><Plus size={17} /></div>
        <div className="watch-section-title">Add an address</div>
        <p className="watch-form-copy">Track a public wallet address. A label is only for your own reference.</p>
        <form className="watch-form" onSubmit={submit} data-testid="form-create-watch">
          <label className="watch-field"><span>NETWORK</span>
            <select value={network} onChange={(event) => setNetwork(event.target.value as WalletWatchNetwork)} data-testid="select-watch-network">
              {networks.map((item) => <option value={item} key={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
            </select>
          </label>
          <label className="watch-field"><span>PUBLIC ADDRESS</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={128} required placeholder="Paste a public wallet address" autoComplete="off" data-testid="input-watch-address" />
          </label>
          <label className="watch-field"><span>LABEL</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required placeholder="e.g. Treasury address" data-testid="input-watch-label" />
          </label>
          <label className="watch-checkbox"><input type="checkbox" checked={alertsEnabled} onChange={(event) => setAlertsEnabled(event.target.checked)} data-testid="checkbox-watch-alerts" /><span><strong>Enable watch alerts</strong><small>Availability depends on connected notification services.</small></span></label>
          {formError && <div className="watch-inline-error" role="alert" data-testid="status-create-watch-error">{formError}</div>}
          <button className="primary-button watch-submit" type="submit" disabled={createWatch.isPending || !address.trim() || !label.trim()} data-testid="button-submit-watch">
            {createWatch.isPending ? <LoaderCircle className="spin-icon" /> : <Plus />} {createWatch.isPending ? 'Adding address' : 'Add to watchlist'}
          </button>
        </form>
        <div className="watch-safe-note"><Shield size={14} /><span>No private keys, seed phrases, signatures, or transactions are requested.</span></div>
      </aside>
    </div>
  </div>;
}

export function WatchlistDetailPage() {
  const params = useParams<{ watchId: string }>();
  const watchId = Number(params.watchId);
  const validId = Number.isInteger(watchId) && watchId > 0;
  const watches = useListWalletWatches();
  const activityParams = { watchId, limit: 50 };
  const activity = useGetWalletWatchActivity(activityParams, {
    query: {
      enabled: validId,
      queryKey: getGetWalletWatchActivityQueryKey(activityParams),
      refetchInterval: 60_000,
    },
  });
  const watch = watches.data?.find((item) => item.id === watchId);

  if (!validId) return <div className="content watch-content"><QueryError message="This watch address could not be found." retry={() => watches.refetch()} testId="status-watch-not-found" /></div>;
  if (watches.isLoading) return <div className="content watch-content"><WatchlistLoading /></div>;
  if (watches.isError) return <div className="content watch-content"><QueryError message="Your watchlist could not be loaded." retry={() => watches.refetch()} testId="status-watchlist-error" /></div>;
  if (!watch) return <div className="content watch-content"><div className="panel watch-not-found">
    <div className="watch-overline">WATCH / NOT FOUND</div><h1>This address is not on your watchlist.</h1>
    <p>Activity pages are available only for addresses in your own account watchlist.</p>
    <Link href="/watchlist" className="subtle-button" data-testid="link-return-watchlist"><ArrowLeft /> Return to watchlist</Link>
  </div></div>;

  const items = activity.data?.items ?? [];
  return <div className="content watch-content">
    <Link href="/watchlist" className="watch-back-link" data-testid="link-back-watchlist"><ArrowLeft size={14} /> ALL WATCHES</Link>
    <div className="detail-heading">
      <div>
        <div className="watch-overline">PUBLIC WALLET / ACTIVITY</div>
        <h1 data-testid="text-activity-wallet-label">{watch.label}</h1>
        <div className="detail-address"><span className="network-tag">{watch.network}</span><code data-testid="text-activity-wallet-address">{watch.address}</code></div>
      </div>
      <button className="subtle-button" type="button" onClick={() => activity.refetch()} disabled={activity.isFetching} data-testid="button-refresh-activity">
        <RefreshCw className={activity.isFetching ? 'spin-icon' : ''} size={13} /> {activity.isFetching ? 'Checking' : 'Refresh'}
      </button>
    </div>
    <PublicDataBoundary />
    <section className="panel activity-panel">
      <div className="watch-panel-head activity-panel-head">
        <div><div className="watch-section-title">Observed transfers</div><div className="watch-section-sub">{activity.data?.source ?? 'Public RPC source'} · refreshed {displayDate(activity.data?.checkedAt)}</div></div>
        <span className="watch-panel-index"><Activity size={12} /> {items.length.toString().padStart(2, '0')} EVENTS</span>
      </div>
      {activity.isLoading ? <div className="watch-skeleton-list" role="status" aria-label="Loading wallet activity" data-testid="status-activity-loading">
        {[0, 1, 2, 3].map((index) => <div className="activity-skeleton" key={index}><i /><span /><b /></div>)}
      </div> : activity.isError ?
        <QueryError message="Recent activity is unavailable from the public RPC provider." retry={() => activity.refetch()} testId="status-activity-error" /> :
        items.length === 0 ? <div className="watch-empty activity-empty" data-testid="empty-wallet-activity">
          <div className="watch-empty-mark"><Database size={18} /></div><strong>No observable transfers returned</strong>
          <p>This does not establish that the wallet has no activity. Public RPC indexing and network coverage can be incomplete.</p>
        </div> :
        <div className="activity-table-scroll"><table className="activity-table">
          <thead><tr><th>Direction</th><th>Asset / type</th><th>Amount</th><th>Counterparty</th><th>Block</th><th>Observed</th><th></th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id} data-testid={`row-activity-${item.id}`}>
            <td><span className={`direction-pill direction-${item.direction}`} data-testid={`text-activity-direction-${item.id}`}>
              {item.direction === 'in' ? <ArrowDownLeft size={12} /> : item.direction === 'out' ? <ArrowUpRight size={12} /> : <Activity size={12} />}
              {item.direction === 'in' ? 'INBOUND' : item.direction === 'out' ? 'OUTBOUND' : 'CHANGE'}
            </span></td>
            <td><strong className="activity-asset">{item.asset}</strong><small>{item.activityType === 'token_transfer' ? 'TOKEN TRANSFER' : 'NATIVE TRANSFER'}</small></td>
            <td className="mono activity-amount">{item.amount}</td>
            <td className="mono activity-counterparty">{item.counterparty ? compactAddress(item.counterparty) : '—'}</td>
            <td className="mono">{item.blockNumber ?? '—'}</td>
            <td className="activity-time">{displayDate(item.occurredAt)}</td>
            <td><a className="explorer-link" href={item.explorerUrl} target="_blank" rel="noreferrer" aria-label={`Open transaction ${compactAddress(item.txHash)} in explorer`} data-testid={`link-explorer-activity-${item.id}`}><ExternalLink size={13} /></a></td>
          </tr>)}</tbody>
        </table></div>}
      {activity.data?.notice && <div className="activity-notice" data-testid="text-activity-provider-notice"><CircleAlert size={13} />{activity.data.notice}</div>}
      <div className="watch-list-foot"><span>Provider: {activity.data?.source ?? 'Unavailable'}</span><span>Checked {displayDate(activity.data?.checkedAt)}</span></div>
    </section>
  </div>;
}

type UserDraft = { role: AdminUserRole; status: AdminUserStatus };

export function AdminPage() {
  const queryClient = useQueryClient();
  const currentUser = useGetCurrentUser();
  const isAdmin = currentUser.data?.role === 'admin' && currentUser.data.status === 'active';
  const users = useListAdminUsers({ query: { enabled: isAdmin, queryKey: getListAdminUsersQueryKey() } });
  const watches = useListAdminWalletWatches({ query: { enabled: isAdmin, queryKey: getListAdminWalletWatchesQueryKey() } });
  const updateUser = useUpdateAdminUser();
  const deleteWatch = useDeleteAdminWalletWatch();
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [search, setSearch] = useState('');

  const visibleUsers = useMemo(() => (users.data ?? []).filter((user) => user.clerkUserId.toLowerCase().includes(search.toLowerCase())), [users.data, search]);
  const saveUser = (clerkUserId: string, current: UserDraft) => {
    updateUser.mutate({ clerkUserId, data: current }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListWalletWatchesQueryKey() }),
        ]);
        setDrafts((previous) => { const next = { ...previous }; delete next[clerkUserId]; return next; });
      },
    });
  };
  const removeAdminWatch = (watchId: number, label: string) => {
    if (!window.confirm(`Remove “${label}” from its owner's watchlist?`)) return;
    deleteWatch.mutate({ params: { watchId } }, {
      onSuccess: () => Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminWalletWatchesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListWalletWatchesQueryKey() }),
      ]),
    });
  };

  if (currentUser.isLoading) return <div className="content watch-content"><div className="panel watch-admin-gate" role="status" data-testid="status-admin-check"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-value" /></div></div>;
  if (currentUser.isError) return <div className="content watch-content"><QueryError message="Your account role could not be verified." retry={() => currentUser.refetch()} testId="status-admin-account-error" /></div>;
  if (!isAdmin) return <div className="content watch-content"><div className="panel watch-admin-gate" data-testid="status-admin-forbidden">
    <div className="watch-empty-mark"><LockKeyhole size={19} /></div><div className="watch-overline">RESTRICTED / ADMINISTRATORS</div>
    <h1>Administrative access required.</h1><p>This account does not have an active administrator role. The admin API remains the authority for every management action.</p>
    <Link href="/watchlist" className="subtle-button" data-testid="link-admin-return-watchlist"><ArrowLeft /> Back to watchlist</Link>
  </div></div>;

  const allWatches = watches.data ?? [];
  return <div className="content watch-content">
    <SectionHeading overline="CONTROL ROOM / 04" title="Administration" copy="Manage application access and remove watch records across accounts. Every change is applied through the protected admin API." />
    <div className="admin-banner"><Shield size={16} /><span><strong>Administrator session verified</strong><small>Account-level actions are audited by the service.</small></span><span className="admin-role-tag">{currentUser.data.role}</span></div>
    <PublicDataBoundary compact />
    <div className="admin-metrics">
      <div><span>ACCOUNTS</span><strong data-testid="text-admin-user-count">{users.data?.length ?? '—'}</strong></div>
      <div><span>WATCH RECORDS</span><strong data-testid="text-admin-watch-count">{allWatches.length || (watches.isLoading ? '—' : '0')}</strong></div>
      <div><span>YOUR ROLE</span><strong data-testid="text-admin-current-role">{currentUser.data.role}</strong></div>
    </div>
    <section className="panel admin-table-panel">
      <div className="watch-panel-head admin-panel-head">
        <div><div className="watch-section-title">Account access</div><div className="watch-section-sub">Adjust role and account status</div></div>
        <label className="admin-search"><Eye size={13} /><input aria-label="Search account IDs" placeholder="Filter by account ID" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-admin-user-search" /></label>
      </div>
      {users.isLoading ? <div className="watch-skeleton-list" role="status" data-testid="status-admin-users-loading">{[0, 1, 2].map((i) => <div className="watch-skeleton" key={i}><i /><span /><b /></div>)}</div> :
        users.isError ? <QueryError message="Account records could not be loaded." retry={() => users.refetch()} testId="status-admin-users-error" /> :
          visibleUsers.length === 0 ? <div className="admin-empty" data-testid="empty-admin-users">{users.data?.length ? 'No account IDs match this filter.' : 'No account records are available.'}</div> :
            <div className="admin-table-scroll"><table className="admin-table">
              <thead><tr><th>Account ID</th><th>Role</th><th>Status</th><th>Watches</th><th>Created</th><th></th></tr></thead>
              <tbody>{visibleUsers.map((user) => {
                const current = drafts[user.clerkUserId] ?? { role: user.role, status: user.status };
                const changed = current.role !== user.role || current.status !== user.status;
                return <tr key={user.clerkUserId} data-testid={`row-admin-user-${user.clerkUserId}`}>
                  <td className="admin-id mono" data-testid={`text-admin-user-id-${user.clerkUserId}`}>{user.clerkUserId}</td>
                  <td><select value={current.role} onChange={(event) => setDrafts((prev) => ({ ...prev, [user.clerkUserId]: { ...current, role: event.target.value as AdminUserRole } }))} aria-label={`Role for ${user.clerkUserId}`} data-testid={`select-admin-role-${user.clerkUserId}`}>
                    <option value="user">User</option><option value="investigator">Investigator</option><option value="admin">Admin</option>
                  </select></td>
                  <td><select value={current.status} onChange={(event) => setDrafts((prev) => ({ ...prev, [user.clerkUserId]: { ...current, status: event.target.value as AdminUserStatus } }))} aria-label={`Status for ${user.clerkUserId}`} data-testid={`select-admin-status-${user.clerkUserId}`}>
                    <option value="active">Active</option><option value="suspended">Suspended</option>
                  </select></td>
                  <td className="mono">{user.trackedWalletCount}</td><td>{displayDate(user.createdAt)}</td>
                  <td><button type="button" className="watch-save-button" disabled={!changed || updateUser.isPending} onClick={() => saveUser(user.clerkUserId, current)} data-testid={`button-save-admin-user-${user.clerkUserId}`}>{updateUser.isPending ? <LoaderCircle size={13} /> : <Check size={13} />} Save</button></td>
                </tr>;
              })}</tbody>
            </table></div>}
    </section>
    <section className="panel admin-table-panel admin-watch-panel">
      <div className="watch-panel-head">
        <div><div className="watch-section-title">Wallet watch records</div><div className="watch-section-sub">Remove a record from its owning account</div></div>
        <span className="watch-panel-index">ALL ACCOUNTS / {allWatches.length.toString().padStart(2, '0')}</span>
      </div>
      {watches.isLoading ? <div className="watch-skeleton-list" role="status" data-testid="status-admin-watches-loading">{[0, 1, 2].map((i) => <div className="watch-skeleton" key={i}><i /><span /><b /></div>)}</div> :
        watches.isError ? <QueryError message="Wallet watch records could not be loaded." retry={() => watches.refetch()} testId="status-admin-watches-error" /> :
          allWatches.length === 0 ? <div className="admin-empty" data-testid="empty-admin-watches">No wallet watch records are available.</div> :
            <div className="admin-table-scroll"><table className="admin-table admin-wallet-table">
              <thead><tr><th>Label / address</th><th>Network</th><th>Owner account</th><th>Alerts</th><th>Last checked</th><th></th></tr></thead>
              <tbody>{allWatches.map((watch) => <tr key={watch.id} data-testid={`row-admin-watch-${watch.id}`}>
                <td><strong>{watch.label}</strong><small className="admin-address mono" data-testid={`text-admin-watch-address-${watch.id}`}>{compactAddress(watch.address)}</small></td>
                <td><span className="network-tag">{watch.network}</span></td><td className="admin-id mono">{watch.clerkUserId}</td>
                <td>{watch.alertsEnabled ? 'Enabled' : 'Off'}</td><td>{displayDate(watch.lastCheckedAt)}</td>
                <td><button type="button" className="watch-icon-button danger" aria-label={`Remove ${watch.label}`} disabled={deleteWatch.isPending} onClick={() => removeAdminWatch(watch.id, watch.label)} data-testid={`button-admin-delete-watch-${watch.id}`}><Trash2 size={14} /></button></td>
              </tr>)}</tbody>
            </table></div>}
    </section>
  </div>;
}
