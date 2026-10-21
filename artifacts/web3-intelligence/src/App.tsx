import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Blocks, Bot,
  ChevronRight, CircleAlert, Clock3, Database, ExternalLink, Eye,
  Gauge, Layers3, LoaderCircle, LockKeyhole, Search,
  Send, ShieldCheck, Sparkles, Wallet, Waves,
} from 'lucide-react';
import {
  useAskIntelligence, useGetMarketCoins, useGetMarketHistory, useGetMarketOverview,
  useScanWallet,
} from '@workspace/api-client-react';
import { getGetMarketHistoryQueryKey } from '@workspace/api-client-react';
import './index.css';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#39c8f2',
    colorForeground: '#e9f2ff',
    colorMutedForeground: '#9aa9bf',
    colorDanger: '#ef7f92',
    colorBackground: '#111a29',
    colorInput: '#0d1522',
    colorInputForeground: '#e9f2ff',
    colorNeutral: '#34435a',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#111a29] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#29384e]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#edf5ff] font-semibold',
    headerSubtitle: 'text-[#9aa9bf]',
    socialButtonsBlockButtonText: 'text-[#e9f2ff] font-medium',
    formFieldLabel: 'text-[#bdc9d9]',
    footerActionLink: 'text-[#55d3f5] hover:text-[#a4efff]',
    footerActionText: 'text-[#9aa9bf]',
    dividerText: 'text-[#8797ae]',
    identityPreviewEditButton: 'text-[#55d3f5]',
    formFieldSuccessText: 'text-[#5ed6b1]',
    alertText: 'text-[#ffc0c8]',
    logoBox: 'mb-2',
    logoImage: 'h-9 w-auto',
    socialButtonsBlockButton: 'border border-[#34435a] bg-[#151f30] hover:bg-[#1a2940]',
    formButtonPrimary: 'bg-[#37bde8] text-[#06131e] hover:bg-[#65d7f7]',
    formFieldInput: 'border-[#34435a] bg-[#0d1522] text-[#e9f2ff]',
    footerAction: 'border-t border-[#29384e]',
    dividerLine: 'bg-[#34435a]',
    alert: 'border-[#7e3e50] bg-[#351b29]',
    otpCodeFieldInput: 'border-[#34435a] bg-[#0d1522] text-[#e9f2ff]',
    formFieldRow: 'text-[#bdc9d9]',
    main: 'text-[#e9f2ff]',
  },
};
const routes = [
  { path: '/dashboard', label: 'Overview', icon: Gauge },
  { path: '/markets', label: 'Markets', icon: BarChart3 },
  { path: '/wallet-scanner', label: 'Wallet scanner', icon: Wallet },
  { path: '/ai-intelligence', label: 'AI intelligence', icon: Bot },
];
const networkOptions = ['bitcoin', 'ethereum', 'solana', 'polygon', 'tron', 'avalanche', 'ton', 'sui'];
const periods = ['1', '7', '30', '90', '365', 'max'] as const;
const periodLabels: Record<string, string> = { '1': '1D', '7': '1W', '30': '1M', '90': '3M', '365': '1Y', max: 'ALL' };

