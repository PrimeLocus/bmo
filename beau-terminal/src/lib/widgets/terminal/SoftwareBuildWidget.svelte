<script lang="ts">
	import { enhance } from '$app/forms';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type RawPhase = {
		id: number;
		phase: string;
		order: number;
	};

	type RawStep = {
		id: string;
		phaseId: number;
		text: string;
		done: boolean;
		order: number;
		links: string;
	};

	type Link = { label: string; url: string; kind: string };

	type Phase = RawPhase & {
		steps: (RawStep & { parsedLinks: Link[] })[];
	};

	const KIND_COLOR: Record<string, string> = {
		github: 'var(--bmo-green)',
		docs: '#9cdcfe',
		video: '#f0a500',
		guide: 'var(--bmo-muted)'
	};
	const KIND_PREFIX: Record<string, string> = {
		github: 'GH',
		docs: 'DOC',
		video: 'VID',
		guide: '→'
	};

	const rawData = $derived(data as { phases?: RawPhase[]; steps?: RawStep[] } | null);

	const phases = $derived.by((): Phase[] => {
		if (!rawData?.phases || !rawData?.steps) return [];
		const rawPhases = [...rawData.phases].sort((a, b) => a.order - b.order);
		return rawPhases.map((p) => ({
			...p,
			steps: rawData
				.steps!.filter((s) => s.phaseId === p.id)
				.sort((a, b) => a.order - b.order)
				.map((s) => ({
					...s,
					parsedLinks: parseLinks(s.links)
				}))
		}));
	});

	function parseLinks(raw: string): Link[] {
		try {
			return JSON.parse(raw || '[]');
		} catch {
			return [];
		}
	}

	const allSteps = $derived(phases.flatMap((p) => p.steps));
	const totalDone = $derived(allSteps.filter((s) => s.done).length);
	const totalPct = $derived(
		allSteps.length > 0 ? Math.round((totalDone / allSteps.length) * 100) : 0
	);

	let collapsed = $state<Set<number>>(new Set());

	function togglePhase(id: number) {
		const next = new Set(collapsed);
		next.has(id) ? next.delete(id) : next.add(id);
		collapsed = next;
	}
</script>

