<script lang="ts">
	let { config }: { config: Record<string, unknown>; data?: unknown } = $props();

	function escapeHtml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderMarkdown(raw: string): string {
		let html = escapeHtml(raw);

		// headings (must come before bold since ### uses multiple #)
		html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
		html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
		html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

		// bold and italic
		html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

		// links [text](url)
		html = html.replace(
			/\[(.+?)\]\((.+?)\)/g,
			'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
		);

		// list items
		html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
		// wrap consecutive <li> in <ul>
		html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

		// line breaks (double newline = paragraph break, single = <br>)
		html = html.replace(/\n\n/g, '</p><p>');
		html = html.replace(/\n/g, '<br>');
		html = '<p>' + html + '</p>';

		// clean up empty paragraphs
		html = html.replace(/<p>\s*<\/p>/g, '');

		return html;
	}

	let rendered = $derived(renderMarkdown(typeof config.text === 'string' ? config.text : ''));
</script>

<div class="markdown-widget">
	{@html rendered}
</div>

<style>
	.markdown-widget {
		width: 100%;
		height: 100%;
		padding: 0.75rem;
		overflow: auto;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.85rem;
		color: var(--bmo-text);
	}

	.markdown-widget :global(h1) {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--bmo-green);
		margin: 0 0 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.markdown-widget :global(h2) {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--bmo-green);
		margin: 0.75rem 0 0.4rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.markdown-widget :global(h3) {
		font-size: 1rem;
		font-weight: 600;
		color: var(--bmo-green);
		margin: 0.5rem 0 0.3rem;
		letter-spacing: 0.05em;
	}

	.markdown-widget :global(p) {
		margin: 0.3rem 0;
		line-height: 1.6;
	}

	.markdown-widget :global(strong) {
		color: var(--bmo-green);
		font-weight: 700;
	}

	.markdown-widget :global(em) {
		font-style: italic;
		color: var(--bmo-muted);
	}

	.markdown-widget :global(a) {
		color: var(--bmo-green);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.markdown-widget :global(a:hover) {
		opacity: 0.8;
	}

	.markdown-widget :global(ul) {
		margin: 0.3rem 0;
		padding-left: 1.2rem;
		list-style: none;
	}

	.markdown-widget :global(li) {
		position: relative;
		padding-left: 0.6rem;
		margin: 0.15rem 0;
	}

	.markdown-widget :global(li::before) {
		content: '>';
		position: absolute;
		left: -0.6rem;
		color: var(--bmo-green);
		font-weight: 700;
	}
</style>