function money(value?: number, compact = false) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 2 : value >= 1 ? 2 : 6,
  }).format(value);
}
function number(value?: number, compact = false) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 0 }).format(value);
}
function percent(value?: number) {
  return value === undefined || value === null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
function dateTime(value?: string) {
  if (!value) return 'Timestamp unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function shortAddress(value: string) {
  return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function Sparkline({ values, id, color = '#42c9ed', fill = false }: { values?: number[]; id: string; color?: string; fill?: boolean }) {
  if (!values || values.length < 2) return <div className="empty-chart" data-testid={`empty-chart-${id}`}>Chart data unavailable</div>;
  const width = 700, height = 210, pad = 8;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, i) => `${pad + i * (width - pad * 2) / (values.length - 1)},${height - pad - ((value - min) / range) * (height - pad * 2)}`).join(' ');
  const first = values[0] ?? 0, last = values[values.length - 1] ?? 0;
  const lineColor = last >= first ? color : '#e17b91';
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${id} sourced price chart`} data-testid={`chart-${id}`}>
    {fill && <defs><linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity=".19" /><stop offset="100%" stopColor={lineColor} stopOpacity="0" /></linearGradient></defs>}
    {[.25, .5, .75].map((fraction) => <line key={fraction} x1="0" x2={width} y1={height * fraction} y2={height * fraction} stroke="#263144" strokeWidth="1" strokeDasharray="3 7" />)}
    {fill && <polygon points={`${pad},${height} ${points} ${width - pad},${height}`} fill={`url(#area-${id})`} />}
    <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}

function MiniSpark({ values, id }: { values?: number[]; id: string }) {
  if (!values || values.length < 2) return <span className="data-source">—</span>;
  const w = 90, h = 28, min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${i * w / (values.length - 1)},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  const color = (values.at(-1) ?? 0) >= (values[0] ?? 0) ? '#59d5a9' : '#ee8792';
  return <svg className="spark-cell" viewBox={`0 0 ${w} ${h}`} data-testid={`sparkline-${id}`} aria-label={`${id} seven-day sparkline`}><path d={path} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function LoadingPanel({ label = 'Loading sourced data' }: { label?: string }) {
  return <div className="panel" role="status" aria-label={label} data-testid="status-loading-data" style={{ padding: 18 }}>
    <div className="skeleton skeleton-line" style={{ width: '32%' }} /><div className="skeleton skeleton-value" />
    <div className="skeleton skeleton-line" style={{ width: '76%', marginTop: 17 }} />
  </div>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="panel error-state" role="alert" data-testid="status-provider-error">
    <CircleAlert /><span>{message}<button type="button" onClick={retry} data-testid="button-retry-data">Retry</button></span>
  </div>;
}

function Header({ activePath }: { activePath: string }) {
  const { signOut } = useClerk();
  const current = routes.find((item) => item.path === activePath);
  return <>
    <aside className="sidebar">
      <Link href="/dashboard" className="brand" data-testid="link-brand-home">
        <span className="brand-mark"><Waves size={17} strokeWidth={1.8} /></span>
        <span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span>
      </Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        {routes.map(({ path, label, icon: Icon }) => <Link key={path} href={path} className={`nav-link ${activePath === path ? 'active' : ''}`} aria-current={activePath === path ? 'page' : undefined} data-testid={`link-nav-${path === '/' ? 'overview' : path.slice(1)}`}>
          <Icon strokeWidth={1.8} /><span>{label}</span>{activePath === path && <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: .7 }} />}
        </Link>)}
      </nav>
      <div className="side-bottom">
        <div className="read-only"><span className="read-dot" /><span>Public data · read only</span><LockKeyhole size={13} style={{ marginLeft: 'auto', color: '#65758c' }} /></div>
        <div className="side-foot">MARKET SIGNALS, WITHOUT THE NOISE</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="crumb"><span>INTELLIGENCE</span><ChevronRight size={12} /><strong>{current?.label.toUpperCase() ?? 'OVERVIEW'}</strong></div>
        <div className="top-meta"><span className="live-pill"><i />PUBLIC FEEDS</span><span>READ-ONLY TERMINAL</span><button className="terminal-signout" type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button></div>
      </header>
      <div className="mobile-head">
        <Link href="/dashboard" className="brand" data-testid="link-mobile-brand-home">
          <span className="brand-mark"><Waves size={15} /></span><span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span>
        </Link>
        <div className="mobile-meta"><span className="live-pill"><i />PUBLIC FEEDS</span><button className="terminal-signout" type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-mobile-sign-out">Exit</button></div>
      </div>
      <Switch>
        <Route path="/dashboard" component={OverviewPage} />
        <Route path="/markets" component={MarketsPage} />
        <Route path="/wallet-scanner" component={WalletPage} />
        <Route path="/ai-intelligence" component={IntelligencePage} />
        <Route component={NotFound} />
      </Switch>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {routes.map(({ path, label, icon: Icon }) => <Link key={path} href={path} className={`bottom-link ${activePath === path ? 'active' : ''}`} aria-current={activePath === path ? 'page' : undefined} data-testid={`mobile-nav-${path === '/' ? 'overview' : path.slice(1)}`}>
          <Icon strokeWidth={1.8} /><span>{label === 'Wallet scanner' ? 'Wallet' : label === 'AI intelligence' ? 'AI intel' : label}</span>
        </Link>)}
      </nav>
    </main>
  </>;
}

function PageTitle({ eyebrow, title, description, updatedAt }: { eyebrow: string; title: string; description: string; updatedAt?: string }) {
  return <div className="page-heading">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-description">{description}</p></div>
    {updatedAt && <div className="time-stamp" data-testid="text-data-updated-at"><Clock3 size={13} />Updated {dateTime(updatedAt)}</div>}
  </div>;
}

function MetricCard({ label, value, foot, icon: Icon, trend, testId }: { label: string; value: string; foot: string; icon: typeof Activity; trend?: number; testId: string }) {
  return <section className="panel metric-card" data-testid={`metric-${testId}`}>
    <div className="metric-label"><span>{label}</span><span className="metric-icon"><Icon /></span></div>
    <div className="metric-value" data-testid={`value-${testId}`}>{value}</div>
    <div className="metric-foot">{trend !== undefined && (trend >= 0 ? <ArrowUpRight size={12} className="positive" /> : <ArrowDownRight size={12} className="negative" />)}<span className={trend === undefined ? '' : trend >= 0 ? 'positive' : 'negative'}>{foot}</span></div>
  </section>;
}

