import type { Component } from 'svelte';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigField = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'boolean' | 'select' | 'textarea' | 'datetime';
	default: unknown;
	options?: { label: string; value: string }[];
};

export type WidgetDataKind = 'websocket' | 'database' | 'none';

export type WidgetMeta = {
	id: string;
	label: string;
	description?: string;
	icon: string;
	category: 'environment' | 'identity' | 'creative' | 'build' | 'system' | 'content';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: () => Promise<{ default: Component<any> }>;
	defaultPosition: { colSpan: number; rowSpan: number };
	configSchema: ConfigField[];
	dataKind: WidgetDataKind;
	mutationRoute?: string;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, WidgetMeta> = {
	// ── Environment ────────────────────────────────────────────────────────

	sleep: {
		id: 'sleep',
		label: 'Sleep',
		description: "beau's current rest state",
		icon: '\u{1F319}',
		category: 'environment',
		component: () => import('./terminal/SleepWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	room: {
		id: 'room',
		label: 'Room',
		description: 'camera-based room occupancy state',
		icon: '\u{1F3E0}',
		category: 'environment',
		component: () => import('./terminal/RoomWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	weather: {
		id: 'weather',
		label: 'Weather',
		description: 'current conditions and seasonal context',
		icon: '\u{1F324}',
		category: 'environment',
		component: () => import('./terminal/WeatherWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [
			{
				key: 'units',
				label: 'Units',
				type: 'select',
				default: '°F',
				options: [
					{ label: '°F', value: '°F' },
					{ label: '°C', value: '°C' }
				]
			}
		],
		dataKind: 'websocket'
	},

	light: {
		id: 'light',
		label: 'Light',
		description: 'ambient lux reading from light sensor',
		icon: '\u{1F4A1}',
		category: 'environment',
		component: () => import('./terminal/LightWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	season: {
		id: 'season',
		label: 'Season',
		description: 'current season and time-of-year context',
		icon: '\u{1F342}',
		category: 'environment',
		component: () => import('./terminal/SeasonWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	camera: {
		id: 'camera',
		label: 'Camera',
		description: 'live camera presence detection feed',
		icon: '\u{1F4F7}',
		category: 'environment',
		component: () => import('./terminal/CameraWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	'event-timeline': {
		id: 'event-timeline',
		label: 'Event Timeline',
		description: 'chronological log of system events',
		icon: '\u{1F4DC}',
		category: 'environment',
		component: () => import('./terminal/EventTimelineWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 3 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 50
			}
		],
		dataKind: 'database'
	},

	'wellness-session': {
		id: 'wellness-session',
		label: 'Session Monitor',
		description: 'live cannabis device session — temp, device, duration',
		icon: '\u{1F321}',
		category: 'environment',
		component: () => import('./terminal/WellnessSessionWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'websocket'
	},

	'wellness-log': {
		id: 'wellness-log',
		label: 'Session Log',
		description: 'cannabis device session history and stats',
		icon: '\u{1F4CA}',
		category: 'environment',
		component: () => import('./terminal/WellnessLogWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 4 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 20
			}
		],
		dataKind: 'database'
	},

	'beau-vitals': {
		id: 'beau-vitals',
		label: 'Beau Vitals',
		description: 'compact system status — mode, emotion, weather',
		icon: '\u{1F4F6}',
		category: 'environment',
		component: () => import('./terminal/BeauVitalsWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 2 },
		configSchema: [],
		dataKind: 'websocket'
	},

	// ── Identity ───────────────────────────────────────────────────────────

	'soul-code': {
		id: 'soul-code',
		label: 'Soul Code',
		description: "beau's active soul code and core traits",
		icon: '\u{1F52E}',
		category: 'identity',
		component: () => import('./terminal/SoulCodeWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'database'
	},

	voice: {
		id: 'voice',
		label: 'Voice Lineage',
		description: 'trained voice model lineage and metadata',
		icon: '\u{1F399}',
		category: 'identity',
		component: () => import('./terminal/VoiceWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'database'
	},

	'natal-chart': {
		id: 'natal-chart',
		label: 'Natal Chart',
		description: "beau's natal profile and birth chart data",
		icon: '\u{2B50}',
		category: 'identity',
		component: () => import('./terminal/NatalChartWidget.svelte'),
		defaultPosition: { colSpan: 4, rowSpan: 3 },
		configSchema: [],
		dataKind: 'database'
	},

	journal: {
		id: 'journal',
		label: 'Journal',
		description: 'private journal entries with consent gate',
		icon: '\u{1F4D3}',
		category: 'identity',
		component: () => import('./terminal/JournalWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 5 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 20
			}
		],
		dataKind: 'database',
		mutationRoute: '/journal'
	},

	'inner-weather': {
		id: 'inner-weather',
		label: 'Inner Weather',
		description: "beau's self-narration — interpretation, mode, and vector whisper",
		icon: '\u{1F30A}',
		category: 'identity',
		component: () => import('./terminal/InnerWeatherWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 2 },
		configSchema: [],
		dataKind: 'websocket',
	},

	'vector-gauge': {
		id: 'vector-gauge',
		label: 'Vector Gauge',
		description: 'live personality vector bars with signal/momentum layer toggle',
		icon: '\u{1F4CA}',
		category: 'identity',
		component: () => import('./terminal/VectorGaugeWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 2 },
		configSchema: [
			{
				key: 'showLayers',
				label: 'Show Layers',
				type: 'boolean',
				default: false,
			},
		],
		dataKind: 'websocket',
	},

	// ── Creative ───────────────────────────────────────────────────────────

	resolume: {
		id: 'resolume',
		label: 'Resolume',
		description: 'live vj session status and witness mode',
		icon: '\u{1F3AC}',
		category: 'creative',
		component: () => import('./terminal/ResolumeWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	'last-haiku': {
		id: 'last-haiku',
		label: 'Last Haiku',
		description: 'most recent haiku from beau',
		icon: '\u{1F38B}',
		category: 'creative',
		component: () => import('./terminal/LastHaikuWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 2 },
		configSchema: [],
		dataKind: 'websocket'
	},

	'haiku-archive': {
		id: 'haiku-archive',
		label: 'Haiku Archive',
		description: 'searchable archive of all haikus beau has written',
		icon: '\u{1F38B}',
		category: 'creative',
		component: () => import('./terminal/HaikuArchiveWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 5 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 50
			},
			{
				key: 'filter',
				label: 'Filter',
				type: 'text',
				default: ''
			}
		],
		dataKind: 'database'
	},

	'sessions-log': {
		id: 'sessions-log',
		label: 'Sessions Log',
		description: 'resolume session history and debrief log',
		icon: '\u{1F3AD}',
		category: 'creative',
		component: () => import('./terminal/SessionsLogWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 5 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 20
			}
		],
		dataKind: 'database'
	},

	photography: {
		id: 'photography',
		label: 'Photography',
		description: 'photo gallery and session photo browser',
		icon: '\u{1F4F8}',
		category: 'creative',
		component: () => import('./terminal/PhotographyWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 5 },
		configSchema: [],
		dataKind: 'database',
		mutationRoute: '/photography'
	},

	// ── Build ──────────────────────────────────────────────────────────────

	'workshop-progress': {
		id: 'workshop-progress',
		label: 'Workshop Progress',
		description: 'parts, software, ideas, and tasks at a glance',
		icon: '\u{1F6E0}',
		category: 'build',
		component: () => import('./terminal/WorkshopProgressWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'database'
	},

	'blocked-waiting': {
		id: 'blocked-waiting',
		label: 'Blocked / Waiting',
		description: 'parts in transit or on order',
		icon: '\u{23F3}',
		category: 'build',
		component: () => import('./terminal/BlockedWaitingWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'database'
	},

	'next-steps': {
		id: 'next-steps',
		label: 'Next Steps',
		description: 'curated list of what to work on next',
		icon: '\u{27A1}',
		category: 'build',
		component: () => import('./terminal/NextStepsWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'database'
	},

	'build-stats': {
		id: 'build-stats',
		label: 'Build Stats',
		description: 'aggregate build progress numbers',
		icon: '\u{1F527}',
		category: 'build',
		component: () => import('./terminal/BuildStatsWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 2 },
		configSchema: [],
		dataKind: 'database'
	},

	'parts-tracker': {
		id: 'parts-tracker',
		label: 'Parts Tracker',
		description: 'sortable parts table with inline editing',
		icon: '\u{1F529}',
		category: 'build',
		component: () => import('./terminal/PartsTrackerWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 8 },
		configSchema: [
			{
				key: 'category',
				label: 'Category',
				type: 'text',
				default: ''
			},
			{
				key: 'sort',
				label: 'Sort',
				type: 'select',
				default: 'name',
				options: [
					{ label: 'Name', value: 'name' },
					{ label: 'Status', value: 'status' },
					{ label: 'Delivery', value: 'delivery' }
				]
			}
		],
		dataKind: 'database',
		mutationRoute: '/parts'
	},

	'software-build': {
		id: 'software-build',
		label: 'Software Build',
		description: 'phased software checklist with progress bars',
		icon: '\u{1F4BB}',
		category: 'build',
		component: () => import('./terminal/SoftwareBuildWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 6 },
		configSchema: [],
		dataKind: 'database',
		mutationRoute: '/software'
	},

	ideas: {
		id: 'ideas',
		label: 'Ideas',
		description: 'kanban-style ideas board with priority filter',
		icon: '\u{1F4A1}',
		category: 'build',
		component: () => import('./terminal/IdeasWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 5 },
		configSchema: [
			{
				key: 'priority',
				label: 'Priority',
				type: 'select',
				default: 'all',
				options: [
					{ label: 'All', value: 'all' },
					{ label: 'High', value: 'high' },
					{ label: 'Medium', value: 'medium' },
					{ label: 'Low', value: 'low' }
				]
			}
		],
		dataKind: 'database',
		mutationRoute: '/ideas'
	},

	todos: {
		id: 'todos',
		label: 'Todos',
		description: 'sectioned task list with completion tracking',
		icon: '\u{2705}',
		category: 'build',
		component: () => import('./terminal/TodosWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 6 },
		configSchema: [
			{
				key: 'section',
				label: 'Section',
				type: 'text',
				default: ''
			}
		],
		dataKind: 'database',
		mutationRoute: '/todo'
	},

	// ── System ─────────────────────────────────────────────────────────────

	'integrations-status': {
		id: 'integrations-status',
		label: 'Integrations Status',
		description: 'connection status for all integrations',
		icon: '\u26A1',
		category: 'system',
		component: () => import('./terminal/IntegrationsStatusWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'database'
	},

	'recent-activity': {
		id: 'recent-activity',
		label: 'Recent Activity',
		description: 'what happened recently across the build',
		icon: '\u{1F4CB}',
		category: 'system',
		component: () => import('./terminal/RecentActivityWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 4 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 10
			}
		],
		dataKind: 'database'
	},

	mode: {
		id: 'mode',
		label: 'Mode',
		description: "beau's current operating mode",
		icon: '\u{2699}\u{FE0F}',
		category: 'system',
		component: () => import('./terminal/ModeWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	emotion: {
		id: 'emotion',
		label: 'Emotion',
		description: "beau's current emotional state",
		icon: '\u{1F49A}',
		category: 'system',
		component: () => import('./terminal/EmotionWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket'
	},

	'dispatcher-log': {
		id: 'dispatcher-log',
		label: 'Dispatcher Log',
		description: 'live brain routing and dispatch events',
		icon: '\u{1F4E1}',
		category: 'system',
		component: () => import('./terminal/DispatcherLogWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 2 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 8
			}
		],
		dataKind: 'websocket'
	},

	'prompt-console': {
		id: 'prompt-console',
		label: 'Prompt Console',
		description: 'send mqtt prompts and view response history',
		icon: '\u{2328}\u{FE0F}',
		category: 'system',
		component: () => import('./terminal/PromptConsoleWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 4 },
		configSchema: [],
		dataKind: 'database',
		mutationRoute: '/prompt'
	},

	'prompt-history': {
		id: 'prompt-history',
		label: 'Prompt History',
		description: 'recent prompts sent to beau',
		icon: '\u{1F4CB}',
		category: 'system',
		component: () => import('./terminal/PromptHistoryWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 3 },
		configSchema: [
			{
				key: 'limit',
				label: 'Limit',
				type: 'number',
				default: 20
			}
		],
		dataKind: 'database'
	},

	// ── Content ────────────────────────────────────────────────────────────

	markdown: {
		id: 'markdown',
		label: 'Markdown Notes',
		description: 'custom markdown content block',
		icon: '\u{1F4DD}',
		category: 'content',
		component: () => import('./content/MarkdownWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [
			{
				key: 'text',
				label: 'Text',
				type: 'textarea',
				default: '# Notes\n\nWrite here...'
			}
		],
		dataKind: 'none'
	},

	clock: {
		id: 'clock',
		label: 'Clock',
		description: 'simple clock display',
		icon: '\u{1F550}',
		category: 'content',
		component: () => import('./content/ClockWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 1 },
		configSchema: [
			{
				key: 'timezone',
				label: 'Timezone',
				type: 'select',
				default: 'Local',
				options: [
					{ label: 'Local', value: 'Local' },
					{ label: 'UTC', value: 'UTC' },
					{ label: 'America/New_York', value: 'America/New_York' },
					{ label: 'America/Chicago', value: 'America/Chicago' },
					{ label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
					{ label: 'Asia/Seoul', value: 'Asia/Seoul' },
					{ label: 'Europe/London', value: 'Europe/London' }
				]
			},
			{
				key: 'format',
				label: 'Format',
				type: 'select',
				default: '12h',
				options: [
					{ label: '12h', value: '12h' },
					{ label: '24h', value: '24h' }
				]
			}
		],
		dataKind: 'none'
	},

	countdown: {
		id: 'countdown',
		label: 'Countdown',
		description: 'countdown timer to a target date',
		icon: '\u{23F1}',
		category: 'content',
		component: () => import('./content/CountdownWidget.svelte'),
		defaultPosition: { colSpan: 4, rowSpan: 1 },
		configSchema: [
			{
				key: 'label',
				label: 'Label',
				type: 'text',
				default: 'Countdown'
			},
			{
				key: 'targetDate',
				label: 'Target Date',
				type: 'datetime',
				default: ''
			}
		],
		dataKind: 'none'
	},

	'link-card': {
		id: 'link-card',
		label: 'Link Card',
		description: 'styled link with title and description',
		icon: '\u{1F517}',
		category: 'content',
		component: () => import('./content/LinkCardWidget.svelte'),
		defaultPosition: { colSpan: 4, rowSpan: 1 },
		configSchema: [
			{
				key: 'url',
				label: 'URL',
				type: 'text',
				default: ''
			},
			{
				key: 'title',
				label: 'Title',
				type: 'text',
				default: ''
			},
			{
				key: 'description',
				label: 'Description',
				type: 'text',
				default: ''
			}
		],
		dataKind: 'none'
	},

	image: {
		id: 'image',
		label: 'Image',
		description: 'display an image from a url or path',
		icon: '\u{1F5BC}',
		category: 'content',
		component: () => import('./content/ImageWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [
			{
				key: 'src',
				label: 'Source',
				type: 'text',
				default: ''
			},
			{
				key: 'alt',
				label: 'Alt Text',
				type: 'text',
				default: ''
			},
			{
				key: 'fit',
				label: 'Fit',
				type: 'select',
				default: 'cover',
				options: [
					{ label: 'Cover', value: 'cover' },
					{ label: 'Contain', value: 'contain' }
				]
			}
		],
		dataKind: 'none'
	},

	embed: {
		id: 'embed',
		label: 'Embed',
		description: 'embed an external url in an iframe',
		icon: '\u{1F310}',
		category: 'content',
		component: () => import('./content/EmbedWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [
			{
				key: 'url',
				label: 'URL',
				type: 'text',
				default: ''
			},
			{
				key: 'height',
				label: 'Height',
				type: 'number',
				default: 300
			}
		],
		dataKind: 'none'
	},

	divider: {
		id: 'divider',
		label: 'Divider',
		description: 'horizontal rule to separate content areas',
		icon: '\u{2796}',
		category: 'content',
		component: () => import('./content/DividerWidget.svelte'),
		defaultPosition: { colSpan: 12, rowSpan: 1 },
		configSchema: [
			{
				key: 'style',
				label: 'Style',
				type: 'select',
				default: 'solid',
				options: [
					{ label: 'Solid', value: 'solid' },
					{ label: 'Dashed', value: 'dashed' },
					{ label: 'Dotted', value: 'dotted' }
				]
			},
			{
				key: 'label',
				label: 'Label',
				type: 'text',
				default: ''
			}
		],
		dataKind: 'none'
	},

	'bmo-face': {
		id: 'bmo-face',
		label: 'BMO Face',
		description: 'reactive BMO face — reflects emotional state',
		icon: '\u{1F916}',
		category: 'content',
		component: () => import('./content/BmoFaceWidget.svelte'),
		defaultPosition: { colSpan: 3, rowSpan: 1 },
		configSchema: [],
		dataKind: 'websocket',
	},

	'quick-capture': {
		id: 'quick-capture',
		label: 'Quick Capture',
		description: 'capture ideas, tasks, or notes instantly',
		icon: '\u{270F}',
		category: 'content',
		component: () => import('./content/QuickCaptureWidget.svelte'),
		defaultPosition: { colSpan: 6, rowSpan: 3 },
		configSchema: [],
		dataKind: 'none'
	}
};

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export const WIDGET_CATEGORIES: { id: WidgetMeta['category']; label: string }[] = [
	{ id: 'environment', label: 'Environment' },
	{ id: 'identity', label: 'Identity' },
	{ id: 'creative', label: 'Creative' },
	{ id: 'build', label: 'Build' },
	{ id: 'system', label: 'System' },
	{ id: 'content', label: 'Content' }
];

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getWidgetMeta(id: string): WidgetMeta | undefined {
	return REGISTRY[id];
}

export function getAllWidgets(): WidgetMeta[] {
	return Object.values(REGISTRY);
}

export function getWidgetsByCategory(category: WidgetMeta['category']): WidgetMeta[] {
	return Object.values(REGISTRY).filter((w) => w.category === category);
}
