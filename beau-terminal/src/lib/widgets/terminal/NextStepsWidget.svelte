<script lang="ts">
	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type NextStep = {
		icon: string;
		text: string;
		detail: string;
		link: string;
	};

	const items: NextStep[] = $derived(Array.isArray(data) ? (data as NextStep[]) : []);
</script>

<div class="nextsteps-widget">
	<div class="widget-label">NEXT STEPS</div>

	{#if items.length > 0}
		<ul class="steps-list">
			{#each items as step}
				<li class="step-row">
					<a href={step.link} class="step-link">
						<span class="step-icon">{step.icon}</span>
						<span class="step-text">{step.text}</span>
						{#if step.detail}
							<span class="step-detail">{step.detail}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="empty">clear board. nice work.</div>
	{/if}
</div>

<style>
	.nextsteps-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', Courier, monospace;
	}

	.widget-label {
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--bmo-muted);
		margin-bottom: 1rem;
	}

	.steps-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.step-row {
		font-size: 0.75rem;
	}

	.step-link {
		display: grid;
		grid-template-columns: 1.2rem 1fr auto;
		align-items: baseline;
		gap: 0.4rem;
		text-decoration: none;
		color: var(--bmo-text);
		transition: color 0.15s;
	}

	.step-link:hover {
		color: var(--bmo-green);
	}

	.step-link:hover .step-detail {
		color: var(--bmo-green);
		opacity: 0.7;
	}

	.step-icon {
		color: var(--bmo-green);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.step-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.step-detail {
		color: var(--bmo-muted);
		font-size: 0.68rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
		flex-shrink: 0;
		transition: color 0.15s;
	}

	.empty {
		font-size: 0.75rem;
		color: var(--bmo-muted);
		letter-spacing: 0.05em;
		font-style: italic;
	}
</style>