function CoinTable({ items, onPick, source, updatedAt, loading }: { items: any[]; onPick?: (id: string) => void; source?: string; updatedAt?: string; loading?: boolean }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'rank' | 'price' | 'change' | 'cap' | 'volume'>('rank');
  const [direction, setDirection] = useState(1);
  const filtered = useMemo(() => items.filter((coin) => `${coin.name} ${coin.symbol}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const key = sort === 'rank' ? 'marketCapRank' : sort === 'price' ? 'currentPriceUsd' : sort === 'change' ? 'change24hPercent' : sort === 'cap' ? 'marketCapUsd' : 'volume24hUsd';
    return ((a[key] ?? 0) - (b[key] ?? 0)) * direction;
  }), [items, search, sort, direction]);
  const toggleSort = (field: typeof sort) => { if (sort === field) setDirection(direction * -1); else { setSort(field); setDirection(1); } };
  const headerButton = (label: string, field: typeof sort, id: string) => <button type="button" onClick={() => toggleSort(field)} data-testid={`sort-${id}`} style={{ border: 0, background: 'transparent', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}>{label}{sort === field ? direction === 1 ? ' ↑' : ' ↓' : ''}</button>;
  return <section className="panel table-panel">
    <div className="section-head"><div><div className="section-title">Market leaders</div><div className="section-kicker">Ranked by live market capitalization</div></div><span className="data-source"><Database />{source ?? 'Provider source unavailable'}</span></div>
    <div className="market-toolbar"><label className="search-box"><Search size={14} /><input aria-label="Search markets" placeholder="Search asset or ticker" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-market-search" /></label></div>
    {loading ? <div style={{ padding: '0 18px 18px' }}><LoadingPanel label="Loading market coins" /></div> : filtered.length === 0 ? <div className="empty-chart" style={{ minHeight: 150 }} data-testid="empty-market-results"><div><strong>{items.length ? 'No matching assets' : 'No market data available'}</strong>{items.length ? 'Try another asset name or ticker.' : 'The provider returned no market listings.'}</div></div> :
      <div className="table-scroll"><table>
        <thead><tr><th>{headerButton('Asset', 'rank', 'rank')}</th><th>{headerButton('Price', 'price', 'price')}</th><th>{headerButton('24h', 'change', 'change')}</th><th>{headerButton('Market cap', 'cap', 'market-cap')}</th><th>{headerButton('Volume 24h', 'volume', 'volume')}</th><th>7D</th></tr></thead>
        <tbody>{filtered.map((coin) => <tr key={coin.id} onClick={() => onPick?.(coin.id)} data-testid={`row-market-coin-${coin.id}`} tabIndex={onPick ? 0 : undefined} onKeyDown={(event) => { if (onPick && (event.key === 'Enter' || event.key === ' ')) onPick(coin.id); }}>
          <td><div className="coin-ident"><span className="coin-avatar">{coin.image ? <img src={coin.image} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : coin.symbol.slice(0, 1)}</span><div><div className="coin-name">{coin.name}</div><div className="coin-symbol">#{coin.marketCapRank} · {coin.symbol}</div></div></div></td>
          <td className="mono">{money(coin.currentPriceUsd)}</td><td className={`mono ${coin.change24hPercent >= 0 ? 'positive' : 'negative'}`} data-testid={`text-change-${coin.id}`}>{percent(coin.change24hPercent)}</td><td className="mono">{money(coin.marketCapUsd, true)}</td><td className="mono">{money(coin.volume24hUsd, true)}</td><td><MiniSpark values={coin.sparkline7d} id={coin.id} /></td>
        </tr>)}</tbody>
      </table></div>}
    <div className="history-meta"><span>{items.length} provider-listed assets</span><span>{updatedAt ? `Updated ${dateTime(updatedAt)}` : 'Timestamp unavailable'}</span></div>
  </section>;
}

function OverviewPage() {
  const overview = useGetMarketOverview();
  const coins = useGetMarketCoins({ limit: 12 });
  const data = overview.data;
  const btc = coins.data?.items?.find((coin) => coin.symbol.toLowerCase() === 'btc') ?? coins.data?.items?.[0];
  const combinedError = overview.isError || coins.isError;
  return <div className="content">
    <PageTitle eyebrow="Market overview / 01" title="The market, in context." description="A sourced snapshot of digital-asset markets. Public data only; no projections presented as fact." updatedAt={data?.updatedAt ?? coins.data?.updatedAt} />
    {overview.isLoading ? <div className="metric-grid">{Array.from({ length: 4 }, (_, i) => <LoadingPanel key={i} />)}</div> : overview.isError ? <ErrorPanel message="Market overview is unavailable from the data provider." retry={() => overview.refetch()} /> : data &&
      <div className="metric-grid">
        <MetricCard label="Total market capitalization" value={money(data.totalMarketCapUsd, true)} foot={data.source} trend={data.marketCapChange24hPercent} icon={Layers3} testId="total-market-cap" />
        <MetricCard label="24h trading volume" value={money(data.totalVolume24hUsd, true)} foot={`Source · ${data.source}`} icon={Activity} testId="market-volume" />
        <MetricCard label="Bitcoin dominance" value={`${data.bitcoinDominancePercent.toFixed(2)}%`} foot={`Source · ${data.source}`} icon={Gauge} testId="bitcoin-dominance" />
        <MetricCard label="Active cryptocurrencies" value={number(data.activeCryptocurrencies)} foot={`Source · ${data.source}`} icon={Blocks} testId="active-assets" />
      </div>}
    {combinedError && overview.data && <div style={{ marginTop: 12 }}><ErrorPanel message="One or more market data feeds could not be refreshed." retry={() => { overview.refetch(); coins.refetch(); }} /></div>}
    <div className="overview-row">
      <section className="panel">
        <div className="section-head"><div><div className="section-title">Seven-day price trace</div><div className="section-kicker">{btc ? `${btc.name} (${btc.symbol.toUpperCase()}) · provider sparkline` : 'No provider sparkline available'}</div></div><Link href="/markets" className="subtle-button" data-testid="link-overview-markets">Explore markets <ArrowRight /></Link></div>
        <div className="chart-wrap">{coins.isLoading ? <LoadingPanel /> : <Sparkline values={btc?.sparkline7d} id="overview-market" fill />}</div>
        <div className="chart-legend"><span>7-day historical sparkline</span><span>{coins.data?.source ?? 'Source unavailable'} · {coins.data?.updatedAt ? dateTime(coins.data.updatedAt) : 'Timestamp unavailable'}</span></div>
      </section>
      <section className="panel">
        <div className="section-head"><div><div className="section-title">Bitcoin dominance</div><div className="section-kicker">Share of total reported market cap</div></div><span className="metric-icon"><Gauge /></span></div>
        <div className="dominance-body">
          {overview.isLoading ? <LoadingPanel /> : data ? <>
            <div className="dominance-value" data-testid="value-dominance-detail">{data.bitcoinDominancePercent.toFixed(2)}<span>%</span></div>
            <div className="bar-track"><div className="bar-fill" style={{ '--value': `${Math.max(0, Math.min(data.bitcoinDominancePercent, 100))}%` } as CSSProperties} /></div>
            <div className="dom-legend"><span>Bitcoin</span><span>Other assets · {(100 - data.bitcoinDominancePercent).toFixed(2)}%</span></div>
            <div className="dom-note">Provider-reported share of total market capitalization. This is a descriptive market metric, not an investment signal.</div>
          </> : <div className="empty-chart" style={{ height: 120 }}>Dominance data unavailable</div>}
        </div>
      </section>
    </div>
    <CoinTable items={coins.data?.items ?? []} source={coins.data?.source} updatedAt={coins.data?.updatedAt} loading={coins.isLoading} />
  </div>;
}

function HistoryPanel({ coinId, coin, sourceFallback }: { coinId: string; coin?: any; sourceFallback?: string }) {
  const [days, setDays] = useState<(typeof periods)[number]>('7');
  const history = useGetMarketHistory({ coinId, days }, { query: { enabled: !!coinId, queryKey: getGetMarketHistoryQueryKey({ coinId, days }) } });
  const points = history.data?.points ?? [];
  const prices = points.map((point) => point.priceUsd);
  const first = prices[0], last = prices.at(-1);
  const move = first && last ? ((last - first) / first) * 100 : undefined;
  return <section className="panel history-card">
    <div className="section-head"><div><div className="section-title">Coin history</div><div className="section-kicker">{coin ? `${coin.name} · ${coin.symbol.toUpperCase()}` : coinId || 'Select an asset'}</div></div>
      <div className="periods">{periods.map((period) => <button type="button" key={period} className={`period-btn ${days === period ? 'selected' : ''}`} onClick={() => setDays(period)} data-testid={`button-history-period-${period}`}>{periodLabels[period]}</button>)}</div>
    </div>
    {coin && <div className="history-summary"><span className="history-price" data-testid="text-history-current-price">{money(coin.currentPriceUsd)}</span>{coin.change24hPercent !== undefined && <span className={`history-change ${coin.change24hPercent >= 0 ? 'positive' : 'negative'}`} data-testid="text-history-change">{percent(coin.change24hPercent)} / 24h</span>}</div>}
    <div className="history-chart">{history.isLoading ? <LoadingPanel label="Loading coin price history" /> : history.isError ? <div className="empty-chart" role="alert" data-testid="status-history-error"><div><strong>History provider unavailable</strong><button className="subtle-button" type="button" onClick={() => history.refetch()} data-testid="button-retry-history">Retry history</button></div></div> : points.length > 1 ?
      <Sparkline values={prices} id="coin-history" fill /> : <div className="empty-chart" data-testid="empty-history"><div><strong>{points.length ? 'Not enough history points to chart' : 'History data unavailable'}</strong>The provider returned no usable points for this period.</div></div>}
    </div>
    <div className="history-meta"><span>{history.data?.source ?? sourceFallback ?? 'Provider source unavailable'}</span><span>{history.data?.updatedAt ? `Updated ${dateTime(history.data.updatedAt)}` : 'Timestamp unavailable'}{move !== undefined ? ` · ${percent(move)} period` : ''}</span></div>
  </section>;
}

function MarketsPage() {
  const coins = useGetMarketCoins({ limit: 100 });
  const [selected, setSelected] = useState('');
  useEffect(() => { if (!selected && coins.data?.items?.length) setSelected(coins.data.items[0].id); }, [coins.data, selected]);
  const selectedCoin = coins.data?.items?.find((item) => item.id === selected);
  return <div className="content">
    <PageTitle eyebrow="Markets / 02" title="Compare the field." description="Search the provider's listed assets, sort by a market metric, and inspect available price history." updatedAt={coins.data?.updatedAt} />
    {coins.isError && <ErrorPanel message="Market listings are unavailable from the data provider." retry={() => coins.refetch()} />}
    <div className="market-layout">
      <CoinTable items={coins.data?.items ?? []} source={coins.data?.source} updatedAt={coins.data?.updatedAt} loading={coins.isLoading} onPick={setSelected} />
      {selected ? <HistoryPanel coinId={selected} coin={selectedCoin} sourceFallback={coins.data?.source} /> :
        <section className="panel history-card"><div className="empty-chart" style={{ minHeight: 240 }}><div><strong>Choose an asset</strong>Available coin history will appear here.</div></div></section>}
    </div>
    {coins.data?.source && <div className="data-source" style={{ marginTop: 12 }} data-testid="text-markets-source"><Database />Market list source: {coins.data.source} · {dateTime(coins.data.updatedAt)}</div>}
  </div>;
}

function WalletPage() {
  const scan = useScanWallet();
  const [network, setNetwork] = useState('ethereum');
  const [address, setAddress] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!address.trim() || scan.isPending) return;
    scan.mutate({ data: { network: network as 'bitcoin' | 'ethereum' | 'solana' | 'polygon' | 'tron' | 'avalanche' | 'ton' | 'sui', address: address.trim() } });
  };
  const result = scan.data;
  return <div className="content">
    <PageTitle eyebrow="Wallet scanner / 03" title="Read public balances." description="Look up a public address on a supported network. No wallet connection, signing, or transaction access." />
    <div className="market-layout">
      <section className="panel flow-card">
        <div className="eyebrow">Public address lookup</div><h2 style={{ margin: 0, color: '#e7eff9', fontSize: 17, letterSpacing: '-.03em' }}>Inspect a wallet address</h2>
        <p className="page-description">A read-only request for the public native-asset balance only. The provider's response is shown as returned.</p>
        <form className="wallet-form" onSubmit={submit} data-testid="form-wallet-scan">
          <label><span className="field-label">Network</span><select className="select" value={network} onChange={(event) => setNetwork(event.target.value)} data-testid="select-wallet-network">{networkOptions.map((option) => <option value={option} key={option}>{option[0]?.toUpperCase()}{option.slice(1)}</option>)}</select></label>
          <label><span className="field-label">Public address</span><input className="input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={128} required placeholder="Paste a public address" autoComplete="off" spellCheck={false} data-testid="input-wallet-address" /></label>
          <div className="notice safe"><ShieldCheck /><span><strong>Read-only by design.</strong> Never enter a seed phrase or private key. This scanner does not request wallet connection, signatures, or transactions.</span></div>
          <button className="primary-button" type="submit" disabled={!address.trim() || scan.isPending} data-testid="button-scan-wallet">{scan.isPending ? <><LoaderCircle className="spin" />Checking provider…</> : <><Eye />Scan public address</>}</button>
        </form>
        {scan.isError && <div className="panel error-state" role="alert" style={{ marginTop: 14 }} data-testid="status-wallet-error"><CircleAlert /><span>Wallet lookup failed. The provider did not return a result. Check the network and address, then retry.</span><button type="button" onClick={() => scan.mutate({ data: { network: network as any, address: address.trim() } })} data-testid="button-retry-wallet">Retry</button></div>}
      </section>
      <div>
        <section className="panel scope-panel">
          <div className="scope-heading"><LockKeyhole />Lookup boundaries</div>
          <div className="scope-list">
            <div className="scope-row"><div className="scope-name">Public native balance</div><div className="scope-copy">Only public address and native-asset balance fields returned by the provider.</div></div>
            <div className="scope-row"><div className="scope-name">No wallet connection</div><div className="scope-copy">No signing, private keys, seed phrases, token approvals, or transactions.</div></div>
            <div className="scope-row"><div className="scope-name">Network support</div><div className="scope-copy">Bitcoin, Ethereum, Solana, Polygon, Tron, Avalanche, TON, and Sui.</div></div>
            <div className="scope-row"><div className="scope-name">Provider availability</div><div className="scope-copy">Invalid, unsupported, or unavailable results are reported without estimating a balance.</div></div>
          </div>
        </section>
        {result && <section className="panel result-card" data-testid="card-wallet-result">
          <div className="result-top"><div><div className="section-title">Lookup result</div><div className="section-kicker">{result.network} · {shortAddress(result.address)}</div></div><span className={`status-badge ${result.status}`} data-testid="status-wallet-result">{result.status}</span></div>
          <div className="result-grid">
            <div className="result-item"><div className="result-label">Native asset</div><div className="result-value" data-testid="text-wallet-native-asset">{result.nativeAsset ?? 'Not provided'}</div></div>
            <div className="result-item"><div className="result-label">Native balance</div><div className="result-value" data-testid="text-wallet-native-balance">{result.nativeBalance ?? 'Not provided'}</div></div>
            <div className="result-item" style={{ gridColumn: '1 / -1' }}><div className="result-label">Provider message</div><div className="result-value" data-testid="text-wallet-message">{result.message}</div></div>
          </div>
          <div className="result-footer"><span>{result.source ?? 'Provider source unavailable'} · {dateTime(result.checkedAt)}</span>{result.explorerUrl && <a className="text-link" href={result.explorerUrl} target="_blank" rel="noreferrer" data-testid="link-wallet-explorer">Open explorer <ExternalLink size={11} /></a>}</div>
        </section>}
      </div>
    </div>
  </div>;
}

function IntelligencePage() {
  const ask = useAskIntelligence();
  const [question, setQuestion] = useState('');
  const answer = ask.data;
  const suggestions = ['What is the current market structure?', 'Compare Bitcoin dominance with total market cap.', 'Which listed assets have the largest 24h moves?'];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim() || ask.isPending) return;
    ask.mutate({ data: { question: question.trim() } });
  };
  return <div className="content">
    <PageTitle eyebrow="AI intelligence / 04" title="Ask the market snapshot." description="A Groq-backed assistant grounded in the available public market snapshot. Answers may interpret the data; they do not extend beyond it." />
    <div className="assistant-layout">
      <section className="panel assistant-main">
        <div className="assistant-intro"><div className="assistant-mark"><Sparkles /></div><h2>Research, with its limits in view.</h2><p>Ask about the market data currently available to the API. Market facts and interpretation are presented separately; wallet histories and unconnected blockchain feeds are out of scope.</p></div>
        <div className="prompt-chip-row">{suggestions.map((suggestion, i) => <button type="button" key={suggestion} className="prompt-chip" onClick={() => setQuestion(suggestion)} data-testid={`button-suggest-question-${i + 1}`}>{suggestion}</button>)}</div>
        <div className="answer-area">
          {ask.isPending ? <div className="answer-placeholder" role="status" data-testid="status-ai-loading"><LoaderCircle /><span>Checking the available market snapshot…</span></div> : ask.isError ? <div className="error-state" role="alert" data-testid="status-ai-error"><CircleAlert /><span>The assistant could not return an answer. The market snapshot may be unavailable.<button type="button" onClick={() => question.trim() && ask.mutate({ data: { question: question.trim() } })} data-testid="button-retry-ai">Retry</button></span></div> : answer ? <div data-testid="card-ai-answer">
            <div className="answer-box" data-testid="text-ai-answer">{answer.answer}</div>
            <div className="answer-meta"><span><Bot size={12} />{answer.model}</span><span><Database size={12} />{answer.dataSource}</span><span><Clock3 size={12} />Data updated {dateTime(answer.dataUpdatedAt)}</span></div>
            <div className="notice" style={{ marginTop: 14 }} data-testid="text-ai-scope"><strong>Scope</strong><br />{answer.scope}</div>
            <div className="notice" style={{ marginTop: 8 }} data-testid="text-ai-disclaimer"><strong>Disclaimer</strong><br />{answer.disclaimer}</div>
          </div> : <div className="answer-placeholder" data-testid="empty-ai-answer"><Sparkles /><span>Your response will appear here with its model, data source, update time, scope, and API-provided disclaimer. No unsupported live data is added.</span></div>}
        </div>
        <form className="ask-form" onSubmit={submit} data-testid="form-ask-intelligence">
          <textarea className="input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} required placeholder="Ask a question about available market data…" aria-label="Question for market intelligence" data-testid="input-ai-question" />
          <button className="primary-button ask-button" type="submit" aria-label="Ask intelligence" disabled={!question.trim() || ask.isPending} data-testid="button-ask-intelligence">{ask.isPending ? <LoaderCircle /> : <Send />}</button>
        </form>
      </section>
      <aside className="panel scope-panel">
        <div className="scope-heading"><Database />Evidence boundary</div>
        <p className="scope-copy" style={{ fontSize: 10, margin: '9px 0 0' }}>The answer is grounded only in the market snapshot available to the API. It does not fetch additional sources.</p>
        <div className="scope-list">
          <div className="scope-row"><div className="scope-name">Market facts</div><div className="scope-copy">Reported metrics and asset fields should be attributed to the provided source and timestamp.</div></div>
          <div className="scope-row"><div className="scope-name">Interpretation</div><div className="scope-copy">Any analysis is interpretation, not a verified fact or investment recommendation.</div></div>
          <div className="scope-row"><div className="scope-name">Outside scope</div><div className="scope-copy">Wallet histories and unconnected blockchain feeds are not available to the assistant.</div></div>
        </div>
        {answer && <div className="data-source" style={{ marginTop: 16 }} data-testid="text-ai-answer-provenance"><Clock3 />Snapshot {dateTime(answer.dataUpdatedAt)}</div>}
      </aside>
    </div>
  </div>;
}

function NotFound() {
  return <div className="content"><div className="panel flow-card"><div className="eyebrow">404 / route unavailable</div><h1>That page is not in this terminal.</h1><p className="page-description">Use the workspace navigation to return to available market intelligence.</p><Link href="/" className="primary-button" style={{ marginTop: 20, width: 'fit-content' }} data-testid="link-return-overview">Return to overview <ArrowRight /></Link></div></div>;
}

function RoutedApp() {
  return <Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/dashboard" component={DashboardGate} />
    <Route path="/markets" component={AppShell} />
    <Route path="/wallet-scanner" component={AppShell} />
    <Route path="/ai-intelligence" component={AppShell} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route component={NotFound} />
  </Switch>;
}

function AppShell() {
  const [location] = useLocation();
  return <div className="app-shell"><Header activePath={location} /></div>;
}

function DashboardGate() {
  return <><Show when="signed-in"><AppShell /></Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function HomeRedirect() {
  return <>
    <Show when="signed-in"><Redirect to="/dashboard" /></Show>
    <Show when="signed-out"><LandingPage /></Show>
  </>;
}

function LandingPage() {
  const overview = useGetMarketOverview();
  const coins = useGetMarketCoins({ limit: 6 });
  const featured = coins.data?.items?.slice(0, 5) ?? [];
  return <div className="landing-page">
    <header className="landing-nav">
      <Link href="/" className="brand landing-brand" data-testid="link-landing-brand"><span className="brand-mark"><Waves size={17} /></span><span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span></Link>
      <nav className="landing-nav-links" aria-label="Public pages"><Link href="/markets" data-testid="link-landing-markets">Markets</Link><Link href="/wallet-scanner" data-testid="link-landing-wallet">Wallet scanner</Link><Link href="/ai-intelligence" data-testid="link-landing-ai">AI intelligence</Link></nav>
      <div className="landing-auth"><Link href="/sign-in" className="landing-login" data-testid="link-landing-sign-in">Sign in</Link><Link href="/sign-up" className="landing-cta" data-testid="link-landing-sign-up">Create account <ArrowRight size={15} /></Link></div>
    </header>
    <main>
      <section className="landing-hero">
        <div className="hero-copy"><div className="hero-eyebrow"><span className="signal-dot" /> MARKET INTELLIGENCE / PUBLIC TERMINAL</div><h1>Clarity in a market<br />that never <em>sleeps.</em></h1><p>One disciplined workspace for sourced market signals, public wallet balances, and AI grounded in the data at hand.</p><div className="hero-actions"><Link href="/sign-up" className="landing-cta hero-cta" data-testid="button-hero-create-account">Enter the terminal <ArrowRight size={16} /></Link><Link href="/markets" className="hero-secondary" data-testid="link-hero-explore">Explore public markets <ChevronRight size={15} /></Link></div><div className="hero-proof"><span><ShieldCheck /> Read-only by design</span><span><Database /> Provider-sourced data</span></div></div>
        <div className="hero-visual" aria-label="Illustration of a live market intelligence terminal" data-testid="visual-landing-market-terminal">
          <div className="visual-top"><span><i /> FEED STATUS</span><strong>PUBLIC / LIVE</strong></div><div className="visual-total-label">TOTAL MARKET CAP</div><div className="visual-total">{overview.isLoading ? 'Loading…' : overview.data ? money(overview.data.totalMarketCapUsd, true) : '—'}</div><div className="visual-change">{overview.data ? `${percent(overview.data.marketCapChange24hPercent)} · 24H` : 'Provider snapshot'}</div>
          <div className="visual-chart"><Sparkline values={featured[0]?.sparkline7d} id="landing-preview" fill /></div><div className="visual-axis"><span>7D AGO</span><span>NOW</span></div>
          <div className="visual-assets">{featured.length ? featured.slice(0, 3).map((coin) => <div className="visual-asset" key={coin.id}><span className="visual-coin">{coin.symbol.slice(0, 1)}</span><span className="visual-asset-name">{coin.symbol.toUpperCase()}<small>#{coin.marketCapRank}</small></span><strong>{money(coin.currentPriceUsd)}</strong><span className={coin.change24hPercent >= 0 ? 'positive' : 'negative'}>{percent(coin.change24hPercent)}</span></div>) : <div className="visual-asset">{coins.isError ? 'Market feed unavailable' : 'Awaiting provider snapshot'}</div>}</div>
          <span className="visual-orbit orbit-one" /><span className="visual-orbit orbit-two" />
        </div>
        <div className="hero-index"><span>01 / 03</span><span>INDEPENDENT SIGNAL, CLEARLY SOURCED</span></div>
      </section>
      <section className="landing-ticker" aria-label="Market snapshot status"><span className="ticker-label"><i /> DATA SNAPSHOT</span><span>{overview.data?.source ?? (overview.isError ? 'Provider unavailable' : 'Connecting to provider')}</span><span>{overview.data ? `UPDATED ${dateTime(overview.data.updatedAt).toUpperCase()}` : 'NO ESTIMATES · NO SYNTHETIC PRICES'}</span></section>
      <section className="landing-intro"><div className="landing-section-index">A BETTER VIEW / 01</div><div><h2>Not another chart wall.<br /><span>A research instrument.</span></h2></div><p>Markets move fast. This terminal keeps the evidence close: attributed feeds, clear boundaries, and useful tools without pretending uncertainty is insight.</p></section>
      <section className="landing-capabilities">
        <Link href="/markets" className="capability capability-market" data-testid="card-capability-markets"><span className="capability-number">01 — MARKETS</span><div className="capability-art market-art"><div className="art-line" /><span>BTC / USD</span><b>LIVE SNAPSHOT</b></div><h3>See the field.<br />Keep the source.</h3><p>Compare provider-listed assets, inspect historical traces, and keep every metric tied to its origin.</p><span className="capability-link">Open markets <ArrowRight /></span></Link>
        <Link href="/wallet-scanner" className="capability capability-wallet" data-testid="card-capability-wallet"><span className="capability-number">02 — WALLET SCANNER</span><div className="capability-art wallet-art"><div className="wallet-ring"><Wallet /></div><span>PUBLIC ADDRESS / READ ONLY</span></div><h3>Look up balances.<br />Never connect.</h3><p>Inspect a public native-asset balance without wallet access, signing, or transaction permissions.</p><span className="capability-link">Scan an address <ArrowRight /></span></Link>
        <Link href="/ai-intelligence" className="capability capability-ai" data-testid="card-capability-ai"><span className="capability-number">03 — AI INTELLIGENCE</span><div className="capability-art ai-art"><span className="ai-glyph">∴</span><span>GROUNDED IN AVAILABLE DATA</span></div><h3>Ask a sharper<br />market question.</h3><p>Explore context with an assistant grounded in the available market snapshot, not imagined live feeds.</p><span className="capability-link">Ask intelligence <ArrowRight /></span></Link>
      </section>
      <section className="landing-principles"><div className="landing-section-index">BUILT ON BOUNDARIES / 02</div><h2>Trust starts with<br /><span>what we don’t claim.</span></h2><div className="principle-grid"><div><span>01</span><h3>Sources stay visible</h3><p>Provider labels and update times travel with the data.</p></div><div><span>02</span><h3>Public means public</h3><p>No wallet connection, private keys, signatures, or transactions.</p></div><div><span>03</span><h3>Interpretation is labeled</h3><p>AI context is distinguished from verified market facts.</p></div></div></section>
      <section className="landing-final"><div><div className="hero-eyebrow">A CLEARER STARTING POINT</div><h2>Stay curious.<br /><em>Stay grounded.</em></h2></div><div><p>Open a public market view now, or create an account for your intelligence workspace.</p><div className="hero-actions"><Link href="/sign-up" className="landing-cta" data-testid="button-final-create-account">Create your account <ArrowRight size={15} /></Link><Link href="/markets" className="hero-secondary" data-testid="link-final-browse">Browse markets <ChevronRight size={15} /></Link></div></div></section>
      <footer className="landing-footer"><Link href="/" className="footer-wordmark" data-testid="link-footer-home">WEB3 INTEL <span>RESEARCH TERMINAL</span></Link><span>PUBLIC DATA. CLEAR CONTEXT.</span><span>© {new Date().getFullYear()} WEB3 INTELLIGENCE</span></footer>
    </main>
  </div>;
}

function SignInPage() {
  return <div className="auth-page"><div className="auth-context"><Link href="/" className="brand" data-testid="link-auth-home"><span className="brand-mark"><Waves size={17} /></span><span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span></Link><div className="auth-context-copy"><div className="hero-eyebrow">PRIVATE WORKSPACE / SECURE ACCESS</div><h1>Your market<br />view, <em>in focus.</em></h1><p>Sign in to return to your intelligence workspace. Public research pages remain open to everyone.</p></div><span className="auth-footnote">SESSION PROTECTED BY CLERK AUTH</span></div><div className="auth-card-wrap"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}

function SignUpPage() {
  return <div className="auth-page"><div className="auth-context"><Link href="/" className="brand" data-testid="link-auth-home"><span className="brand-mark"><Waves size={17} /></span><span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span></Link><div className="auth-context-copy"><div className="hero-eyebrow">RESEARCH WITH CONTEXT</div><h1>Make room for<br /><em>better signals.</em></h1><p>Create an account to open your personal view of the public Web3 intelligence terminal.</p></div><span className="auth-footnote">PRIVATE BY DEFAULT · EVIDENCE ALWAYS VISIBLE</span></div><div className="auth-card-wrap"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) queryClient.clear();
    prevUserIdRef.current = userId;
  }), [addListener]);
  return null;
}

function ClerkRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your intelligence workspace' } }, signUp: { start: { title: 'Create your account', subtitle: 'A clearer view starts here' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator /><RoutedApp /></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkRouter /></WouterRouter>;
}

export default App;
