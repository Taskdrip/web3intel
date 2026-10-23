import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  CircleAlert, Clock3, Copy, Cpu, Download, ExternalLink, Gauge, HardDrive, LockKeyhole,
  MonitorCog, RefreshCw, Shield, ShieldCheck, Unplug, Users, Wallet, Zap,
} from 'lucide-react';
import {
  getGetAdminMiningOverviewQueryKey, getGetMiningDashboardQueryKey, getGetMiningDeviceStatisticsQueryKey,
  getGetMiningEngineStatusQueryKey, useCreateMiningConfiguration, useCreateMiningPairingCode,
  useDisconnectMiningDevice, useGetAdminMiningOverview, useGetMiningDashboard,
  useGetMiningDeviceStatistics, useGetMiningEngineStatus, useRevokeMiningConsent, useRevokeMiningDevice,
  useSuspendAdminMiningDevice, useUpdateAdminMiningEngine,
} from '@workspace/api-client-react';
import type {
  AdminMiningDevice, MiningConfiguration, MiningConfigurationInput, MiningDevice, MiningStatistic,
  MiningOperatingSystem, MiningProfile,
} from '@workspace/api-client-react';
import './MiningPages.css';

const operatingSystems: { value: MiningOperatingSystem; label: string }[] = [
  { value: 'windows_10_11', label: 'Windows 10 / 11' },
  { value: 'linux_ubuntu_debian', label: 'Linux · Ubuntu / Debian' },
  { value: 'linux_other', label: 'Linux · other distribution' },
];

const profiles: { value: MiningProfile; label: string; threads: number; copy: string }[] = [
  { value: 'eco', label: 'Eco', threads: 25, copy: '25% thread hint · default' },
  { value: 'balanced', label: 'Balanced', threads: 50, copy: '50% thread hint' },
  { value: 'performance', label: 'Performance', threads: 75, copy: '75% thread hint' },
  { value: 'custom', label: 'Custom', threads: 25, copy: 'Set your own thread hint' },
];

function osLabel(os: MiningOperatingSystem) {
  return operatingSystems.find((item) => item.value === os)?.label ?? os;
}

function connectionLabel(value: MiningConfiguration['connectionMethod']) {
  return value === 'p2pool' ? 'P2Pool' : value === 'solo' ? 'Solo node' : 'Pool';
}

