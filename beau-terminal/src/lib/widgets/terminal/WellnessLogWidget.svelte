<script lang="ts">
	type Session = {
		id: number;
		startedAt: string;
		endedAt?: string | null;
		status: string;
		deviceType: string;
		displayName: string;
		targetTemp?: number | null;
		peakTemp?: number | null;
		avgTemp?: number | null;
		profile?: string | null;
		durationSeconds?: number | null;
		batteryStart?: number | null;
		batteryEnd?: number | null;
	};

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const sessions = $derived(Array.isArray(data) ? (data as Session[]) : []);

	function fmtDate(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
				' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		} catch {
			return iso;
		}
	}

	function fmtDuration(sec: number | null | undefined): string {
		if (sec == null) return '—';
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	function batteryDelta(start: number | null | undefined, end: number | null | undefined): string {
		if (start == null || end == null) return '';
		const diff = end - start;
		return diff < 0 ? `${diff}%` : '';
	}
</script>

<div class="wellness-log">
	{#if sessions.length === 0}
		<div class="empty">no sessions recorded</div>
	{:else}
		<table>
			<thead>
				<tr>
					<th>DATE</th>
					<th>DEVICE</th>
					<th>TEMP</th>
					<th>PEAK</th>
					<th>DURATION</th>
					<th>BATT</th>
				</tr>
			</thead>
			<tbody>
				{#each sessions as session (session.id)}
					<tr class:active={session.status === 'active'}>
						<td class="date">{fmtDate(session.startedAt)}</td>
						<td class="device">{session.displayName}</td>
						<td class="temp">{session.targetTemp != null ? `${session.targetTemp}°F` : '—'}</td>
						<td class="temp peak">{session.peakTemp != null ? `${session.peakTemp}°F` : '—'}</td>
						<td class="duration">{fmtDuration(session.durationSeconds)}</td>
						<td class="battery">{batteryDelta(session.batteryStart, session.batteryEnd)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.wellness-log {
		width: 100%;
		height: 100%;
		padding: 0.5rem;
		overflow: auto;
		font-family: 'Courier New', Courier, monospace;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.7rem;
	}

	th {
		font-size: 0.55rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		text-align: left;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--bmo-border);
	}

	td {
		padding: 0.3rem 0.5rem;
		color: var(--bmo-text);
		border-bottom: 1px solid var(--bmo-border);
		white-space: nowrap;
	}

	tr.active td {
		color: var(--bmo-green);
	}

	.date {
		color: var(--bmo-muted);
	}

	.device {
		font-weight: 600;
	}

	.temp.peak {
		color: var(--bmo-green);
	}

	.duration {
		font-weight: 600;
	}

	.battery {
		color: var(--bmo-muted);
	}

	.empty {
		font-size: 0.7rem;
		color: var(--bmo-muted);
		font-style: italic;
		padding: 1rem;
	}
</style>
