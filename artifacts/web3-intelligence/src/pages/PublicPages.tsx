import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity, ArrowRight, Blocks, ChevronDown, CircleAlert,
  Clock3, Database, ExternalLink, FileText, LoaderCircle, LockKeyhole,
  Newspaper, RefreshCw, ShieldCheck, Waves,
} from 'lucide-react';
import {
  getGetBlockchainStatusQueryKey,
  getGetLatestNewsQueryKey,
} from '@workspace/api-client-react';
import { useGetBlockchainStatus, useGetLatestNews } from '@workspace/api-client-react';
import evidenceBackground from '../../attached_assets/generated_images/section-evidence.png';
import heroAi from '../../attached_assets/generated_images/hero-ai.png';
import heroMarkets from '../../attached_assets/generated_images/hero-markets.png';
import heroWallet from '../../attached_assets/generated_images/hero-wallet.png';

const publicLinks = [
  ['/about', 'About'], ['/blockchain', 'Blockchain'], ['/whales', 'Whale tracker'], ['/markets', 'Markets'],
  ['/wallet-scanner', 'Wallet scanner'], ['/ai-intelligence', 'AI intelligence'],
  ['/airdrops', 'Airdrops'], ['/news', 'News'], ['/forensics', 'Forensics & recovery'], ['/recovery', 'Recovery safety'],
  ['/shop', 'Marketplace'], ['/pricing', 'Pricing'], ['/contact', 'Contact'],
] as const;

const legalLinks = [
  ['/privacy-policy', 'Privacy'], ['/terms', 'Terms'], ['/cookie-policy', 'Cookies'],
  ['/risk-disclosure', 'Risk disclosure'], ['/security-policy', 'Security'],
] as const;

