import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
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
const routes = [
  { path: '/', label: 'Overview', icon: Gauge },
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
  const current = routes.find((item) => item.path === activePath);
  return <>
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-brand-home">
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
        <div className="top-meta"><span className="live-pill"><i />PUBLIC FEEDS</span><span>READ-ONLY TERMINAL</span></div>
      </header>
      <div className="mobile-head">
        <Link href="/" className="brand" data-testid="link-mobile-brand-home">
          <span className="brand-mark"><Waves size={15} /></span><span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span>
        </Link>
        <span className="live-pill"><i />PUBLIC FEEDS</span>
      </div>
      <Switch>
        <Route path="/" component={OverviewPage} />
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
  const [location] = useLocation();
  const path = routes.some((route) => route.path === location) ? location : '/';
  return <div className="app-shell"><Header activePath={path} /></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedApp /></WouterRouter></QueryClientProvider>;
}

export default App;