function displayDate(value?: string | null) {
  if (!value) return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatHashrate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'No report';
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MH/s`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} kH/s`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} H/s`;
}

function formatUptime(value: number) {
  if (!Number.isFinite(value) || value < 0) return 'Not reported';
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function dollars(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function ApiErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const source = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const value = source.status ?? source.statusCode ?? source.response?.status;
  return typeof value === 'number' ? value : undefined;
}

function SectionHeading({ eyebrow, title, description, updatedAt }: { eyebrow: string; title: string; description: string; updatedAt?: string | null }) {
  return <header className="mine-heading">
    <div>
      <div className="mine-eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {updatedAt && <div className="mine-stamp"><Clock3 size={13} /> Updated {displayDate(updatedAt)}</div>}
  </header>;
}

function Panel({ title, subtitle, index, children, className = '' }: { title: string; subtitle?: string; index?: string; children: ReactNode; className?: string }) {
  return <section className={`mine-panel ${className}`}>
    <div className="mine-panel-head">
      <div><div className="mine-panel-title">{title}</div>{subtitle && <div className="mine-panel-subtitle">{subtitle}</div>}</div>
      {index && <span className="mine-index">{index}</span>}
    </div>
    <div className="mine-body">{children}</div>
  </section>;
}

function Note({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warning' | 'success' }) {
  const Icon = tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : ShieldCheck;
  return <aside className={`mine-note ${tone === 'plain' ? '' : tone}`} role={tone === 'warning' ? 'note' : undefined}>
    <Icon aria-hidden="true" /><div>{children}</div>
  </aside>;
}

function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="mine-alert" role="alert">
    <CircleAlert aria-hidden="true" /><span>{message}</span>
    <button className="mine-button" type="button" onClick={retry}><RefreshCw /> Retry</button>
  </div>;
}

function LoadingCards({ count = 2 }: { count?: number }) {
  return <div className="mine-surface-grid" role="status" aria-label="Loading mining data">
    {Array.from({ length: count }, (_, index) => <div className="mine-panel mine-skeleton-card" key={index}>
      <div className="mine-skeleton" /><div className="mine-skeleton" /><div className="mine-skeleton" />
    </div>)}
  </div>;
}

function useMiningInvalidation() {
  const queryClient = useQueryClient();
  return async (includeAdmin = false, deviceIds: number[] = []) => {
    const keys = [
      queryClient.invalidateQueries({ queryKey: getGetMiningDashboardQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMiningEngineStatusQueryKey() }),
    ];
    if (includeAdmin) keys.push(queryClient.invalidateQueries({ queryKey: getGetAdminMiningOverviewQueryKey() }));
    deviceIds.forEach((deviceId) => keys.push(queryClient.invalidateQueries({ queryKey: getGetMiningDeviceStatisticsQueryKey(deviceId) })));
    await Promise.all(keys);
  };
}

export function MiningLandingPage() {
  const status = useGetMiningEngineStatus();
  const available = status.data?.engineEnabled === true && status.data.moneroEnabled === true;
  return <div className="mining-root">
    <main className="mining-page">
      <div className="mine-topline">
        <span>WEB3INTEL / LOCAL MINING MONITOR</span>
        <nav aria-label="Mining pages">
          <Link className="mine-link" href="/mining/guide">Read the setup guide <ArrowUpRight size={13} /></Link>
          <Link className="mine-link" href="/dashboard/mining">Dashboard <ArrowRight size={13} /></Link>
        </nav>
      </div>
      <section className="mine-hero">
        <div className="mine-hero-copy">
          <div className="mine-eyebrow">OPTIONAL · USER-CONTROLLED · LOCAL</div>
          <h1>Turn Your Computing Power Into Crypto Mining Power</h1>
          <p>Configure Monero mining for a computer you control, then view device-reported activity in your Web3Intel account. You install and launch XMRig yourself. Nothing mines in this browser or on Web3Intel infrastructure.</p>
          <div className="mine-hero-actions">
            <Link className="mine-button primary" href="/dashboard/mining"><Cpu /> Start Mining <ArrowRight /></Link>
            <Link className="mine-button" href="/mining/guide">How it works <ArrowUpRight /></Link>
          </div>
          <div className="mine-hero-meta">
            <span><LockKeyhole /> Explicit opt-in</span>
            <span><MonitorCog /> Local XMRig only</span>
            <span><Activity /> No pool verification</span>
          </div>
        </div>
        <div className="mine-hero-art" aria-hidden="true">
          <div className="mine-orbit">
            <span className="mine-orbit-point one" /><span className="mine-orbit-point two" />
            <div className="mine-orbit-core"><Cpu size={31} /></div>
          </div>
        </div>
      </section>
      <div className="mine-stat-grid">
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Engine availability <Activity size={14} /></div><div className="mine-stat-value">{status.isLoading ? '…' : status.isError ? 'Unavailable' : available ? 'Available' : 'Paused'}</div><div className="mine-stat-note">{status.isError ? 'Status could not be loaded.' : available ? 'Monero configuration is currently enabled.' : 'Configuration creation may be unavailable.'}</div></div>
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Where work runs <HardDrive size={14} /></div><div className="mine-stat-value">Your device</div><div className="mine-stat-note">The optional monitor reads local XMRig statistics only.</div></div>
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Verification <Shield size={14} /></div><div className="mine-stat-value">Awaiting</div><div className="mine-stat-note">Device reports are not pool-verified hashrate or rewards.</div></div>
      </div>
      {status.isError && <QueryError message="Mining availability could not be checked. Retry to load the server status." retry={() => status.refetch()} />}
      <section className="mine-story">
        <div><div className="mine-story-index">01 / BOUNDARIES</div><h2>Research terminal, not a hosted miner.</h2></div>
        <p>Web3Intel is a read-only crypto research terminal. The opt-in mining module is a configuration and monitoring layer: it generates a local XMRig JSON file, issues a revocable one-time pairing code, and can display device-reported telemetry. You decide whether to install and run third-party mining software, choose the host and port, and pay any local energy costs.</p>
      </section>
      <div className="mine-step-band" aria-label="How the local monitor works">
        <article className="mine-step"><div className="mine-step-number">STEP 01</div><h3>Save with consent</h3><p>Choose your own pool or node details, public wallet address, operating system, and CPU limit.</p></article>
        <article className="mine-step"><div className="mine-step-number">STEP 02</div><h3>Install and launch locally</h3><p>Download the generated JSON and install XMRig yourself from its official source. Web3Intel does not install or control it.</p></article>
        <article className="mine-step"><div className="mine-step-number">STEP 03</div><h3>Pair the monitor if you choose</h3><p>A one-time expiring code lets the standalone monitor report local XMRig data. Credentials can be revoked.</p></article>
      </div>
      <section className="mine-story">
        <div><div className="mine-story-index">02 / TRANSPARENCY</div><h2>Telemetry is not proof of pool earnings.</h2></div>
        <p>Hashrate and share counts shown in the dashboard are reported by the local device. They remain marked <strong>Awaiting pool verification</strong>; Web3Intel does not present verified hashrate, rewards, or profitability. Estimates are only as reliable as the values you enter and do not account for every cost.</p>
      </section>
      <div className="mine-disclaimer"><strong>Before you opt in:</strong> mining can increase power use, heat, fan noise, and hardware wear. Review local laws, your electricity plan, hardware limits, and the software publisher’s security guidance. Never enter wallet seed phrases, private keys, or passwords in Web3Intel.</div>
      <section className="mine-public-section">
        <div className="mine-public-section-head"><div className="mine-story-index">SUPPORTED SCOPE</div><h2>Supported Cryptocurrencies</h2><p>One narrowly scoped, opt-in mining configuration in this MVP.</p></div>
        <div className="mine-support-band"><article><span className="mine-support-code">XMR</span><div><h3>Monero</h3><p>Monero (XMR) using the RandomX CPU algorithm.</p></div></article></div>
      </section>
      <section className="mine-public-section">
        <div className="mine-public-section-head"><div className="mine-story-index">DEVICE BOUNDARIES</div><h2>Supported Devices</h2><p>Designed for users who choose to configure and run XMRig locally.</p></div>
        <div className="mine-support-band"><article><MonitorCog /><div><h3>Windows desktop or laptop</h3><p>Manual XMRig installation and launch on your own computer.</p></div></article><article><HardDrive /><div><h3>Linux desktop or server</h3><p>Manual XMRig installation and launch on a supported Linux system.</p></div></article></div>
        <Note tone="warning"><strong>Not supported:</strong> smartphones and ordinary browser tabs do not mine in this MVP. Mining never runs in the Web3Intel browser page.</Note>
      </section>
      <section className="mine-public-section" id="requirements">
        <div className="mine-public-section-head"><div className="mine-story-index">BEFORE YOU BEGIN</div><h2>Mining Requirements</h2><p>Gather your own details before saving an opt-in configuration.</p></div>
        <div className="mine-requirements-grid">
          <article><span>01</span><h3>A device you control</h3><p>A Windows or Linux desktop, laptop, or server with CPU capacity and adequate cooling.</p></article>
          <article><span>02</span><h3>Your own endpoint</h3><p>Enter a pool or node hostname, port, and TLS choice that you have independently selected.</p></article>
          <article><span>03</span><h3>A public XMR address</h3><p>Use a receiving address only. Never provide seed phrases, private keys, or passwords.</p></article>
          <article><span>04</span><h3>Manual installation</h3><p>Install and launch XMRig yourself. Review its official release and security guidance first.</p></article>
        </div>
      </section>
      <section className="mine-public-section" id="getting-started">
        <div className="mine-public-section-head"><div className="mine-story-index">OPTIONAL SETUP</div><h2>Getting Started</h2><p>Web3Intel provides configuration and monitoring tools, not remote machine control.</p></div>
        <div className="mine-step-band">
          <article className="mine-step"><div className="mine-step-number">01</div><h3>Save with consent</h3><p>Enter your public wallet and endpoint, then explicitly opt in to save the configuration.</p></article>
          <article className="mine-step"><div className="mine-step-number">02</div><h3>Install and launch locally</h3><p>Download a generated XMRig JSON file and follow the OS-specific manual instructions.</p></article>
          <article className="mine-step"><div className="mine-step-number">03</div><h3>Pair only if you choose</h3><p>Request a one-time, expiring code for your selected saved configuration and device.</p></article>
        </div>
        <div className="mine-public-cta"><div><strong>All computing and energy use stays under your control.</strong><span>No income or pool rewards are guaranteed.</span></div><Link className="mine-button primary" href="/dashboard/mining">Start Mining <ArrowRight /></Link></div>
      </section>
      <section className="mine-public-section">
        <div className="mine-public-section-head"><div className="mine-story-index">USER INPUTS ONLY</div><h2>Profitability Estimator</h2><p>Enter your own assumptions. No live rates, generated earning data, or profitability forecasts are used.</p></div>
        <CostEstimator />
      </section>
      <section className="mine-public-section" id="faq">
        <div className="mine-public-section-head"><div className="mine-story-index">QUICK ANSWERS</div><h2>FAQ</h2></div>
        <div className="mine-faq-list mine-public-faq">
          <article className="mine-faq"><h3>Does Web3Intel mine for me?</h3><p>No. Mining runs only if you install and launch XMRig manually on your own device. Web3Intel does not remotely start or stop software.</p></article>
          <article className="mine-faq"><h3>Are hashrate or rewards verified?</h3><p>Device telemetry is reported by the device and remains Awaiting pool verification. Estimated and actual pool rewards are unavailable until a real pool integration exists.</p></article>
          <article className="mine-faq"><h3>Can I use a phone or browser tab?</h3><p>No. Smartphones and ordinary browser tabs do not mine in this MVP.</p></article>
          <article className="mine-faq"><h3>What should I enter for an endpoint?</h3><p>Only enter a host and port you obtained from a pool or node you independently selected. Web3Intel does not supply endpoint addresses.</p></article>
        </div>
      </section>
    </main>
  </div>;
}

type MiningConfigDraft = Omit<MiningConfigurationInput, 'consentAccepted'> & { consentAccepted: boolean };

function defaultConfigForm(): MiningConfigDraft {
  return {
    connectionMethod: 'pool',
    poolHost: '',
    poolPort: 0,
    tlsEnabled: false,
    walletAddress: '',
    cpuThreadLimit: 25,
    profile: 'eco',
    operatingSystem: 'windows_10_11',
    consentAccepted: false,
  };
}

function hostForXmrig(host: string) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function makeXmrigConfig(configuration: MiningConfiguration) {
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  const accessToken = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const endpoint = `${hostForXmrig(configuration.poolHost)}:${configuration.poolPort}`;
  const solo = configuration.connectionMethod === 'solo';
  const poolEntry = {
    url: solo ? `daemon+${configuration.tlsEnabled ? 'https' : 'http'}://${endpoint}` : endpoint,
    user: configuration.walletAddress,
    keepalive: !solo,
    tls: configuration.tlsEnabled,
    enabled: true,
    coin: 'monero',
    algo: 'rx/0',
    ...(solo ? { daemon: true, 'daemon-poll-interval': 1000 } : {}),
  };
  return {
    autosave: false,
    background: false,
    colors: false,
    cpu: {
      enabled: true,
      'huge-pages': false,
      priority: 0,
      yield: true,
      'max-threads-hint': configuration.cpuThreadLimit,
    },
    'opencl': { enabled: false, cache: true, loader: null, platform: 'AMD' },
    'cuda': { enabled: false, loader: null, nvml: false },
    pools: [poolEntry],
    http: {
      enabled: true,
      host: '127.0.0.1',
      port: 18088,
      'access-token': accessToken,
      restricted: true,
    },
  };
}

