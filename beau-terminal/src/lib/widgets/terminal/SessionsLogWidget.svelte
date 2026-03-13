<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type Session = {
		id: number;
		startedAt: string;
		endedAt: string | null;
		status: string;
		sessionName: string | null;
		venue: string | null;
		bpmMin: number | null;
		bpmMax: number | null;
		bpmAvg: number | null;
		debriefText: string | null;
	};

	const limit = $derived(typeof config.limit === 'number' ? config.limit : 20);
	const sessions = $derived(
		Array.isArray(data) ? (data as Session[]).slice(0, limit) : []
	);

	function formatDuration(startedAt: string, endedAt: string | null): string {
		const start = new Date(startedAt).getTime();
		const end = endedAt ? new Date(endedAt).getTime() : Date.now();
		const mins = Math.round((end - start) / 60000);
		if (mins < 60) return `${mins}m`;
		return `${Math.floor(mins / 60)}h ${mins % 60}m`;
	}

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="sessions-widget">
	<div class="header">
		<span class="label">SESSIONS LOG</span>
		<span class="count">{sessions.length}</span>
	</div>

	{#if beauState.resolumeActive}
		<div class="live-banner">
			<span class="live-dot"></span>
			<span class="live-text">LIVE SESSION</span>
			{#if beauState.currentClip}
				<span class="live-clip">{beauState.currentClip}</span>
			{/if}
		</div>
	{/if}

	{#if sessions.length === 0}
		<div class="empty">
			<span class="empty-label">NO SESSIONS RECORDED</span>
			<span class="empty-sub">sessions appear automatically when resolume sends OSC data</span>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="sessions-table">
				<thead>
					<tr>
						<th>DATE</th>
						<th>DURATION</th>
						<th class="hide-narrow">BPM</th>
						<th>STATUS</th>
					</tr>
				</thead>
				<tbody>
					{#each sessions as session (session.id)}
						<tr>
							<td>
								<span class="date-link">
									{formatDate(session.startedAt)}
								</span>
								{#if session.sessionName}
									<span class="session-name">{session.sessionName}</span>
								{/if}
							</td>
							<td class="cell-value">
								{formatDuration(session.startedAt, session.endedAt)}
							</td>
							<td class="cell-value hide-narrow">
								{#if session.bpmMin != null && session.bpmMax != null}
									{Math.round(session.bpmMin)}&ndash;{Math.round(session.bpmMax)}
								{:else}
									&mdash;
								{/if}
							</td>
							<td>
								<span class="status-badge"
									  style="color: {session.status === 'active' ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
									{session.status.toUpperCase()}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.sessions-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		flex-shrink: 0;
		border-bottom: 1px solid var(--bmo-border);
	}

	.label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.count {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		margin-left: auto;
	}

	.live-banner {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--bmo-green);
		background: var(--bmo-surface);
		flex-shrink: 0;
	}

	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--bmo-green);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.live-text {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--bmo-green);
		letter-spacing: 0.15em;
	}

	.live-clip {
		font-size: 0.6rem;
		color: var(--bmo-text);
		margin-left: auto;
	}

	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 1rem;
	}

	.empty-label {
		font-size: 0.65rem;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.empty-sub {
		font-size: 0.6rem;
		color: var(--bmo-muted);
		opacity: 0.7;
		text-align: center;
	}

	.table-wrap {
		flex: 1;
		overflow-y: auto;
	}

	.sessions-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.7rem;
	}

	.sessions-table thead tr {
		border-bottom: 1px solid var(--bmo-border);
	}

	.sessions-table th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		font-size: 0.55rem;
		font-weight: 700;
		color: var(--bmo-muted);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.sessions-table tbody tr {
		border-bottom: 1px solid var(--bmo-border);
	}

	.sessions-table td {
		padding: 0.5rem 0.75rem;
		vertical-align: top;
	}

	.date-link {
		color: var(--bmo-green);
		font-size: 0.7rem;
	}

	.session-name {
		display: block;
		font-size: 0.55rem;
		color: var(--bmo-muted);
		margin-top: 0.15rem;
	}

	.cell-value {
		color: var(--bmo-text);
	}

	.status-badge {
		font-size: 0.6rem;
		letter-spacing: 0.15em;
		font-weight: 700;
	}

	.hide-narrow {
		display: table-cell;
	}

	@media (max-width: 480px) {
		.hide-narrow {
			display: none;
		}
	}
</style>