const pageContent: Record<string, {
  eyebrow: string; title: string; intro: string; image: string; status?: string;
  sections: { title: string; body: string }[];
}> = {
  '/about': {
    eyebrow: 'ABOUT / RESEARCH PRINCIPLES',
    title: 'Evidence before certainty.',
    intro: 'Web3 Intelligence is a careful research terminal for people who need to understand what a data provider actually said—and where its limits begin.',
    image: evidenceBackground,
    sections: [
      { title: 'Attribution stays attached', body: 'Market views show the source and the provider update time when those fields are available. Missing data stays missing; the interface does not estimate a replacement.' },
      { title: 'Read-only means read-only', body: 'The wallet scanner always supports manual public-address lookup and optionally accepts an injected EVM or Solana wallet to reveal a public address and active chain. It never requests signatures or initiates transactions.' },
      { title: 'AI is bounded by its snapshot', body: 'Market questions use the snapshot available to the API. The assistant is not presented as a live chain indexer or an investment adviser.' },
    ],
  },
  '/blockchain': {
    eyebrow: 'BLOCKCHAIN / PROVIDER STATUS',
    title: 'A network view, without invented telemetry.',
    intro: 'Network-level explorers and chain health feeds are not connected to this product yet. We do not display sample blocks, transaction counts, or fabricated provider status.',
    image: heroMarkets,
    status: 'No blockchain data provider is currently available',
    sections: [
      { title: 'What is available today', body: 'The public wallet lookup supports native-balance requests on Bitcoin, Ethereum, Solana, Polygon, Tron, Avalanche, TON, and Sui through the configured API provider.' },
      { title: 'What is not connected', body: 'Block height, transaction activity, gas conditions, validators, cross-chain comparisons, network health, whale activity, and complete token or NFT scans are not supplied by the current frontend API.' },
      { title: 'How to continue', body: 'Use the read-only wallet scanner for a supported public-address balance, or inspect the provider-attributed market table. Both surfaces report unavailable responses rather than filling gaps.' },
    ],
  },
  '/whales': {
    eyebrow: 'WHALE INTELLIGENCE / INDEX STATUS',
    title: 'No tracked-wallet dataset is connected.',
    intro: 'This terminal does not have a verified wallet-ranking or transaction-monitoring provider. No addresses, holdings, or whale movements are invented for display.',
    image: heroMarkets,
    status: 'Wallet rankings and live transaction monitoring are unavailable',
    sections: [
      { title: 'No fabricated rankings', body: 'The application does not identify a top 100 wallet list or label public addresses as people or institutions without reliable evidence.' },
      { title: 'No live whale alerts', body: 'Wallet follow lists, monitored transaction feeds, swap classification, and real-time notifications are not connected to this API.' },
      { title: 'Available public lookup', body: 'The wallet scanner can request a native-token balance for an address on a supported network. It does not return a portfolio, token holdings, or transaction history.' },
    ],
  },
  '/airdrops': {
    eyebrow: 'AIRDROPS / INDEX STATUS',
    title: 'No campaign index is connected.',
    intro: 'There is no verified airdrop or campaign provider available in this terminal. We do not list speculative eligibility, deadlines, token values, or example campaigns.',
    image: heroWallet,
    status: 'Campaign listings and eligibility checks are unavailable',
    sections: [
      { title: 'No eligibility claims', body: 'The product cannot inspect wallet history for airdrop qualification. Do not treat third-party claims, links, or token allocations as verified by this terminal.' },
      { title: 'No claim actions', body: 'There are no connect-wallet, sign, or claim flows here. Never share a seed phrase or private key with a campaign site.' },
      { title: 'Provider boundary', body: 'A campaign index and independently verifiable source metadata would be required before listings could be shown.' },
    ],
  },
  '/news': {
    eyebrow: 'NEWS / PUBLICATION STATUS',
    title: 'No news feed is connected.',
    intro: 'This product does not currently have a news index or editorial API. No headlines, publication times, or sentiment labels are presented as current.',
    image: heroAi,
    status: 'News provider integration is unavailable',
    sections: [
      { title: 'No synthetic headlines', body: 'This page intentionally contains no sample stories or placeholder headlines that could be mistaken for reporting.' },
      { title: 'No sentiment feed', body: 'The terminal does not provide news-derived sentiment or event alerts. Market metrics remain separate from editorial interpretation.' },
      { title: 'Where to research', body: 'For the connected market dataset, use Markets and inspect its provider source and update timestamp.' },
    ],
  },
  '/recovery': {
    eyebrow: 'RECOVERY SAFETY / READ THIS FIRST',
    title: 'Recovery starts with protecting access.',
    intro: 'This product has no forensic case intake or recovery-service integration. Be cautious of anyone promising guaranteed recovery or asking for wallet secrets.',
    image: evidenceBackground,
    status: 'Forensics case submissions are not available',
    sections: [
      { title: 'Never share recovery secrets', body: 'A legitimate public balance lookup needs only a public address. Never provide a seed phrase, private key, password, remote-access session, or signing approval to someone offering help.' },
      { title: 'Preserve evidence safely', body: 'Keep original transaction hashes, timestamps, public addresses, and relevant messages. Store copies securely and avoid posting sensitive personal information publicly.' },
      { title: 'Use appropriate channels', body: 'For suspected theft, contact the relevant exchange or wallet provider through its independently verified support channel and consider reporting to local authorities.' },
    ],
  },
  '/forensics': {
    eyebrow: 'BLOCKCHAIN FORENSICS / SERVICE STATUS',
    title: 'No investigation service is connected.',
    intro: 'This product does not currently accept cases, trace stolen funds, or provide recovery services. Blockchain analysis can document movement; it cannot guarantee that assets can be returned.',
    image: evidenceBackground,
    status: 'Forensic case intake and investigator workflows are unavailable',
    sections: [
      { title: 'Tracing is not recovery', body: 'On-chain tracing may help document public transaction paths, but it does not reverse transactions or guarantee cooperation from exchanges, law enforcement, or other parties.' },
      { title: 'Avoid recovery scams', body: 'Be wary of anyone demanding an upfront fee, promising guaranteed recovery, or requesting a seed phrase, private key, password, or remote access.' },
      { title: 'Preserve public evidence', body: 'Keep original transaction hashes, public addresses, timestamps, and relevant communications. For suspected theft, use verified exchange support channels and consider contacting local authorities.' },
    ],
  },
  '/forensics/request': {
    eyebrow: 'FORENSICS / REQUEST STATUS',
    title: 'Investigation requests are not enabled.',
    intro: 'There is no secure case intake, evidence upload, or investigator assignment workflow connected to this application. This page does not collect or submit case details.',
    image: evidenceBackground,
    status: 'No case submission endpoint is available',
    sections: [
      { title: 'Do not submit secrets', body: 'Never send a seed phrase, private key, wallet password, or transaction signature to someone offering investigation or recovery help.' },
      { title: 'Preserve evidence safely', body: 'Retain original public transaction hashes, timestamps, and addresses. Avoid posting personal or sensitive evidence publicly.' },
      { title: 'Use verified channels', body: 'Contact relevant exchanges or wallet providers through independently verified support pages and consider reporting suspected theft to local authorities.' },
    ],
  },
  '/shop': {
    eyebrow: 'MARKETPLACE / COMMERCE STATUS',
    title: 'Commerce is not enabled.',
    intro: 'There is no connected product catalog, checkout, payment processor, or order-management service. No items or prices are available to purchase.',
    image: heroMarkets,
    status: 'Catalog and payment integrations are unavailable',
    sections: [
      { title: 'No checkout or payment', body: 'This page does not collect payment details, connect a wallet, or create an order.' },
      { title: 'No example inventory', body: 'Product cards and sample prices are omitted so there is no ambiguity about what can actually be bought.' },
      { title: 'Account scope', body: 'Subscription and commerce management are also not connected. See the pricing page for the current capability status.' },
    ],
  },
  '/pricing': {
    eyebrow: 'PRICING / PLAN STATUS',
    title: 'Plans are not configured.',
    intro: 'Subscription management and billing are not connected to this application. There are no active tiers, checkout flows, or recurring charges to describe.',
    image: heroAi,
    status: 'No subscription or payment integration is available',
    sections: [
      { title: 'Public research', body: 'The public markets, wallet lookup, and snapshot-grounded intelligence pages expose the features currently connected to the API.' },
      { title: 'No billing actions', body: 'No purchase, upgrade, cancellation, or payment buttons are shown because those actions are not implemented.' },
      { title: 'Account access', body: 'Clerk sign-in and sign-up are available for account access. Authentication does not imply a paid plan or subscription.' },
    ],
  },
  '/contact': {
    eyebrow: 'CONTACT / SUPPORT STATUS',
    title: 'A clear route to the available tools.',
    intro: 'There is no support inbox or case-submission backend connected here. We will not display a form that appears to send a message when it cannot.',
    image: evidenceBackground,
    status: 'Support submissions are not enabled',
    sections: [
      { title: 'Research questions', body: 'For questions about the connected public market snapshot, use AI intelligence. Its answers show the model, source, timestamp, and scope returned by the API.' },
      { title: 'Account access', body: 'Use the sign-in or sign-up route for Clerk-managed account access. Do not send passwords or authentication codes to anyone.' },
      { title: 'Provider issue', body: 'If a data source is unavailable, the relevant market or wallet page provides an on-screen status and retry action where supported.' },
    ],
  },
  '/privacy-policy': {
    eyebrow: 'POLICY / PRIVACY',
    title: 'Privacy, with scope stated plainly.',
    intro: 'This summary describes the visible product behavior and is not a substitute for a jurisdiction-specific legal review. Account authentication is provided by Clerk.',
    image: evidenceBackground,
    sections: [
      { title: 'Account information', body: 'Sign-in and sign-up are handled through the configured Clerk integration. The product uses account access for its protected workspace; authentication credentials are not entered into market or wallet tools.' },
      { title: 'Public address lookups', body: 'A wallet scan sends the network and public address you submit to the application API and its configured provider. A public address can still be sensitive when linked to an identity.' },
      { title: 'Questions and market data', body: 'Questions submitted to AI intelligence and requests for market data are sent to the configured application API. The answer includes its data source and snapshot timestamp when provided.' },
      { title: 'Choices and retention', body: 'This interface does not provide a privacy-request workflow or publish provider retention settings. Avoid entering personal information into questions; consult the service operator for verified retention and request procedures.' },
    ],
  },
  '/terms': {
    eyebrow: 'POLICY / TERMS',
    title: 'Terms for a research interface.',
    intro: 'This plain-language overview is informational, not a complete agreement or legal advice. Use of the application is subject to applicable law and any separately presented terms.',
    image: heroMarkets,
    sections: [
      { title: 'Informational use', body: 'Market data and AI responses are for research and general information. They are not investment, tax, or legal advice, and are not a recommendation to buy or sell an asset.' },
      { title: 'Third-party data', body: 'Some information is returned by external providers. Availability, freshness, accuracy, and coverage may vary; provider attribution and timestamps should be reviewed before relying on a result.' },
      { title: 'Safe and lawful use', body: 'Do not use the product to violate laws, interfere with services, or submit secrets. The wallet scanner is a public, read-only balance lookup; it does not authorize transactions.' },
      { title: 'Availability', body: 'Features may be unavailable where integrations are not connected or a provider does not return data. No uptime or financial outcome is promised by this interface.' },
    ],
  },
  '/cookie-policy': {
    eyebrow: 'POLICY / COOKIES',
    title: 'Browser storage and session context.',
    intro: 'Authentication is provided by Clerk and may use browser storage or cookies needed to maintain a session. This page does not claim an exhaustive inventory of vendor cookies.',
    image: heroAi,
    sections: [
      { title: 'Authentication', body: 'Clerk manages the sign-in and sign-up experience. Session technologies may be required for authentication, account security, and callback routing.' },
      { title: 'Application preferences', body: 'The interface may use browser-side state for temporary interactions such as the current carousel slide or form inputs. Do not use this terminal to store wallet secrets.' },
      { title: 'Manage browser data', body: 'Browser controls can clear site data or block cookies, but doing so may interrupt authentication. Current vendor cookie durations and optional-cookie controls are not exposed by this frontend.' },
    ],
  },
  '/risk-disclosure': {
    eyebrow: 'POLICY / RISK DISCLOSURE',
    title: 'Digital assets carry material risk.',
    intro: 'Cryptoassets can be highly volatile and may become illiquid or lose some or all of their value. Research tools cannot remove those risks.',
    image: heroMarkets,
    sections: [
      { title: 'Data may be delayed or incomplete', body: 'Provider snapshots can be stale, unavailable, inconsistent, or affected by methodology. Check the displayed source and timestamp and independently verify critical information.' },
      { title: 'No investment advice', body: 'Market metrics and AI-generated explanations are general information, not individualized advice, a forecast, or a promise of performance.' },
      { title: 'Wallet and transaction risk', body: 'Blockchain transactions may be irreversible. This scanner does not initiate transactions, but third-party explorers and recovery services may expose users to phishing or fraud.' },
      { title: 'Independent judgment', body: 'Consider your objectives, financial circumstances, and risk tolerance, and consult an appropriately qualified professional where needed.' },
    ],
  },
  '/security-policy': {
    eyebrow: 'POLICY / SECURITY BOUNDARIES',
    title: 'Security begins with least access.',
    intro: 'The public wallet scanner is deliberately limited to public address lookups. Do not provide credentials or approve transactions to use this product.',
    image: evidenceBackground,
    sections: [
      { title: 'Never requested', body: 'The interface must not ask for a seed phrase, private key, wallet password, or transaction signature for public native-balance lookup.' },
      { title: 'Authentication', body: 'Account authentication uses the existing Clerk integration. Keep credentials and verification codes private, and use the official sign-in route.' },
      { title: 'Unavailable reporting channel', body: 'A security report intake or vulnerability disclosure workflow is not connected in this frontend. Do not include secrets in public communications.' },
      { title: 'Verify before acting', body: 'Inspect provider source details and independently verify explorer links. A displayed public balance is not proof of ownership, transaction safety, or recoverability.' },
    ],
  },
};

