<script lang="ts">
	import { beauState } from '$lib/stores/beau.svelte.js';
	import { SIGNAL_RULE_META, type RuleDelta } from '$lib/personality/rule-meta.js';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	const TOTAL_RULES = Object.keys(SIGNAL_RULE_META).length;
	const ALL_RULE_NAMES = Object.keys(SIGNAL_RULE_META);

	const activeSources = $derived(beauState.signalSources ?? []);

	const activeRules = $derived(
		activeSources
			.filter((name: string) => name in SIGNAL_RULE_META)
			.map((name: string) => ({ name, delta: SIGNAL_RULE_META[name] }))
	);

	const inactiveNames = $derived(
		ALL_RULE_NAMES.filter((name) => !activeSources.includes(name))
	);

	/** Border color = color of the strongest absolute contribution. */
	function borderColor(delta: RuleDelta): string {
		const aw = Math.abs(delta.wonder);
		const ar = Math.abs(delta.reflection);
		const am = Math.abs(delta.mischief);
		if (ar >= aw && ar >= am) return 'var(--pw-reflection)';
		if (am >= aw && am >= ar) return 'var(--pw-mischief)';
		return 'var(--pw-wonder)';
	}

	/** Format a delta value: "+0.3" or "−0.2". */
	function fmt(v: number): string {
		if (v === 0) return '';
		return (v > 0 ? '+' : '\u2212') + Math.abs(v).toFixed(1);
	}

	const DIM_COLORS: Record<string, string> = {
		W: 'var(--pw-wonder)',
		R: 'var(--pw-reflection)',
		M: 'var(--pw-mischief)',
	};
</script>

<div class="signal-sources">
	<!-- Header -->
	<div class="sources-header">
		<span class="widget-label">ACTIVE SIGNALS</span>
		<span class="counter">{activeRules.length} of {TOTAL_RULES}</span>
	</div>

	<!-- Active rules -->
	<div class="active-list">
		{#each activeRules as rule (rule.name)}
			<div class="rule-card" style="border-left-color:{borderColor(rule.delta)};">
				<span class="rule-name">{rule.name}</span>
				<div class="rule-deltas">
					{#if rule.delta.wonder !== 0}
						<span class="delta"><span class="delta-dim">W</span><span style="color:var(--pw-wonder);">{fmt(rule.delta.wonder)}</span></span>
					{/if}
					{#if rule.delta.reflection !== 0}
						<span class="delta"><span class="delta-dim">R</span><span style="color:var(--pw-reflection);">{fmt(rule.delta.reflection)}</span></span>
					{/if}
					{#if rule.delta.mischief !== 0}
						<span class="delta"><span class="delta-dim">M</span><span style="color:var(--pw-mischief);">{fmt(rule.delta.mischief)}</span></span>
					{/if}
				</div>
			</div>
		{/each}
		{#if activeRules.length === 0}
			<div class="empty">no signals firing</div>
		{/if}
	</div>

	<!-- Inactive divider -->
	{#if inactiveNames.length > 0}
		<div class="inactive-divider">
			<span class="divider-line"></span>
			<span class="divider-label">INACTIVE \u00B7 {inactiveNames.length}</span>
			<span class="divider-line"></span>
		</div>

		<div class="inactive-list">
			{inactiveNames.join(' \u00B7 ')}
		</div>
	{/if}
</div>

<style>
	.signal-sources {
		--pw-wonder: #00e5a0;
		--pw-reflection: #6ec6ff;
		--pw-mischief: #ffd700;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
		overflow-y: auto;
	}

	.sources-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.875rem;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		color: var(--bmo-muted);
	}

	.counter {
		font-size: 0.5625rem;
		color: var(--bmo-border);
	}

	.active-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.875rem;
	}

	.rule-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		background: var(--bmo-surface);
		border-radius: 4px;
		border-left: 2px solid var(--bmo-border);
	}

	.rule-name {
		flex: 1;
		font-size: 0.6875rem;
		color: var(--bmo-text);
	}

	.rule-deltas {
		display: flex;
		gap: 0.375rem;
	}

	.delta {
		font-size: 0.5625rem;
	}

	.delta-dim {
		color: var(--bmo-muted);
		margin-right: 1px;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.1em;
	}

	.inactive-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--bmo-border);
	}

	.divider-label {
		font-size: 0.5rem;
		letter-spacing: 0.15em;
		color: var(--bmo-border);
		white-space: nowrap;
	}

	.inactive-list {
		font-size: 0.5625rem;
		color: var(--bmo-border);
		line-height: 1.6;
	}
</style>
