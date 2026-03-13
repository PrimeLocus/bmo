<script lang="ts">
	import { enhance } from '$app/forms';

	let { config, data }: { config: Record<string, unknown>; data?: unknown } = $props();

	type Todo = {
		id: number;
		text: string;
		section: string;
		done: boolean;
		priority: string;
		sortOrder: number;
		createdAt: string | number | Date;
	};

	const PRIORITIES = ['high', 'medium', 'low'];
	const PRIORITY_COLORS: Record<string, string> = {
		high: '#d63031',
		medium: '#f0a500',
		low: 'var(--bmo-muted)'
	};

	const sectionFilter = $derived((config.section as string) ?? '');

	let showDone = $state(true);
	let newText = $state('');
	let newSection = $state('');
	let newPriority = $state('medium');

	const allTodos = $derived<Todo[]>(Array.isArray(data) ? (data as Todo[]) : []);

	// Apply section filter from config
	const scopedTodos = $derived(
		sectionFilter ? allTodos.filter((t) => t.section === sectionFilter) : allTodos
	);

	const sections = $derived([
		'',
		...[...new Set(scopedTodos.filter((t) => t.section).map((t) => t.section))].sort()
	]);

	const totalCount = $derived(scopedTodos.length);
	const doneCount = $derived(scopedTodos.filter((t) => t.done).length);
	const pct = $derived(totalCount ? Math.round((doneCount / totalCount) * 100) : 0);

	function sectionLabel(s: string) {
		return s || 'UNSORTED';
	}

	function todosInSection(section: string): Todo[] {
		return scopedTodos
			.filter((t) => t.section === section && (showDone || !t.done))
			.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
	}
</script>