function Brand() {
  return <Link href="/" className="brand public-brand" data-testid="link-public-brand">
    <span className="brand-mark"><Waves size={17} /></span>
    <span><span className="brand-name">WEB3 INTEL</span><span className="brand-sub">RESEARCH TERMINAL</span></span>
  </Link>;
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return <header className="public-header">
    <Brand />
    <nav className={`public-nav ${open ? 'is-open' : ''}`} aria-label="Public navigation">
      {publicLinks.slice(0, 5).map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-public-nav-${href.slice(1)}`}>{label}</Link>)}
      <div className="public-more">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="button-public-more">More <ChevronDown size={15} /></button>
        {open && <div className="public-menu">
          {[...publicLinks.slice(5), ...legalLinks].map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-public-menu-${href.slice(1)}`}>{label}</Link>)}
          <Link href="/sign-in" onClick={() => setOpen(false)} data-testid="link-public-menu-sign-in">Sign in</Link>
          <Link href="/sign-up" onClick={() => setOpen(false)} data-testid="link-public-menu-sign-up">Create account</Link>
        </div>}
      </div>
    </nav>
    <div className="public-auth"><Link href="/sign-in" data-testid="link-public-sign-in">Sign in</Link><Link className="public-join" href="/sign-up" data-testid="link-public-sign-up">Create account <ArrowRight size={15} /></Link></div>
    <button className="public-menu-toggle" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="button-public-menu"><span /><span /></button>
  </header>;
}

