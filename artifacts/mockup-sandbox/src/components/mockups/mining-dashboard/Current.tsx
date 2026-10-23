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

export function Current() {
  return <main className="md-page md-current">
    <div className="md-topline"><span>WEB3INTEL / PRIVATE WORKSPACE</span><span>Security and setup guide ↗</span></div>
    <header className="md-heading">
      <div className="md-eyebrow">OPTIONAL LOCAL MONITOR / 01</div>
      <h1>Mining dashboard</h1>
      <p>Manage configurations and monitor devices you have explicitly paired. Web3Intel does not install, start, stop, or control XMRig.</p>
    </header>
    <div className="md-grid">
      <Stat label="Paired devices" value="0" note="0 currently connected · server-reported status" />
      <Stat label="Device reports" value="—" note="Device-reported only. Awaiting pool verification." />
      <Stat label="Share reports" value="0 / 0" note="Accepted / rejected · reported by paired devices" />
    </div>
    <div className="md-alert"><span aria-hidden="true">⚠</span><span><strong>Verification boundary.</strong> Telemetry is reported by your device and remains Awaiting pool verification. It is not verified hashrate, pool earnings, or a rewards balance.</span></div>
    <Panel title="Selected mining configuration" subtitle="Web3Intel stores setup details; it does not verify pool activity.">
      <div className="md-empty"><span aria-hidden="true">⌘</span><strong>No configuration selected</strong><span>Choose a saved configuration in Local install / launch, or save a new one.</span></div>
    </Panel>
    <div className="md-columns">
      <Panel title="Saved configuration" subtitle="Create a local XMRig configuration using values you supply.">
        <div className="md-empty"><strong>Configuration form</strong><span>Pool, operating system, public address, and CPU limit</span></div>
      </Panel>
      <Panel title="Local install / launch" subtitle="Manual steps only. You control every local action.">
        <div className="md-empty"><strong>Choose a saved configuration</strong><span>Download the generated JSON to your own device.</span></div>
      </Panel>
    </div>
  </main>;
}