{#if allTodos.length === 0}
	<div class="empty">
		<span class="empty-label">NO DATA</span>
		<span class="empty-sub">No tasks loaded</span>
	</div>
{:else}
	<div class="todo-widget">
		<!-- Summary -->
		<div class="summary-bar">
			<div class="summary-left">
				<span class="summary-label">TODO</span>
				<span class="summary-stats">
					{doneCount} / {totalCount} done
					{#if totalCount > 0}&middot; {pct}%{/if}
				</span>
			</div>
			<div class="summary-actions">
				<button
					type="button"
					class="toggle-done-btn"
					onclick={() => (showDone = !showDone)}
					style="border-color: {showDone ? 'var(--bmo-border)' : 'var(--bmo-green)'}; color: {showDone ? 'var(--bmo-muted)' : 'var(--bmo-green)'}"
				>
					{showDone ? 'HIDE DONE' : 'SHOW DONE'}
				</button>
				{#if doneCount > 0}
					<form method="POST" action="/todo?/clearDone" use:enhance>
						<button type="submit" class="clear-done-btn">CLEAR DONE</button>
					</form>
				{/if}
			</div>
		</div>

		<!-- Progress bar -->
		{#if totalCount > 0}
			<div class="progress-track">
				<div
					class="progress-fill"
					style="width: {pct}%; background: var(--bmo-green)"
				></div>
			</div>
		{/if}

		<!-- Content area -->
		<div class="content-area">
			<!-- Add form -->
			<div class="add-section">
				<form
					method="POST"
					action="/todo?/add"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							newText = '';
						};
					}}
					class="add-form"
				>
					<div class="add-row">
						<input
							type="text"
							name="text"
							bind:value={newText}
							placeholder="what needs doing..."
							class="add-text-input"
						/>
						<input
							type="text"
							name="section"
							bind:value={newSection}
							placeholder="section"
							class="add-section-input"
						/>
						<select
							name="priority"
							bind:value={newPriority}
							class="add-priority-select"
							style="color: {PRIORITY_COLORS[newPriority]}"
						>
							{#each PRIORITIES as p}
								<option value={p}>{p}</option>
							{/each}
						</select>
						<button
							type="submit"
							class="add-btn"
							disabled={!newText.trim()}
							style="opacity: {newText.trim() ? '1' : '0.4'}"
						>
							+ ADD
						</button>
					</div>
				</form>
			</div>

			<!-- Sections -->
			<div class="sections-list">
				{#each sections as section}
					{@const items = todosInSection(section)}
					{@const allItems = scopedTodos.filter((t) => t.section === section)}
					{@const sectionDone = allItems.filter((t) => t.done).length}

					{#if items.length > 0 || (section === '' && allItems.some((t) => t.section === ''))}
						<div class="section-block">
							<!-- Section header -->
							<div class="section-header">
								<span class="section-name">{sectionLabel(section)}</span>
								<span class="section-count"
									>{sectionDone}/{allItems.length}</span
								>
								{#if allItems.length > 0}
									<div class="section-bar">
										<div
											class="section-bar-fill"
											style="width: {Math.round((sectionDone / allItems.length) * 100)}%"
										></div>
									</div>
								{/if}
							</div>

							<!-- Tasks -->
							<div class="tasks-list">
								{#each items as todo (todo.id)}
									<div class="task-row">
										<!-- Priority dot -->
										<div
											class="priority-dot"
											style="background: {todo.done
												? 'var(--bmo-border)'
												: PRIORITY_COLORS[todo.priority]}"
										></div>

										<!-- Toggle -->
										<form
											method="POST"
											action="/todo?/toggle"
											use:enhance
											class="toggle-form"
										>
											<input
												type="hidden"
												name="id"
												value={todo.id}
											/>
											<button
												type="submit"
												class="task-checkbox"
												style="border-color: {todo.done
													? 'var(--bmo-muted)'
													: 'var(--bmo-green)'}; background: {todo.done
													? 'var(--bmo-surface)'
													: 'transparent'}; color: var(--bmo-green)"
											>
												{todo.done ? '✓' : ''}
											</button>
										</form>

										<!-- Text -->
										<span
											class="task-text"
											style="color: {todo.done
												? 'var(--bmo-muted)'
												: 'var(--bmo-text)'}; text-decoration: {todo.done
												? 'line-through'
												: 'none'}"
										>
											{todo.text}
										</span>

										<!-- Delete -->
										<form
											method="POST"
											action="/todo?/delete"
											use:enhance
											class="delete-form"
										>
											<input
												type="hidden"
												name="id"
												value={todo.id}
											/>
											<button type="submit" class="delete-btn"
												>✕</button
											>
										</form>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}

				{#if totalCount === 0}
					<p class="no-tasks">no tasks yet</p>
				{/if}
			</div>
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

	.todo-widget {
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
		justify-content: space-between;
		padding: 6px 10px;
		flex-shrink: 0;
		gap: 8px;
		flex-wrap: wrap;
	}
	.summary-left {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.summary-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.toggle-done-btn {
		font-size: 9px;
		padding: 2px 8px;
		border: 1px solid;
		background: none;
		font-family: 'Courier New', monospace;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.15s;
	}
	.clear-done-btn {
		font-size: 9px;
		padding: 2px 8px;
		border: 1px solid var(--bmo-border);
		color: var(--bmo-muted);
		background: none;
		font-family: 'Courier New', monospace;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.clear-done-btn:hover {
		opacity: 0.7;
	}

	.progress-track {
		height: 2px;
		background: var(--bmo-border);
		margin: 0 10px;
		flex-shrink: 0;
	}
	.progress-fill {
		height: 100%;
		transition: width 0.3s;
	}

	.content-area {
		flex: 1;
		overflow-y: auto;
		padding: 6px 0;
	}

	.add-section {
		padding: 6px 10px 10px;
		border-bottom: 1px solid var(--bmo-border);
	}
	.add-form {
		width: 100%;
	}
	.add-row {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.add-text-input {
		flex: 2;
		min-width: 100px;
		font-size: 10px;
		padding: 4px 8px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
	}
	.add-section-input {
		flex: 1;
		min-width: 60px;
		font-size: 10px;
		padding: 4px 8px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		color: var(--bmo-text);
		font-family: 'Courier New', monospace;
	}
	.add-priority-select {
		font-size: 10px;
		padding: 4px 6px;
		border: 1px solid var(--bmo-border);
		background: var(--bmo-bg);
		font-family: 'Courier New', monospace;
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
		white-space: nowrap;
	}
	.add-btn:hover {
		opacity: 0.8;
	}

	.sections-list {
		padding: 0 6px;
	}

	.section-block {
		margin-bottom: 10px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 6px;
		border-bottom: 1px solid var(--bmo-border);
		margin-bottom: 2px;
	}
	.section-name {
		font-size: 10px;
		font-weight: bold;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--bmo-muted);
	}
	.section-count {
		font-size: 10px;
		color: var(--bmo-border);
	}
	.section-bar {
		flex: 1;
		height: 1px;
		background: var(--bmo-border);
		max-width: 80px;
	}
	.section-bar-fill {
		height: 100%;
		background: var(--bmo-green);
		transition: width 0.3s;
	}

	.tasks-list {
		display: flex;
		flex-direction: column;
	}

	.task-row {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 4px 6px;
		border-bottom: 1px solid color-mix(in srgb, var(--bmo-border) 30%, transparent);
	}

	.priority-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 5px;
	}

	.toggle-form {
		flex-shrink: 0;
	}
	.task-checkbox {
		width: 14px;
		height: 14px;
		border: 1px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		cursor: pointer;
		background: transparent;
		font-family: inherit;
		padding: 0;
		transition: all 0.15s;
		margin-top: 1px;
	}
	.task-checkbox:hover {
		opacity: 0.7;
	}

	.task-text {
		flex: 1;
		font-size: 12px;
		line-height: 1.4;
		min-width: 0;
	}

	.delete-form {
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.task-row:hover .delete-form {
		opacity: 1;
	}
	.delete-btn {
		background: none;
		border: none;
		color: var(--bmo-muted);
		font-size: 11px;
		cursor: pointer;
		font-family: inherit;
		padding: 0 2px;
		transition: opacity 0.15s;
	}
	.delete-btn:hover {
		opacity: 0.7;
	}

	.no-tasks {
		color: var(--bmo-muted);
		font-size: 11px;
		padding: 10px 6px;
	}
</style>