export function PublicInfoPage() {
  const [location] = useLocation();
  const page = pageContent[location] ?? pageContent['/about'];
  const policy = location.endsWith('policy') || location === '/terms' || location === '/risk-disclosure';
  return <div className="public-site">
    <PublicHeader />
    <main className="public-content">
      <section className="public-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,15,24,.96) 0%, rgba(8,15,24,.84) 53%, rgba(8,15,24,.44) 100%), url("${page.image}")` }}>
        <div className="public-hero-copy">
          <div className="public-eyebrow">{page.eyebrow}</div>
          <h1>{page.title}</h1>
          <p>{page.intro}</p>
          {page.status && <div className="capability-status" data-testid="status-capability"><CircleAlert size={18} /><span>{page.status}</span></div>}
        </div>
      </section>
      {location === '/blockchain' && <section className="network-illustration" aria-label="Decorative network diagram" data-testid="visual-only-network-map">
        <div className="network-illustration-label"><span><Blocks size={15} /> NETWORK TOPOLOGY</span><strong>VISUAL ONLY · NO LIVE CHAIN DATA</strong></div>
        <svg viewBox="0 0 920 148" role="img" aria-label="Abstract illustration of connected network nodes; no telemetry is represented">
          <path className="network-link" d="M64 94 188 45 322 100 455 49 590 94 735 38 854 88M188 45 225 126M322 100 455 49 486 125M590 94 735 38 765 119M64 94 225 126 486 125 765 119 854 88" />
          {[['64', '94'], ['188', '45'], ['225', '126'], ['322', '100'], ['455', '49'], ['486', '125'], ['590', '94'], ['735', '38'], ['765', '119'], ['854', '88']].map(([cx, cy], index) => <circle key={`${cx}-${cy}`} className={`network-node node-${index % 4}`} cx={cx} cy={cy} r={index % 3 === 0 ? 5 : 3.5} />)}
        </svg>
        <span className="network-illustration-caption">A decorative network motif only. It does not indicate blocks, transactions, network health, or provider activity.</span>
      </section>}
      <div className="public-body">
        {page.sections.map((section, index) => <section className="public-section" key={section.title} data-testid={`section-public-${index + 1}`}>
          <div className="public-section-number">{String(index + 1).padStart(2, '0')} <span>/ {policy ? 'POLICY' : 'SCOPE'}</span></div>
          <div><h2>{section.title}</h2><p>{section.body}</p></div>
        </section>)}
        {!policy && <section className="public-next-step">
          <div className="public-next-icon">{location === '/blockchain' ? <Blocks /> : location === '/security-policy' ? <LockKeyhole /> : <ShieldCheck />}</div>
          <div><h2>Use what is connected.</h2><p>Explore live provider-backed market views or a public, read-only balance lookup.</p></div>
          <Link href="/markets" className="public-cta" data-testid="link-public-markets">Open markets <ArrowRight size={16} /></Link>
        </section>}
        {policy && <div className="policy-note"><FileText size={17} /><span>Product capability descriptions reflect this frontend; they do not replace complete legal terms or provider disclosures.</span></div>}
      </div>
    </main>
    <footer className="public-footer">
      <div className="public-footer-brand"><Brand /><span>Public data. Clear context.</span></div>
      <nav className="public-footer-links" aria-label="Product pages">{publicLinks.map(([href, label]) => <Link key={href} href={href} data-testid={`link-public-footer-${href.slice(1)}`}>{label}</Link>)}</nav>
      <nav className="public-footer-links legal-links" aria-label="Policies">{legalLinks.map(([href, label]) => <Link key={href} href={href} data-testid={`link-policy-footer-${href.slice(1)}`}>{label}</Link>)}</nav>
      <div className="public-footer-bottom"><span>Provider provenance stays visible where available.</span><span>© {new Date().getFullYear()} Web3 Intelligence</span></div>
    </footer>
  </div>;
}

