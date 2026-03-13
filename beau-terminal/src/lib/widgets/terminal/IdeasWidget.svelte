<script lang="ts">
	import { enhance } from '$app/forms';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type RawIdea = {
		id: string;
		priority: string;
		text: string;
		done: boolean;
		links: string;
	};

	type Link = { label: string; url: string; kind: string };
	type Idea = Omit<RawIdea, 'links'> & { parsedLinks: Link[] };

	const PRIORITIES = ['high', 'medium', 'low'] as const;
	const PRIORITY_COLORS: Record<string, string> = {
		high: 'var(--bmo-green)',
		medium: '#f0a500',
		low: 'var(--bmo-muted)'
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

	const priorityFilter = $derived((config.priority as string) ?? 'all');

	function parseLinks(raw: string | Link[]): Link[] {
		if (Array.isArray(raw)) return raw;
		try {
			return JSON.parse(raw || '[]');
		} catch {
			return [];
		}
	}

	const allIdeas = $derived<Idea[]>(
		Array.isArray(data)
			? (data as RawIdea[]).map((i) => ({
					...i,
					parsedLinks: parseLinks(i.links)
				}))
			: []
	);

	const filtered = $derived(
		priorityFilter === 'all'
			? allIdeas
			: allIdeas.filter((i) => i.priority === priorityFilter)
	);

	const openCount = $derived(filtered.filter((i) => !i.done).length);
	const doneCount = $derived(filtered.filter((i) => i.done).length);

	function byPriority(p: string): Idea[] {
		return filtered.filter((i) => i.priority === p);
	}

	// Add idea state
	let newText = $state('');
	let newPriority = $state('medium');
</script>

{#if allIdeas.length === 0}
	<div class="empty">
		<span class="empty-label">NO DATA</span>
		<span class="empty-sub">No ideas loaded</span>
	</div>
{:else}
	<div class="ideas-widget">
		<!-- Summary -->
		<div class="summary-bar">
			<span class="summary-label">IDEAS</span>
			<span class="summary-stats">{openCount} open &middot; {doneCount} done</span>
		</div>

		<!-- Columns -->
		<div class="columns">
			{#each priorityFilter === 'all' ? PRIORITIES : [priorityFilter] as p}
				{@const items = byPriority(p)}
				<div class="column">
					<!-- Column header -->
					<div
						class="col-header"
						style="color: {PRIORITY_COLORS[p] ?? 'var(--bmo-muted)'}"
					>
						{p.toUpperCase()} &middot; {items.filter((i) => !i.done).length}
					</div>

					<!-- Items -->
					<div class="col-items">
						{#each items as idea (idea.id)}
							<div class="idea-item">
								<div class="idea-main">
									<form
										method="POST"
										action="/ideas?/toggle"
										use:enhance
										class="idea-toggle-form"
									>
										<input type="hidden" name="id" value={idea.id} />
										<input
											type="hidden"
											name="done"
											value={String(idea.done)}
										/>
										<button
											type="submit"
											class="idea-checkbox"
											style="border-color: {idea.done
												? PRIORITY_COLORS[idea.priority]
												: 'var(--bmo-border)'}; background: {idea.done
												? PRIORITY_COLORS[idea.priority]
												: 'transparent'}; color: var(--bmo-bg)"
										>
											{#if idea.done}✓{/if}
										</button>
										<div class="idea-content">
											<span
												class="idea-text"
												style="color: {idea.done
													? 'var(--bmo-muted)'
													: 'var(--bmo-text)'}; text-decoration: {idea.done
													? 'line-through'
													: 'none'}"
											>
												{idea.text}
											</span>
											{#if idea.parsedLinks.length > 0}
												<div class="idea-links">
													{#each idea.parsedLinks as link}
														<a
															href={link.url}
															target="_blank"
															rel="noopener noreferrer"
															class="idea-link"
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
									<!-- Delete -->
									<form
										method="POST"
										action="/ideas?/delete"
										use:enhance
										class="idea-delete-form"
									>
										<input type="hidden" name="id" value={idea.id} />
										<button type="submit" class="idea-delete-btn"
											>×</button
										>
									</form>
								</div>
							</div>
						{/each}
						{#if items.length === 0}
							<div class="col-empty">—</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Add form -->
		<div class="add-bar">
			<form
				method="POST"
				action="/ideas?/add"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						newText = '';
						newPriority = 'medium';
					};
				}}
				class="add-form"
			>
				<select
					name="priority"
					bind:value={newPriority}
					class="add-select"
					style="color: {PRIORITY_COLORS[newPriority] ?? 'var(--bmo-text)'}"
				>
					{#each PRIORITIES as p}
						<option value={p}>{p}</option>
					{/each}
				</select>
				<input
					type="text"
					name="text"
					bind:value={newText}
					placeholder="new idea..."
					class="add-input"
				/>
				<button
					type="submit"
					class="add-btn"
					disabled={!newText.trim()}
					style="opacity: {newText.trim() ? '1' : '0.4'}"
				>
					+ ADD
				</button>
			</form>
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

	.ideas-widget {
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
		border-bottom: 1px solid var(--bmo-border);
	}
	.summary-label {
		color: var(--bmo-green);
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.summary-stats {
		color: var(--bmo-muted);
		font-size: 10px;
	}

	.columns {
		flex: 1;
		display: flex;
		gap: 0;
		overflow: hidden;
	}

	.column {
		flex: 1;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--bmo-border);
		overflow: hidden;
		min-width: 0;
	}
	.column:last-child {
		border-right: none;
	}

	.col-header {
		padding: 6px 8px;
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--bmo-border);
		flex-shrink: 0;
	}

	.col-items {
		flex: 1;
		overflow-y: auto;
	}

	.idea-item {
		padding: 6px 8px;
		border-bottom: 1px solid var(--bmo-border);
	}

	.idea-main {
		display: flex;
		align-items: flex-start;
		gap: 4px;
	}

	.idea-toggle-form {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.idea-checkbox {
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
	.idea-checkbox:hover {
		opacity: 0.7;
	}

	.idea-content {
		flex: 1;
		min-width: 0;
	}
	.idea-text {
		font-size: 11px;
		line-height: 1.4;
	}

	.idea-links {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-top: 3px;
	}
	.idea-link {
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
	.idea-link:hover {
		opacity: 0.7;
	}

	.idea-delete-form {
		flex-shrink: 0;
	}
	.idea-delete-btn {
		background: none;
		border: none;
		color: var(--bmo-muted);
		font-size: 12px;
		cursor: pointer;
		font-family: inherit;
		padding: 0 2px;
		transition: opacity 0.15s;
	}
	.idea-delete-btn:hover {
		opacity: 0.7;
	}

	.col-empty {
		padding: 10px 8px;
		font-size: 11px;
		color: var(--bmo-muted);
	}

	.add-bar {
		border-top: 1px solid var(--bmo-border);
		padding: 6px 8px;
		flex-shrink: 0;
	}

	.add-form {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.add-select {
		font-size: 10px;
		padding: 4px 6px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		font-family: 'Courier New', monospace;
	}
	.add-input {
		flex: 1;
		font-size: 10px;
		padding: 4px 8px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
		min-width: 0;
	}
	.add-btn {
		font-size: 10px;
		padding: 4px 10px;
		border: 1px solid var(--bmo-green);
		color: var(--bmo-green);
		background: none;
		font-family: 'Courier New', monospace;
		letter-spacing: 0.12em;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.add-btn:hover {
		opacity: 0.8;
	}
</style>