{#if phases.length === 0}
	<div class="empty">
		<span class="empty-label">NO DATA</span>
		<span class="empty-sub">No build phases loaded</span>
	</div>
{:else}
	<div class="build-widget">
		<!-- Summary -->
		<div class="summary-bar">
			<span class="summary-label">SOFTWARE BUILD</span>
			<span class="summary-progress"
				>{totalDone} / {allSteps.length} steps &middot; {totalPct}%</span
			>
		</div>

		<!-- Overall progress bar -->
		<div class="progress-track">
			<div
				class="progress-fill"
				style="width: {totalPct}%; background: var(--bmo-green)"
			></div>
		</div>

		<!-- Phases -->
		<div class="phases-list">
			{#each phases as phase (phase.id)}
				{@const done = phase.steps.filter((s) => s.done).length}
				{@const pct =
					phase.steps.length > 0
						? Math.round((done / phase.steps.length) * 100)
						: 0}
				{@const isOpen = !collapsed.has(phase.id)}

				<div class="phase-block">
					<!-- Phase header -->
					<button
						type="button"
						class="phase-header"
						onclick={() => togglePhase(phase.id)}
					>
						<div class="phase-left">
							<span
								class="phase-arrow"
								style="color: {pct === 100
									? 'var(--bmo-green)'
									: 'var(--bmo-muted)'}"
								>{isOpen ? '▾' : '▸'}</span
							>
							<span
								class="phase-name"
								style="color: {pct === 100
									? 'var(--bmo-green)'
									: 'var(--bmo-text)'}">{phase.phase}</span
							>
						</div>
						<div class="phase-right">
							<span class="phase-count"
								>{done}/{phase.steps.length}</span
							>
							<div class="phase-bar-track">
								<div
									class="phase-bar-fill"
									style="width: {pct}%; background: {pct === 100
										? 'var(--bmo-green)'
										: 'var(--bmo-muted)'}"
								></div>
							</div>
						</div>
					</button>

					<!-- Steps -->
					{#if isOpen}
						<div class="steps-list">
							{#each phase.steps as step (step.id)}
								<div class="step-row">
									<form
										method="POST"
										action="/software?/toggle"
										use:enhance
										class="step-form"
									>
										<input
											type="hidden"
											name="id"
											value={step.id}
										/>
										<input
											type="hidden"
											name="done"
											value={String(step.done)}
										/>
										<button
											type="submit"
											class="step-checkbox"
											style="border-color: {step.done
												? 'var(--bmo-green)'
												: 'var(--bmo-border)'}; background: {step.done
												? 'var(--bmo-green)'
												: 'transparent'}; color: var(--bmo-bg)"
										>
											{#if step.done}✓{/if}
										</button>
										<div class="step-content">
											<span
												class="step-text"
												style="color: {step.done
													? 'var(--bmo-muted)'
													: 'var(--bmo-text)'}; text-decoration: {step.done
													? 'line-through'
													: 'none'}"
											>
												{step.text}
											</span>
											{#if step.parsedLinks.length > 0}
												<div class="step-links">
													{#each step.parsedLinks as link}
														<a
															href={link.url}
															target="_blank"
															rel="noopener noreferrer"
															class="step-link"
															style="border-color: {KIND_COLOR[
																link.kind
															] ??
																'var(--bmo-border)'}; color: {KIND_COLOR[
																link.kind
															] ?? 'var(--bmo-muted)'}"
														>
															<span style="opacity: 0.6"
																>{KIND_PREFIX[link.kind] ??
																	'↗'}</span
															>{link.label}
														</a>
													{/each}
												</div>
											{/if}
										</div>
									</form>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.empty {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Courier New', monospace;
		gap: 4px;
	}
	.empty-label {
		color: var(--bmo-muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.empty-sub {
		color: var(--bmo-border);
		font-size: 10px;
		letter-spacing: 0.1em;
	}

	.build-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', monospace;
		overflow: hidden;
	}

	.summary-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		flex-shrink: 0;
	}
	.summary-label {
		color: var(--bmo-green);
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.summary-progress {
		color: var(--bmo-muted);
		font-size: 10px;
	}

	.progress-track {
		height: 2px;
		background: var(--bmo-border);
		margin: 0 10px 6px;
		flex-shrink: 0;
	}
	.progress-fill {
		height: 100%;
		transition: width 0.3s;
	}

	.phases-list {
		flex: 1;
		overflow-y: auto;
		padding: 0 4px;
	}

	.phase-block {
		border: 1px solid var(--bmo-border);
		margin-bottom: 4px;
	}

	.phase-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		background: var(--bmo-surface);
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: opacity 0.15s;
	}
	.phase-header:hover {
		opacity: 0.8;
	}

	.phase-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.phase-arrow {
		font-size: 10px;
	}
	.phase-name {
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.phase-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.phase-count {
		font-size: 10px;
		color: var(--bmo-muted);
	}
	.phase-bar-track {
		width: 60px;
		height: 2px;
		background: var(--bmo-border);
	}
	.phase-bar-fill {
		height: 100%;
		transition: width 0.3s;
	}

	.steps-list {
		border-top: 1px solid var(--bmo-border);
	}

	.step-row {
		border-bottom: 1px solid var(--bmo-border);
		padding: 4px 8px;
	}
	.step-row:last-child {
		border-bottom: none;
	}

	.step-form {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.step-checkbox {
		width: 14px;
		height: 14px;
		border: 1px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		cursor: pointer;
		flex-shrink: 0;
		margin-top: 1px;
		background: transparent;
		font-family: inherit;
		padding: 0;
		transition: opacity 0.15s;
	}
	.step-checkbox:hover {
		opacity: 0.7;
	}

	.step-content {
		flex: 1;
		min-width: 0;
	}
	.step-text {
		font-size: 11px;
		line-height: 1.4;
	}

	.step-links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 3px;
	}
	.step-link {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 9px;
		letter-spacing: 0.04em;
		padding: 1px 4px;
		border: 1px solid;
		text-decoration: none;
		transition: opacity 0.15s;
	}
	.step-link:hover {
		opacity: 0.7;
	}
</style>