function displayTimestamp(value?: string | null) {
  if (!value) return 'Publication time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Publication time unavailable'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function NewsPage() {
  const news = useGetLatestNews({
    query: { queryKey: getGetLatestNewsQueryKey(), refetchInterval: 180_000, staleTime: 120_000, refetchOnWindowFocus: true },
  });
  const providers = news.data?.providers ?? [];

  return <div className="public-site">
    <PublicHeader />
    <main className="public-content">
      <section className="public-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,15,24,.96) 0%, rgba(8,15,24,.84) 53%, rgba(8,15,24,.44) 100%), url("${heroAi}")` }}>
        <div className="public-hero-copy">
          <div className="public-eyebrow">NEWS / PUBLIC RSS SOURCES</div>
          <h1>Recent crypto and Web3 reporting.</h1>
          <p>Headlines are pulled from established publication feeds. Each story links to its publisher; no generated headlines or sentiment scores are mixed in.</p>
          {news.data && <div className="news-updated"><Clock3 size={14} /> Updated {displayTimestamp(news.data.updatedAt)}</div>}
        </div>
      </section>
      <section className="live-data-section">
        <div className="live-data-head">
          <div><div className="public-eyebrow">SOURCE STATUS</div><h2>Publication feeds</h2></div>
          {news.isFetching && <span className="live-refresh"><RefreshCw size={13} className="spin-icon" /> Refreshing</span>}
        </div>
        <div className="news-provider-list">
          {news.isLoading ? <div className="live-data-loading"><LoaderCircle className="spin-icon" /> Checking publication feeds…</div> :
            providers.map((provider) => <div className="news-provider" key={provider.provider}>
              <span className={`provider-status-dot ${provider.status === 'available' ? 'configured' : ''}`} />
              <strong>{provider.provider}</strong>
              <span className={provider.status === 'available' ? 'provider-status-label configured' : 'provider-status-label'}>
                {provider.status === 'available' ? `${provider.articleCount} stories` : 'Temporarily unavailable'}
              </span>
            </div>)}
        </div>
        {news.isError ? <div className="live-data-error" role="alert">
          <CircleAlert size={18} /><span>News providers could not be reached right now.</span>
          <button type="button" className="public-cta" onClick={() => news.refetch()} data-testid="button-retry-news">Retry</button>
        </div> : news.isLoading ? <div className="news-card-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => <div className="news-skeleton" key={item}><span /><i /><i /></div>)}
        </div> : !news.data?.items.length ? <div className="live-data-empty" data-testid="empty-news-feed">
          <Newspaper size={21} /><strong>No stories were returned</strong>
          <p>All configured feeds may be rate-limited or temporarily unavailable. Feed status is shown above; no sample headlines are substituted.</p>
        </div> : <div className="news-card-grid">
          {news.data.items.map((item) => <article className="news-card" key={`${item.source}:${item.url}`}>
            <div className="news-card-meta"><span>{item.source}</span><time>{displayTimestamp(item.publishedAt)}</time></div>
            <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ExternalLink size={14} /></a></h3>
            {item.summary && <p>{item.summary}</p>}
            <a className="news-read-link" href={item.url} target="_blank" rel="noopener noreferrer">Read at {item.source} <ArrowRight size={14} /></a>
          </article>)}
        </div>}
        <p className="live-data-disclaimer"><Database size={14} /> Source: {news.data?.source ?? 'Public publication feeds'}. Publication availability and timestamps can vary. Headlines are not financial advice.</p>
      </section>
    </main>
    <footer className="public-footer">
      <div className="public-footer-brand"><Brand /><span>Public data. Clear context.</span></div>
      <nav className="public-footer-links" aria-label="Product pages">{publicLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <nav className="public-footer-links legal-links" aria-label="Policies">{legalLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <div className="public-footer-bottom"><span>Provider provenance stays visible where available.</span><span>© {new Date().getFullYear()} Web3 Intelligence</span></div>
    </footer>
  </div>;
}

export function BlockchainPage() {
  const status = useGetBlockchainStatus({
    query: { queryKey: getGetBlockchainStatusQueryKey(), refetchInterval: 60_000, staleTime: 45_000, refetchOnWindowFocus: true },
  });
  const networks = status.data?.networks ?? [];

  return <div className="public-site">
    <PublicHeader />
    <main className="public-content">
      <section className="public-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,15,24,.96) 0%, rgba(8,15,24,.84) 53%, rgba(8,15,24,.44) 100%), url("${heroMarkets}")` }}>
        <div className="public-hero-copy">
          <div className="public-eyebrow">BLOCKCHAIN / LIVE PUBLIC STATUS</div>
          <h1>Network data, from public providers.</h1>
          <p>Latest reported block heights and slots are checked directly against public endpoints. These snapshots are not a complete measure of network health.</p>
          {status.data && <div className="news-updated"><Clock3 size={14} /> Checked {displayTimestamp(status.data.updatedAt)}</div>}
        </div>
      </section>
      <section className="live-data-section">
        <div className="live-data-head">
          <div><div className="public-eyebrow">NETWORK SNAPSHOT</div><h2>Current provider responses</h2></div>
          {status.isFetching && <span className="live-refresh"><RefreshCw size={13} className="spin-icon" /> Refreshing</span>}
        </div>
        {status.isError ? <div className="live-data-error" role="alert">
          <CircleAlert size={18} /><span>Network status providers could not be reached right now.</span>
          <button type="button" className="public-cta" onClick={() => status.refetch()} data-testid="button-retry-blockchain">Retry</button>
        </div> : status.isLoading ? <div className="network-status-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => <div className="network-status-card network-skeleton" key={item}><span /><i /><i /></div>)}
        </div> : <div className="network-status-grid">
          {networks.map((network) => <article className="network-status-card" key={network.network} data-testid={`card-network-${network.network}`}>
            <div className="network-status-title"><span className="network-status-mark">{network.name.slice(0, 2).toUpperCase()}</span><div><strong>{network.name}</strong><small>{network.source}</small></div><span className={`network-status-pill ${network.status}`}>{network.status === 'available' ? 'Live' : 'Unavailable'}</span></div>
            <div className="network-status-metrics">
              <div><span>{network.family === 'solana' ? 'LATEST SLOT' : 'LATEST BLOCK'}</span><strong>{network.latestHeight ? Number(network.latestHeight).toLocaleString() : '—'}</strong></div>
              {network.gasPriceGwei !== null && <div><span>GAS PRICE</span><strong>{network.gasPriceGwei.toFixed(2)} Gwei</strong></div>}
              {network.epoch !== null && <div><span>EPOCH</span><strong>{network.epoch}</strong></div>}
              {network.blockTime && <div><span>BLOCK TIME</span><strong>{displayTimestamp(network.blockTime)}</strong></div>}
              {network.error && <p className="network-status-error">{network.error}</p>}
            </div>
          </article>)}
        </div>}
        <p className="live-data-disclaimer"><Activity size={14} /> Source: {status.data?.source ?? 'Public blockchain endpoints'}. Values are provider snapshots, not a guarantee of uptime, finality, or complete chain coverage.</p>
      </section>
    </main>
    <footer className="public-footer">
      <div className="public-footer-brand"><Brand /><span>Public data. Clear context.</span></div>
      <nav className="public-footer-links" aria-label="Product pages">{publicLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <nav className="public-footer-links legal-links" aria-label="Policies">{legalLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <div className="public-footer-bottom"><span>Provider provenance stays visible where available.</span><span>© {new Date().getFullYear()} Web3 Intelligence</span></div>
    </footer>
  </div>;
}

