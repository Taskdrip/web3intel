import './_group.css';

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="md-card md-stat">
    <div className="md-label"><span>{label}</span><span aria-hidden="true">◌</span></div>
    <div className="md-value">{value}</div>
    <div className="md-note">{note}</div>
  </article>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="md-card">
    <div className="md-panel-head"><div><div className="md-title">{title}</div><div className="md-subtitle">{subtitle}</div></div></div>
    <div className="md-body">{children}</div>
  </section>;
}

export function Updated() {
  return <main className="md-page">
    <div className="md-topline"><span>WEB3INTEL / PRIVATE WORKSPACE</span><span>Security and setup guide ↗</span></div>
    <header className="md-heading">
      <div className="md-eyebrow">OPTIONAL LOCAL MONITOR / 01</div>
      <h1>Mining dashboard</h1>
      <p>Read live Monero network context, then manage devices you explicitly pair. Mining runs only on your own computer after you install and start it yourself.</p>
    </header>
    <div className="md-grid">
      <Stat label="Paired devices" value="0" note="0 currently connected · server-reported status" />
      <Stat label="Device reports" value="—" note="Device-reported only · awaiting pool verification" />
      <Stat label="Share reports" value="0 / 0" note="Accepted / rejected · reported by paired devices" />
    </div>
    <div className="md-alert"><span aria-hidden="true">⚠</span><span><strong>Device reports are not verified earnings.</strong> Pool rewards and profitability are not available in this dashboard.</span></div>
    <section className="md-card md-network">
      <div className="md-panel-head" style={{ padding: 0, border: 0 }}>
        <div><div className="md-title">Monero global network</div><div className="md-subtitle">Public network readings are separate from your device and pool results.</div><div className="md-note">Static preview snapshot · the dashboard queries providers every minute.</div></div>
        <span className="md-live">● Refreshes every minute</span>
      </div>
      <div className="md-network-grid">
        <article className="md-network-stat"><span>Monero price</span><strong>$607.19</strong><small>−0.96% · 24 hours · CoinGecko</small></article>
        <article className="md-network-stat"><span>Estimated network hashrate</span><strong>6.59 GH/s</strong><small>Monero-wide estimate · MoneroBlocks</small></article>
        <article className="md-network-stat"><span>Network difficulty</span><strong>791B</strong><small>Reported by the public explorer</small></article>
        <article className="md-network-stat"><span>Latest block</span><strong>3,790,035</strong><small>Latest reported reward · 0.60172 XMR</small></article>
      </div>
    </section>
    <section className="md-card" style={{ marginTop: 14, padding: 20 }}>
      <div className="md-panel-head" style={{ padding: 0, border: 0 }}>
        <div><div className="md-eyebrow">LOCAL SETUP / 3 STEPS</div><div className="md-title" style={{ fontSize: 22 }}>A simple setup path</div></div>
        <span className="md-live">About 3 minutes*</span>
      </div>
      <div className="md-steps">
        <article className="md-step"><small>01 · 1 MIN</small><h3>Save your configuration</h3><p>Choose your own pool or node, add a public receiving address, and confirm opt-in.</p><a className="md-link" href="#setup-config">Go to configuration →</a></article>
        <article className="md-step"><small>02 · 1 MIN*</small><h3>Get XMRig from its publisher</h3><p>Use the official release for your computer. Review release notes; never bypass security warnings.</p><a className="md-link" href="https://xmrig.com/download">Official XMRig downloads ↗</a></article>
        <article className="md-step"><small>03 · 1 MIN</small><h3>Launch it on your device</h3><p>Use the saved JSON and the command for your operating system. Start and stop XMRig yourself.</p><a className="md-link" href="#setup-local">View local launch steps →</a></article>
      </div>
      <p className="md-note">*Three minutes is a setup target, not a guarantee. Download times and first-run checks vary. Web3Intel never installs, starts, or controls mining software.</p>
    </section>
    <Panel title="Selected mining configuration" subtitle="Web3Intel stores setup details; it does not verify pool activity.">
      <div className="md-empty"><span aria-hidden="true">⌘</span><strong>No configuration selected</strong><span>Go to Local setup to save a configuration with your explicit consent.</span></div>
    </Panel>
  </main>;
}