function downloadXmrigConfig(configuration: MiningConfiguration) {
  const json = JSON.stringify(makeXmrigConfig(configuration), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `web3intel-xmrig-${configuration.id}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MiningDeviceStatistics({ deviceId }: { deviceId: number }) {
  const statistics = useGetMiningDeviceStatistics(deviceId, {
    query: { queryKey: getGetMiningDeviceStatisticsQueryKey(deviceId), refetchInterval: 30_000 },
  });
  if (statistics.isLoading) return <div className="mine-history-loading" role="status"><span className="mine-skeleton" /><span className="mine-skeleton" /><span className="mine-skeleton" /></div>;
  if (statistics.isError) return <QueryError message="Device activity history could not be loaded." retry={() => statistics.refetch()} />;
  if (!statistics.data?.length) return <div className="mine-history-empty">No reported activity history is available for this device.</div>;
  return <ol className="mine-history-list">
    {statistics.data.map((stat: MiningStatistic) => <li key={stat.id} className="mine-history-item">
      <div className="mine-history-time">{displayDate(stat.recordedAt)}</div>
      <div className="mine-history-metrics">
        <span><small>Device-reported hashrate</small><strong>{formatHashrate(stat.hashrate)}</strong></span>
        <span><small>Accepted / rejected shares</small><strong>{stat.acceptedShares.toLocaleString()} / {stat.rejectedShares.toLocaleString()}</strong></span>
        <span><small>Reported uptime</small><strong>{formatUptime(stat.uptime)}</strong></span>
      </div>
      <div className="mine-history-meta">
        <span>{stat.source === 'device_reported' ? 'Device-reported' : stat.source}</span>
        <span className="mine-status warn">{stat.verificationStatus === 'awaiting_pool_verification' ? 'Awaiting pool verification' : stat.verificationStatus}</span>
      </div>
    </li>)}
  </ol>;
}

function DeviceRow({ device, onDisconnect, onRevoke, busy }: { device: MiningDevice; onDisconnect: (device: MiningDevice) => void; onRevoke: (device: MiningDevice) => void; busy: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return <>
    <tr>
      <td><div className="mine-device-name">{device.deviceName}</div><div className="mine-secondary">{osLabel(device.operatingSystem)}{device.cpuModel ? ` · ${device.cpuModel}` : ''}</div></td>
      <td><span className={`mine-status ${device.status === 'connected' ? '' : 'off'}`}>{device.status}</span></td>
      <td><span className="mine-mono">{formatHashrate(device.hashrate)}</span><div className="mine-secondary">Device-reported</div></td>
      <td><span className="mine-status warn">Awaiting pool verification</span></td>
      <td><span className="mine-mono">{device.acceptedShares.toLocaleString()} / {device.rejectedShares.toLocaleString()}</span><div className="mine-secondary">Accepted / rejected · device-reported</div><div className="mine-secondary">Uptime {formatUptime(device.uptime)}</div></td>
      <td><div className="mine-inline-actions">
        <button className="mine-button" type="button" disabled={busy || device.status !== 'connected'} onClick={() => onDisconnect(device)} aria-label={`Disconnect ${device.deviceName}`}><Unplug /> Disconnect</button>
        <button className="mine-button danger" type="button" disabled={busy || device.status === 'revoked'} onClick={() => onRevoke(device)} aria-label={`Revoke ${device.deviceName}`}><LockKeyhole /> Revoke</button>
      </div></td>
    </tr>
    <tr className="mine-history-row"><td colSpan={6}>
      <button className="mine-history-toggle" type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
        <Activity size={13} /> {historyOpen ? 'Hide activity history' : 'View activity history'}
      </button>
      {historyOpen && <MiningDeviceStatistics deviceId={device.id} />}
    </td></tr>
  </>;
}

function CostEstimator() {
  const [hashrate, setHashrate] = useState('');
  const [gross, setGross] = useState('');
  const [rate, setRate] = useState('');
  const [watts, setWatts] = useState('');
  const [fees, setFees] = useState('');
  const estimate = useMemo(() => {
    const hashrateValue = Number(hashrate);
    const grossValue = Number(gross);
    const pricePerKwh = Number(rate);
    const powerWatts = Number(watts);
    const feePercent = Number(fees);
    const values = [hashrateValue, grossValue, pricePerKwh, powerWatts, feePercent];
    if ([hashrate, gross, rate, watts, fees].some((value) => value.trim() === '') || values.some((value) => !Number.isFinite(value) || value < 0) || feePercent > 100) return null;
    const dailyElectricityCost = (powerWatts * 24 / 1000) * pricePerKwh;
    const dailyPoolFee = grossValue * feePercent / 100;
    return { hashrate: hashrateValue, gross: grossValue, dailyElectricityCost, dailyPoolFee, net: grossValue - dailyElectricityCost - dailyPoolFee };
  }, [hashrate, gross, rate, watts, fees]);
  return <Panel title="Cost estimator" subtitle="User-entered assumptions only. This estimate is not mining income data or a profitability forecast." index="ESTIMATE ONLY">
    <div className="mine-form">
      <div className="mine-form-grid">
        <label className="mine-field">Estimated hashrate · H/s
          <input className="mine-input" type="number" min="0" step="any" inputMode="decimal" value={hashrate} onChange={(event) => setHashrate(event.target.value)} placeholder="Enter your estimate" />
        </label>
        <label className="mine-field">Gross estimated revenue per day · USD
          <input className="mine-input" type="number" min="0" step="any" inputMode="decimal" value={gross} onChange={(event) => setGross(event.target.value)} placeholder="Enter your estimate" />
        </label>
        <label className="mine-field">Electricity rate · USD / kWh
          <input className="mine-input" type="number" min="0" step="any" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Enter your rate" />
        </label>
        <label className="mine-field">Power consumption · watts
          <input className="mine-input" type="number" min="0" step="any" inputMode="decimal" value={watts} onChange={(event) => setWatts(event.target.value)} placeholder="Enter your estimate" />
        </label>
        <label className="mine-field">Pool / other fee · percent
          <input className="mine-input" type="number" min="0" max="100" step="any" inputMode="decimal" value={fees} onChange={(event) => setFees(event.target.value)} placeholder="Enter fee percentage" />
        </label>
      </div>
      <div className="mine-estimate-result" aria-live="polite">
        <div className="mine-index">ESTIMATED NET · PER DAY</div>
        <strong>{estimate ? dollars(estimate.net) : 'Enter all five values'}</strong>
        {estimate && <small>At user-entered estimated hashrate {formatHashrate(estimate.hashrate)} and gross revenue {dollars(estimate.gross)}/day. Estimated daily electricity {dollars(estimate.dailyElectricityCost)} · estimated fee {dollars(estimate.dailyPoolFee)}. Hardware wear, cooling, downtime, taxes, and price changes are not included.</small>}
        {!estimate && <small>Formula: (watts × 24 ÷ 1,000) × electricity price; gross daily estimate minus daily energy cost and gross × fee percent. No live or generated earning data is fetched.</small>}
      </div>
    </div>
  </Panel>;
}

export function MiningDashboardPage() {
  const dashboard = useGetMiningDashboard({ query: { queryKey: getGetMiningDashboardQueryKey(), refetchInterval: 30_000 } });
  const createConfiguration = useCreateMiningConfiguration();
  const createPairingCode = useCreateMiningPairingCode();
  const disconnectDevice = useDisconnectMiningDevice();
  const revokeDevice = useRevokeMiningDevice();
  const revokeConsent = useRevokeMiningConsent();
  const invalidate = useMiningInvalidation();
  const [form, setForm] = useState<MiningConfigDraft>(defaultConfigForm);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [pairingOs, setPairingOs] = useState<MiningOperatingSystem>('windows_10_11');
  const [pairingResult, setPairingResult] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const [pairingCopied, setPairingCopied] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState('');
  const [consentRevoked, setConsentRevoked] = useState(false);

  const configurations = dashboard.data?.configurations ?? [];
  const devices = dashboard.data?.devices ?? [];
  const selectedConfiguration = configurations.find((configuration) => configuration.id === selectedConfigId);
  const saving = createConfiguration.isPending;
  const deviceActionPending = disconnectDevice.isPending || revokeDevice.isPending;

  useEffect(() => {
    if (!pairingResult) return;
    const remaining = new Date(pairingResult.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setPairingResult(null);
      return;
    }
    const timeout = window.setTimeout(() => setPairingResult(null), remaining);
    return () => window.clearTimeout(timeout);
  }, [pairingResult]);

  const submitConfiguration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');
    setSuccess('');
    if (!form.consentAccepted) {
      setLocalError('Explicit opt-in consent is required before saving this configuration.');
      return;
    }
    const payload: MiningConfigurationInput = {
      ...form,
      consentAccepted: true,
      poolHost: form.poolHost.trim(),
      walletAddress: form.walletAddress.trim(),
    };
    createConfiguration.mutate({ data: payload }, {
      onSuccess: async (configuration) => {
        setSelectedConfigId(configuration.id);
        setConsentRevoked(false);
        setSuccess('Configuration saved with your opt-in consent. It has not started a miner.');
        setForm((current) => ({ ...current, poolHost: '', poolPort: 0, walletAddress: '', consentAccepted: false }));
        await invalidate();
      },
    });
  };

  const requestPairingCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');
    setSuccess('');
    setPairingResult(null);
    setPairingCopied(false);
    if (consentRevoked || !selectedConfiguration) {
      setLocalError(consentRevoked ? 'Save a new configuration with explicit consent before requesting a pairing code.' : 'Save and select a configuration before requesting a pairing code.');
      return;
    }
    createPairingCode.mutate({ data: { configurationId: selectedConfiguration.id, deviceName: deviceName.trim(), operatingSystem: pairingOs } }, {
      onSuccess: (result) => setPairingResult(result),
    });
  };

  const disconnect = (device: MiningDevice) => {
    if (!window.confirm(`Disconnect ${device.deviceName}? This invalidates its current monitor credential. You can pair the device again later.`)) return;
    setLocalError('');
    setSuccess('');
    disconnectDevice.mutate({ deviceId: device.id }, {
      onSuccess: async () => { setSuccess(`${device.deviceName} was disconnected.`); await invalidate(false, [device.id]); },
    });
  };
  const revoke = (device: MiningDevice) => {
    if (!window.confirm(`Permanently revoke ${device.deviceName}? Its current pairing credential will no longer work.`)) return;
    setLocalError('');
    setSuccess('');
    revokeDevice.mutate({ deviceId: device.id }, {
      onSuccess: async () => { setSuccess(`${device.deviceName} was revoked.`); await invalidate(false, [device.id]); },
    });
  };
  const revokeAllConsent = () => {
    if (!window.confirm('Revoke your mining consent? This invalidates connected device credentials. This action does not uninstall or stop software on your computer.')) return;
    setLocalError('');
    setSuccess('');
    revokeConsent.mutate(undefined, {
      onSuccess: async () => {
        setConsentRevoked(true);
        setSelectedConfigId(null);
        setPairingResult(null);
        setSuccess('Mining consent was revoked. Connected monitor credentials are invalidated; manage local software separately.');
        await invalidate(false, devices.map((device) => device.id));
      },
    });
  };
  const copyCode = async () => {
    if (!pairingResult) return;
    try {
      await navigator.clipboard.writeText(pairingResult.pairingCode);
      setPairingCopied(true);
    } catch {
      setLocalError('Clipboard access was unavailable. Select and copy the pairing code manually.');
    }
  };

  const mutationError = localError ||
    (createConfiguration.isError ? 'The configuration could not be saved. Check the values and try again.' : '') ||
    (createPairingCode.isError ? 'A pairing code could not be created. The selected configuration may no longer be available.' : '') ||
    (disconnectDevice.isError ? 'The device could not be disconnected. Retry the action.' : '') ||
    (revokeDevice.isError ? 'The device credential could not be revoked. Retry the action.' : '') ||
    (revokeConsent.isError ? 'Consent could not be revoked. Retry the action.' : '');

  return <div className="mining-root">
    <main className="mining-page">
      <div className="mine-topline"><span>WEB3INTEL / PRIVATE WORKSPACE</span><nav aria-label="Mining references"><Link className="mine-link" href="/mining/guide">Security and setup guide <ArrowUpRight size={13} /></Link></nav></div>
      <SectionHeading eyebrow="OPTIONAL LOCAL MONITOR / 01" title="Mining dashboard" description="Manage configurations and monitor devices you have explicitly paired. Web3Intel does not install, start, stop, or control XMRig." updatedAt={dashboard.data?.updatedAt} />
      {mutationError && <div className="mine-alert" role="alert"><CircleAlert /><span>{mutationError}</span></div>}
      {success && <div className="mine-note success" role="status"><CheckCircle2 /><div>{success}</div></div>}
      {dashboard.isLoading ? <LoadingCards count={3} /> :
        dashboard.isError || !dashboard.data ? <QueryError message="Your mining dashboard could not be loaded. Sign in again if your session has expired." retry={() => dashboard.refetch()} /> :
          <>
            <div className="mine-stat-grid">
              <div className="mine-panel mine-stat"><div className="mine-stat-label">Paired devices <HardDrive size={14} /></div><div className="mine-stat-value">{devices.length}</div><div className="mine-stat-note">{dashboard.data.onlineDevices} currently connected · server-reported status</div></div>
              <div className="mine-panel mine-stat"><div className="mine-stat-label">Device reports <Activity size={14} /></div><div className="mine-stat-value">{dashboard.data.currentReportedHashrate === null ? '—' : formatHashrate(dashboard.data.currentReportedHashrate)}</div><div className="mine-stat-note">Device-reported only. Awaiting pool verification.</div></div>
              <div className="mine-panel mine-stat"><div className="mine-stat-label">Share reports <Gauge size={14} /></div><div className="mine-stat-value">{dashboard.data.acceptedShares.toLocaleString()} / {dashboard.data.rejectedShares.toLocaleString()}</div><div className="mine-stat-note">Accepted / rejected · reported by paired devices</div></div>
            </div>
            <Note tone="warning"><strong>Verification boundary.</strong> Telemetry is reported by your device and remains <strong>Awaiting pool verification</strong>. It is not verified hashrate, pool earnings, or a rewards balance.</Note>
            <Panel title="Selected mining configuration" subtitle="Web3Intel stores setup details; it does not verify pool activity." index="CONFIGURATION">
              {selectedConfiguration ? <div className="mine-config-facts">
                <div><small>Coin</small><strong>Monero (XMR)</strong></div>
                <div><small>Algorithm</small><strong>RandomX · CPU</strong></div>
                <div><small>Connection method</small><strong>{connectionLabel(selectedConfiguration.connectionMethod)}</strong></div>
                <div><small>User-entered endpoint</small><strong>{selectedConfiguration.poolHost}:{selectedConfiguration.poolPort}</strong></div>
                <div><small>TLS</small><strong>{selectedConfiguration.tlsEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              </div> : <div className="mine-empty"><Cpu /><div><strong>No configuration selected</strong>Choose a saved configuration in Local install / launch, or save a new one.</div></div>}
              <div className="mine-reward-boundary"><ShieldCheck size={15} /><span>Estimated and actual pool rewards are unavailable until a real pool integration exists. Device telemetry remains Awaiting pool verification.</span></div>
            </Panel>
            <div className="mine-two-col" style={{ marginTop: 14 }}>
              <Panel title="Saved configuration" subtitle="Create a local XMRig configuration using values you supply." index="OPT-IN SETUP">
                <form className="mine-form" onSubmit={submitConfiguration}>
                  <div className="mine-form-grid">
                    <label className="mine-field">Connection method
                      <select className="mine-select" value={form.connectionMethod} onChange={(event) => setForm((current) => ({ ...current, connectionMethod: event.target.value as MiningConfigurationInput['connectionMethod'] }))}>
                        <option value="pool">Pool</option><option value="solo">Solo node</option><option value="p2pool">P2Pool</option>
                      </select>
                    </label>
                    <label className="mine-field">Operating system
                      <select className="mine-select" value={form.operatingSystem} onChange={(event) => setForm((current) => ({ ...current, operatingSystem: event.target.value as MiningOperatingSystem }))}>
                        {operatingSystems.map((os) => <option key={os.value} value={os.value}>{os.label}</option>)}
                      </select>
                    </label>
                    <label className="mine-field">Pool or node host
                      <input className="mine-input" required maxLength={253} value={form.poolHost} onChange={(event) => setForm((current) => ({ ...current, poolHost: event.target.value }))} placeholder="Enter the host you selected" autoComplete="off" />
                    </label>
                    <label className="mine-field">Port
                      <input className="mine-input" type="number" required min={1} max={65535} step={1} value={form.poolPort || ''} onChange={(event) => setForm((current) => ({ ...current, poolPort: Number(event.target.value) }))} placeholder="Enter the port" inputMode="numeric" />
                    </label>
                    <div className="mine-field wide">
                      <a className="mine-link" href="https://miningpoolstats.stream/monero" target="_blank" rel="noreferrer">Browse the independent Monero pool directory <ExternalLink size={13} /></a>
                      <small>Choose and verify your own endpoint. Fees, payout thresholds, availability, and payment terms vary by provider; Web3Intel does not endorse or validate pool listings.</small>
                    </div>
                    <label className="mine-field wide">Public Monero wallet address
                      <input className="mine-input" required minLength={95} maxLength={106} value={form.walletAddress} onChange={(event) => setForm((current) => ({ ...current, walletAddress: event.target.value }))} placeholder="Public address only" autoComplete="off" spellCheck={false} />
                      <small>Use only a public receiving address. Never enter a seed phrase, private key, or wallet password.</small>
                    </label>
                    <label className="mine-field">Resource profile
                      <select className="mine-select" value={form.profile} onChange={(event) => {
                        const profile = event.target.value as MiningProfile;
                        const preset = profiles.find((item) => item.value === profile);
                        setForm((current) => ({ ...current, profile, cpuThreadLimit: preset?.threads ?? current.cpuThreadLimit }));
                      }}>
                        {profiles.map((profile) => <option key={profile.value} value={profile.value}>{profile.label} — {profile.copy}</option>)}
                      </select>
                    </label>
                    <label className="mine-field">CPU resource / thread hint percentage · 1–100
                      <input className="mine-input" type="number" required min={1} max={100} step={1} value={form.cpuThreadLimit} onChange={(event) => setForm((current) => ({ ...current, cpuThreadLimit: Number(event.target.value), profile: 'custom' }))} inputMode="numeric" />
                      <small>This sets XMRig's max-threads hint, not measured CPU utilization. Eco 25, Balanced 50, and Performance 75 are hints, not guaranteed usage.</small>
                    </label>
                  </div>
                  <div className="mine-check-row">
                    <label className="mine-checkbox"><input type="checkbox" checked={form.tlsEnabled} onChange={(event) => setForm((current) => ({ ...current, tlsEnabled: event.target.checked }))} /><span>Use TLS for the pool / node connection if supported by the endpoint I entered.</span></label>
                  </div>
                  <div className="mine-note warning"><AlertTriangle /><div><strong>Explicit opt-in required.</strong> Saving only stores your configuration. It does not install software or begin mining. You are responsible for the device, connection, power use, and local rules.</div></div>
                  <label className="mine-checkbox"><input type="checkbox" required checked={form.consentAccepted} onChange={(event) => setForm((current) => ({ ...current, consentAccepted: event.target.checked }))} /><span>I explicitly consent to save this Monero mining configuration for my account. I understand that Web3Intel does not mine for me, and I can revoke consent and device credentials later.</span></label>
                  <button className="mine-button primary" type="submit" disabled={saving || !form.consentAccepted}><Check /> {saving ? 'Saving configuration…' : 'Save consented configuration'}</button>
                  {createConfiguration.isSuccess && !success && <div className="mine-note success" role="status"><CheckCircle2 /><div>Configuration saved. Continue only if you choose to install XMRig locally.</div></div>}
                </form>
              </Panel>
              <div className="mine-surface-grid">
                <Panel title="Local install / launch" subtitle="Manual steps only. You control every local action." index="ON YOUR DEVICE">
                  <div className="mine-form">
                    <Note><strong>Web3Intel does not install, launch, or manage XMRig.</strong> Download XMRig from its official publisher source, review its instructions, and launch it manually with the JSON file you download below. The file sets background and autosave off and does not create an operating-system startup task.</Note>
                    <label className="mine-field">Choose a saved configuration
                      <select className="mine-select" value={selectedConfiguration?.id ?? ''} onChange={(event) => setSelectedConfigId(Number(event.target.value) || null)} disabled={configurations.length === 0}>
                        {configurations.length === 0 && <option value="">No saved configurations</option>}
                        {configurations.length > 0 && <option value="">Select a saved configuration</option>}
                        {configurations.map((configuration) => <option value={configuration.id} key={configuration.id}>{connectionLabel(configuration.connectionMethod)} · {configuration.poolHost}:{configuration.poolPort} · {configuration.profile}</option>)}
                      </select>
                    </label>
                    <button className="mine-button" type="button" disabled={!selectedConfiguration} onClick={() => selectedConfiguration && downloadXmrigConfig(selectedConfiguration)}><Download /> Download local XMRig JSON</button>
                    <ol className="mine-faq-list">
                      <li className="mine-faq"><h3>1. Download XMRig</h3><p>Choose the official release for your operating system and review the release and security notes before running it. Do not bypass security warnings.</p></li>
                      <li className="mine-faq"><h3>2. Place the JSON file beside XMRig</h3><p>Keep the generated file private to your machine. It contains a local API access token and your public wallet address. Rename it to <code>config.json</code> for the example launch command, or use the filename you downloaded.</p></li>
                      <li className="mine-faq"><h3>3. Launch it yourself</h3><p>Windows desktop / laptop: extract the official archive, open PowerShell in the XMRig folder, then run <code>.\xmrig.exe --config=config.json</code>. Linux desktop / server: extract the official archive, open a terminal in the XMRig folder, then run <code>./xmrig --config=config.json</code>. Stop it from your local terminal or operating system when you choose.</p></li>
                    </ol>
                    <div className="mine-official-links">
                      <a className="mine-link" href="https://xmrig.com/download" target="_blank" rel="noreferrer">Official XMRig downloads <ExternalLink size={13} /></a>
                      <a className="mine-link" href="https://xmrig.com/docs/miner/config" target="_blank" rel="noreferrer">Official config documentation <ExternalLink size={13} /></a>
                      <a className="mine-link" href="https://web.getmonero.org/get-started/mining/" target="_blank" rel="noreferrer">Official Monero mining instructions <ExternalLink size={13} /></a>
                      <a className="mine-link" href="https://miningpoolstats.stream/monero" target="_blank" rel="noreferrer">Independent pool directory <ExternalLink size={13} /></a>
                    </div>
                  </div>
                </Panel>
                <CostEstimator />
              </div>
            </div>
            <Panel title="One-time device pairing" subtitle="Pairing only happens after you explicitly request a code for a saved configuration and named device." index="OPTIONAL · REVOCABLE" className="" >
              <form className="mine-form" onSubmit={requestPairingCode}>
                <div className="mine-note"><LockKeyhole /><div>The standalone monitor reads local XMRig statistics only and sends device-reported telemetry. It does not install, start, stop, or control XMRig. Pairing credentials are revocable. A pairing code is short-lived, shown only in this page session, and is not saved by this interface.</div></div>
                {configurations.length === 0 ? <div className="mine-empty"><Cpu /><div><strong>Save a configuration first</strong>Pairing is only available for a configuration you have saved.</div></div> : <>
                  <div className="mine-form-grid">
                    <label className="mine-field">Configuration
                      <select className="mine-select" value={selectedConfiguration?.id ?? ''} onChange={(event) => { setSelectedConfigId(Number(event.target.value) || null); setPairingResult(null); }}>
                        <option value="">Select a saved configuration</option>
                        {configurations.map((configuration) => <option value={configuration.id} key={configuration.id}>{connectionLabel(configuration.connectionMethod)} · {configuration.poolHost}:{configuration.poolPort}</option>)}
                      </select>
                    </label>
                    <label className="mine-field">Device name
                      <input className="mine-input" required minLength={1} maxLength={80} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="A name for this computer" />
                    </label>
                    <label className="mine-field">Device operating system
                      <select className="mine-select" value={pairingOs} onChange={(event) => setPairingOs(event.target.value as MiningOperatingSystem)}>
                        {operatingSystems.map((os) => <option key={os.value} value={os.value}>{os.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <button className="mine-button primary" type="submit" disabled={createPairingCode.isPending || !selectedConfiguration || consentRevoked}><LockKeyhole /> {createPairingCode.isPending ? 'Creating one-time code…' : 'Create pairing code'}</button>
                </>}
                {pairingResult && <div className="mine-panel" role="status" style={{ padding: 15 }}>
                  <div className="mine-index">ONE-TIME PAIRING CODE · SHARE ONLY WITH YOUR OWN DEVICE</div>
                  <output className="mine-code" aria-label="One-time pairing code">{pairingResult.pairingCode}</output>
                  <div className="mine-code-expiry">Expires {displayDate(pairingResult.expiresAt)} · code is held in memory only</div>
                  <div className="mine-button-row" style={{ marginTop: 12 }}>
                    <button className="mine-button" type="button" onClick={() => void copyCode()}><Copy /> {pairingCopied ? 'Copied' : 'Copy code'}</button>
                    <span className="mine-secondary">Enter it only into the Web3Intel monitor on the device you control.</span>
                  </div>
                  <div className="mine-faq" style={{ marginTop: 12 }}>
                    <h3>Run the standalone monitor yourself</h3>
                    <p>Download the monitor script, install a current Node.js release yourself, and place the script beside your XMRig JSON. From that folder, run <code>node web3intel-mining-agent.mjs --server https://your-web3intel-site --config ./config.json</code>, replacing the server value with the HTTPS origin where you use Web3Intel. When prompted, paste this one-time code. The script only reads the local XMRig API and reports telemetry; it does not install, launch, stop, or control XMRig.</p>
                    <a className="mine-link" href="/web3intel-mining-agent.mjs" download>Download monitor script <Download size={13} /></a>
                  </div>
                </div>}
              </form>
            </Panel>
            <Panel title="Paired devices" subtitle="Telemetry values originate from the paired device; pool verification is not available." index={`${devices.length} DEVICE${devices.length === 1 ? '' : 'S'}`}>
              {devices.length === 0 ? <div className="mine-empty"><HardDrive /><div><strong>No paired devices yet</strong>Save a configuration, then create a one-time code only when you are ready to pair a device.</div></div> :
                <div className="mine-table-wrap"><table className="mine-table"><thead><tr><th>Device</th><th>Status</th><th>Hashrate</th><th>Verification</th><th>Shares</th><th>Actions</th></tr></thead><tbody>
                  {devices.map((device) => <DeviceRow key={device.id} device={device} onDisconnect={disconnect} onRevoke={revoke} busy={deviceActionPending} />)}
                </tbody></table></div>}
              {devices.length > 0 && <p className="mine-secondary" style={{ marginTop: 12 }}>Last device report: {displayDate(devices.reduce<string | null>((latest, device) => device.lastHeartbeat && (!latest || device.lastHeartbeat > latest) ? device.lastHeartbeat : latest, null))}. All telemetry is device-reported and Awaiting pool verification.</p>}
            </Panel>
            <div className="mine-panel" style={{ padding: 18, marginTop: 14 }}>
              <div className="mine-panel-title">Revoke mining consent</div>
              <div className="mine-panel-subtitle">Revokes account consent and invalidates connected monitor credentials. This cannot stop or uninstall local software.</div>
              <button className="mine-button danger" type="button" style={{ marginTop: 13 }} disabled={revokeConsent.isPending} onClick={revokeAllConsent}><LockKeyhole /> {revokeConsent.isPending ? 'Revoking consent…' : 'Revoke consent and device credentials'}</button>
            </div>
          </>}
    </main>
  </div>;
}

export function MiningGuidePage() {
  return <div className="mining-root">
    <main className="mining-page">
      <div className="mine-topline"><span>WEB3INTEL / FIELD GUIDE</span><nav aria-label="Mining navigation"><Link className="mine-link" href="/mining">Mining overview <ArrowRight size={13} /></Link><Link className="mine-link" href="/dashboard/mining">Dashboard <ArrowUpRight size={13} /></Link></nav></div>
      <SectionHeading eyebrow="SECURITY / CONSENT / OPERATIONS" title="A careful local setup." description="A practical guide to the optional Monero monitor: what it does, what it cannot verify, and what to check when your own device reports an issue." />
      <nav className="mine-guide-nav" aria-label="Guide sections">
        <a href="#consent">Consent & data</a><a href="#setup">Local setup</a><a href="#security">Security</a><a href="#troubleshooting">Troubleshooting</a><a href="#costs">Costs & verification</a>
      </nav>
      <div className="mine-two-col">
        <div className="mine-surface-grid">
          <section className="mine-panel" id="consent">
            <div className="mine-panel-head"><div><div className="mine-panel-title">01 · Consent and boundaries</div><div className="mine-panel-subtitle">This is opt-in monitoring, not a hosted mining service.</div></div><span className="mine-index">READ FIRST</span></div>
            <div className="mine-body mine-form">
              <p className="mine-panel-subtitle">Saving a configuration requires an explicit checkbox. Web3Intel stores the submitted public wallet address and pool/node configuration for your account. It does not receive your wallet secrets. Never submit seed phrases, private keys, passwords, or recovery codes.</p>
              <Note tone="warning"><strong>Mining runs only where you manually install and launch XMRig.</strong> The browser does not mine, and Web3Intel does not install, start, stop, or manage XMRig on any machine.</Note>
              <p className="mine-panel-subtitle">If you create a pairing code, it is one-time and expires at the displayed time. The standalone monitor uses it to pair this device; its resulting credential is revocable from your dashboard. The monitor reads the restricted local XMRig API and reports device telemetry. A report is not pool proof.</p>
            </div>
          </section>
          <section className="mine-panel" id="setup">
            <div className="mine-panel-head"><div><div className="mine-panel-title">02 · Local setup, by choice</div><div className="mine-panel-subtitle">Review each value before running software on your computer.</div></div><span className="mine-index">USER CONTROLLED</span></div>
            <div className="mine-body">
              <div className="mine-step-band">
                <article className="mine-step"><div className="mine-step-number">A</div><h3>Choose your endpoint</h3><p>Enter the host and port from a pool or node you have independently selected. Web3Intel does not supply or invent endpoints.</p></article>
                <article className="mine-step"><div className="mine-step-number">B</div><h3>Generate a local file</h3><p>Save with explicit consent, then download the generated XMRig JSON. Review the file; it includes a local-only restricted API token.</p></article>
                <article className="mine-step"><div className="mine-step-number">C</div><h3>Install manually</h3><p>Use the official XMRig release and documentation for your OS. Launch and stop it using its own instructions.</p></article>
              </div>
              <p className="mine-panel-subtitle" style={{ marginTop: 14 }}>The optional standalone monitor is a separate script. It pairs with an explicit one-time code and only reads local XMRig telemetry. It does not install, launch, stop, or control the miner.</p>
              <a className="mine-link" href="/web3intel-mining-agent.mjs" download>Download Web3Intel monitor script <Download size={13} /></a>
            </div>
          </section>
          <section className="mine-panel" id="security">
            <div className="mine-panel-head"><div><div className="mine-panel-title">03 · Security and revocation</div><div className="mine-panel-subtitle">Treat configuration files and pairing codes as sensitive.</div></div><span className="mine-index">LOCAL API</span></div>
            <div className="mine-body mine-form">
              <div className="mine-faq-list">
                <article className="mine-faq"><h3>Local API scope</h3><p>The generated JSON binds XMRig's monitoring API to loopback (127.0.0.1), uses a generated access token, and enables the restricted mode. Keep the JSON on the device you control and do not publish it.</p></article>
                <article className="mine-faq"><h3>Pairing credential</h3><p>Only generate a pairing code when ready to pair the named device. Never post it in a public channel. Disconnect or revoke the device, or revoke your consent, to invalidate credentials server-side.</p></article>
                <article className="mine-faq"><h3>Security software alerts</h3><p>Mining software may be flagged by security products. Do not disable antivirus or bypass a warning. Stop, do not run the file, verify the publisher and release, review the alert with your security provider, and remove the file if you cannot establish that it is safe.</p></article>
                <article className="mine-faq"><h3>Public wallet address</h3><p>Wallet addresses are public identifiers but can reveal activity. Use an address you are comfortable associating with this configuration. No secret wallet material is needed.</p></article>
              </div>
            </div>
          </section>
        </div>
        <aside className="mine-surface-grid">
          <section className="mine-panel" id="troubleshooting">
            <div className="mine-panel-head"><div><div className="mine-panel-title">Troubleshooting</div><div className="mine-panel-subtitle">Start with the local application and endpoint.</div></div><span className="mine-index">CHECKLIST</span></div>
            <div className="mine-body">
              <div className="mine-faq-list">
                <article className="mine-faq"><h3>Configuration rejected</h3><p>Confirm the host, port, public wallet address length, OS selection, and CPU limit. The endpoint and address must be yours to use.</p></article>
                <article className="mine-faq"><h3>No device telemetry</h3><p>Confirm XMRig is already running manually, its local API is enabled and restricted to loopback, the JSON file was not altered, and the monitor script is running on the same machine.</p></article>
                <article className="mine-faq"><h3>No accepted shares</h3><p>Check the miner console for a successful connection, verify the endpoint details and wallet address with the pool or node operator, and allow for that service’s share difficulty and payout rules. Device-reported share counts are not pool verification.</p></article>
                <article className="mine-faq"><h3>CPU not detected or memory warning</h3><p>Review the official XMRig requirements for your operating system and processor, confirm the system has adequate memory for RandomX, and check the XMRig console for the specific hardware error. Do not bypass system security protections.</p></article>
                <article className="mine-faq"><h3>High temperature or system slowdown</h3><p>Reduce the configured CPU thread hint or stop XMRig manually from your terminal or operating system. Check temperatures and power draw with trusted local tools; Web3Intel cannot throttle or stop local software.</p></article>
                <article className="mine-faq"><h3>Pairing code expired or failed</h3><p>Return to the dashboard and create a fresh code for the saved configuration and device. Each code is one-time and expires. Keep the code private.</p></article>
                <article className="mine-faq"><h3>Device is disconnected or revoked</h3><p>Check the dashboard status. A disconnected or revoked credential may require a new pairing code. Consent revocation invalidates connected monitor credentials.</p></article>
                <article className="mine-faq"><h3>Connection or TLS problem</h3><p>Verify the pool/node host, port, and TLS setting against that endpoint's own instructions. Web3Intel cannot validate third-party endpoint availability.</p></article>
                <article className="mine-faq"><h3>Unexpected software warning</h3><p>Do not disable antivirus. Stop and investigate through your security provider and the official XMRig project materials. Do not run software you cannot verify.</p></article>
              </div>
            </div>
          </section>
          <section className="mine-panel" id="costs">
            <div className="mine-panel-head"><div><div className="mine-panel-title">Costs and verification</div><div className="mine-panel-subtitle">No mining profitability is measured by Web3Intel.</div></div><span className="mine-index">ESTIMATES ONLY</span></div>
            <div className="mine-body mine-form">
              <Note tone="warning"><strong>Device-reported telemetry is not pool verification.</strong> Every device report remains Awaiting pool verification. No verified hashrate or rewards are displayed.</Note>
              <p className="mine-panel-subtitle">Estimate energy cost from your own meter or hardware estimate and local electricity rate. Revenue, fees, market value, hardware wear, cooling, uptime, and tax treatment can change. Any net figure is a user-entered estimate, not a recommendation or promise.</p>
              <Link className="mine-button" href="/dashboard/mining"><Wallet /> Open mining dashboard <ArrowRight /></Link>
            </div>
          </section>
          <div className="mine-disclaimer"><strong>Operational safety:</strong> monitor device temperature and power draw using your own trusted tools. Stop local processes through your operating system if you need to. Web3Intel cannot manage local hardware or recover a wallet.</div>
        </aside>
      </div>
    </main>
  </div>;
}

function AdminDeviceRow({ device, busy, onSuspend }: { device: AdminMiningDevice; busy: boolean; onSuspend: (device: AdminMiningDevice) => void }) {
  return <tr>
    <td><div className="mine-device-name">{device.deviceName}</div><div className="mine-secondary">{osLabel(device.operatingSystem)}</div></td>
    <td><span className="mine-mono">{device.userId}</span></td>
    <td><span className={`mine-status ${device.status === 'connected' ? '' : 'off'}`}>{device.status}</span></td>
    <td><span className="mine-mono">{formatHashrate(device.hashrate)}</span><div className="mine-secondary">Device-reported</div></td>
    <td><span className="mine-status warn">Awaiting pool verification</span></td>
    <td><span className="mine-mono">{displayDate(device.lastHeartbeat)}</span></td>
    <td><button className="mine-button danger" type="button" disabled={busy || device.status === 'suspended' || device.status === 'revoked'} onClick={() => onSuspend(device)}><LockKeyhole /> Suspend</button></td>
  </tr>;
}

export function AdminMiningPage() {
  const overview = useGetAdminMiningOverview({ query: { queryKey: getGetAdminMiningOverviewQueryKey() } });
  const updateEngine = useUpdateAdminMiningEngine();
  const suspendDevice = useSuspendAdminMiningDevice();
  const invalidate = useMiningInvalidation();
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [filter, setFilter] = useState('');

  const updateToggle = (field: 'engineEnabled' | 'moneroEnabled', value: boolean) => {
    setActionError('');
    setActionSuccess('');
    const data = field === 'engineEnabled' ? { engineEnabled: value } : { moneroEnabled: value };
    updateEngine.mutate({ data }, {
      onSuccess: async () => {
        setActionSuccess(`${field === 'engineEnabled' ? 'Mining engine' : 'Monero'} setting updated.`);
        await invalidate(true);
      },
      onError: () => setActionError('Engine settings were not changed. The server may have denied this action.'),
    });
  };
  const suspend = (device: AdminMiningDevice) => {
    if (!window.confirm(`Suspend device ${device.deviceName} for account ${device.userId}? Its current credential will be invalidated.`)) return;
    setActionError('');
    setActionSuccess('');
    suspendDevice.mutate({ deviceId: device.id }, {
      onSuccess: async () => {
        setActionSuccess(`${device.deviceName} was suspended.`);
        await invalidate(true);
      },
      onError: () => setActionError('The device could not be suspended. The server may have denied this action.'),
    });
  };

  const forbidden = overview.isError && ApiErrorStatus(overview.error) === 403;
  const allDevices = overview.data?.devices ?? [];
  const visibleDevices = allDevices.filter((device) => `${device.deviceName} ${device.userId} ${device.status}`.toLowerCase().includes(filter.toLowerCase()));

  if (overview.isLoading) return <div className="mining-root"><main className="mining-page"><div className="mine-topline"><span>WEB3INTEL / ADMIN CONTROL ROOM</span></div><SectionHeading eyebrow="SERVER-ENFORCED ACCESS" title="Mining administration" description="Aggregate device state and server-side engine controls." /><LoadingCards count={2} /></main></div>;
  if (overview.isError || !overview.data) return <div className="mining-root"><main className="mining-page">
    <div className="mine-topline"><span>WEB3INTEL / ADMIN CONTROL ROOM</span></div>
    <section className="mine-panel mine-restricted" role="alert">
      <div className="mine-eyebrow">{forbidden ? '403 / FORBIDDEN' : 'ADMIN API / UNAVAILABLE'}</div>
      <h1>{forbidden ? 'Administrator access required.' : 'Administrative role could not be verified.'}</h1>
      <p>{forbidden ? 'The server rejected access to the aggregate mining overview. This page does not bypass server authorization; ask an active administrator to grant the appropriate role.' : 'The admin mining API could not verify access or load its overview. Server-side role enforcement remains authoritative. Retry after confirming your account session.'}</p>
      {!forbidden && <button className="mine-button" style={{ marginTop: 16 }} type="button" onClick={() => overview.refetch()}><RefreshCw /> Retry admin access check</button>}
      <Link className="mine-link" style={{ marginTop: 16 }} href="/mining">Return to public mining page <ArrowRight size={13} /></Link>
    </section>
  </main></div>;

  const engine = overview.data.engine;
  return <div className="mining-root">
    <main className="mining-page">
      <div className="mine-topline"><span>WEB3INTEL / ADMIN CONTROL ROOM</span><nav aria-label="Admin mining references"><Link className="mine-link" href="/mining/guide">Security guide <ArrowUpRight size={13} /></Link></nav></div>
      <SectionHeading eyebrow="SERVER-ENFORCED / ADMIN" title="Mining operations" description="Review aggregate device health, manage the Monero feature flags, and suspend individual external monitor credentials." />
      <div className="mine-admin-intro"><ShieldCheck /><div><strong>Administrative access verified by the protected API.</strong><br />Role checks are enforced by the server for every overview and action. These controls do not start, stop, or manage XMRig on user machines.</div></div>
      {actionError && <div className="mine-alert" role="alert" style={{ marginTop: 13 }}><CircleAlert /><span>{actionError}</span></div>}
      {actionSuccess && <div className="mine-note success" role="status" style={{ marginTop: 13 }}><CheckCircle2 /><div>{actionSuccess}</div></div>}
      <div className="mine-stat-grid">
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Registered devices <HardDrive size={14} /></div><div className="mine-stat-value">{overview.data.totalDevices}</div><div className="mine-stat-note">Aggregate count from the protected admin API</div></div>
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Connected <Activity size={14} /></div><div className="mine-stat-value">{overview.data.connectedDevices}</div><div className="mine-stat-note">Server-reported connection state</div></div>
        <div className="mine-panel mine-stat"><div className="mine-stat-label">Awaiting verification <Shield size={14} /></div><div className="mine-stat-value">{overview.data.awaitingPoolVerification}</div><div className="mine-stat-note">No pool-verified hashrate or rewards</div></div>
      </div>
      <div className="mine-two-col">
        <Panel title="Engine controls" subtitle="Changes are sent to the protected admin API. Availability flags do not run a miner." index="SERVER SETTINGS">
          <div className="mine-admin-controls">
            <label className="mine-admin-toggle"><span><strong>Mining engine enabled</strong><small>Allow configuration flows to be available.</small></span><input type="checkbox" checked={engine.engineEnabled} disabled={updateEngine.isPending} onChange={(event) => updateToggle('engineEnabled', event.target.checked)} aria-label="Enable mining engine" /></label>
            <label className="mine-admin-toggle"><span><strong>Monero enabled</strong><small>Allow the supported Monero configuration.</small></span><input type="checkbox" checked={engine.moneroEnabled} disabled={updateEngine.isPending} onChange={(event) => updateToggle('moneroEnabled', event.target.checked)} aria-label="Enable Monero configuration" /></label>
          </div>
          {updateEngine.isPending && <div className="mine-toggle-pending" role="status" style={{ marginTop: 12 }}>Updating protected server setting…</div>}
          <div className="mine-note" style={{ marginTop: 13 }}><Zap /><div>Public availability is separate from local execution. Web3Intel does not host mining workloads. Server authorization remains the source of truth.</div></div>
        </Panel>
        <Panel title="Engine status" subtitle="Current server configuration state." index="MONERO / RANDOMX">
          <div className="mine-form">
            <div className="mine-check-row"><span>Mining engine</span><span className={`mine-status ${engine.engineEnabled ? '' : 'off'}`}>{engine.engineEnabled ? 'Enabled' : 'Disabled'}</span></div>
            <div className="mine-check-row"><span>Monero</span><span className={`mine-status ${engine.moneroEnabled ? '' : 'off'}`}>{engine.moneroEnabled ? 'Enabled' : 'Disabled'}</span></div>
            <div className="mine-check-row"><span>Algorithm</span><span className="mine-mono">{engine.algorithm}</span></div>
            <div className="mine-check-row"><span>Coin</span><span className="mine-mono">{engine.coin}</span></div>
          </div>
        </Panel>
      </div>
      <Panel title="Aggregate device list" subtitle="Telemetry is device-reported, not independently verified. Device credentials can be suspended here." index={`${visibleDevices.length} SHOWN`} >
        <div className="mine-button-row" style={{ marginBottom: 12 }}>
          <label className="mine-field" style={{ flex: '1 1 230px', maxWidth: 380 }}>Filter devices
            <input className="mine-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Device, account, or status" aria-label="Filter mining devices" />
          </label>
          <button className="mine-button" type="button" onClick={() => overview.refetch()} disabled={overview.isFetching}><RefreshCw /> {overview.isFetching ? 'Refreshing…' : 'Refresh overview'}</button>
        </div>
        {allDevices.length === 0 ? <div className="mine-empty"><Users /><div><strong>No aggregate devices</strong>The protected admin API returned no device records.</div></div> :
          visibleDevices.length === 0 ? <div className="mine-empty"><Users /><div><strong>No matching devices</strong>Adjust the filter to see other records.</div></div> :
            <div className="mine-table-wrap"><table className="mine-table"><thead><tr><th>Device</th><th>Account</th><th>Status</th><th>Hashrate</th><th>Verification</th><th>Last heartbeat</th><th>Action</th></tr></thead><tbody>
              {visibleDevices.map((device) => <AdminDeviceRow key={device.id} device={device} busy={suspendDevice.isPending} onSuspend={suspend} />)}
            </tbody></table></div>}
      </Panel>
      <p className="mine-secondary" style={{ marginTop: 13 }}>Admin access is enforced by the server. Suspend invalidates a device credential; it cannot stop software running on the user's computer.</p>
    </main>
  </div>;
}
