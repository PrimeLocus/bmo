<script lang="ts">
  import { enhance } from '$app/forms';
  import PanelCanvas from '$lib/components/PanelCanvas.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import type { PageData, ActionData } from './$types.js';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  let showUpload = $state(false);
</script>

<div class="max-w-4xl">
  <div class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl tracking-widest font-bold" style="color: var(--bmo-green)">PHOTOGRAPHY</h1>
      <p class="text-xs mt-1" style="color: var(--bmo-muted)">instant archive</p>
    </div>
    <button onclick={() => showUpload = !showUpload}
            class="text-xs tracking-widest px-3 py-2 border transition-all"
            style="border-color: var(--bmo-border); color: var(--bmo-green); background: transparent">
      {showUpload ? 'CANCEL' : '+ UPLOAD'}
    </button>
  </div>

  <PanelCanvas pageId="/photography">
  <Panel id="photography:gallery" label="Gallery" defaultPosition={{ col: 0, row: 0, colSpan: 12, rowSpan: 5 }}>

  {#if showUpload}
    <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={() => {
      return async ({ result, update }) => {
        await update();
        if (result.type === 'success') showUpload = false;
      };
    }}
          class="p-4 mb-6 border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      {#if form?.error}
        <div class="text-xs mb-3 p-2 border" style="color: #d63031; border-color: #d63031">{form.error}</div>
      {/if}
      <div class="space-y-3">
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">FILE</label>
          <input type="file" name="photo" accept="image/*" required
                 class="text-xs w-full" style="color: var(--bmo-text)" />
        </div>
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">NOTES</label>
          <input type="text" name="notes" placeholder="optional notes"
                 class="text-xs w-full p-2 border bg-transparent"
                 style="border-color: var(--bmo-border); color: var(--bmo-text)" />
        </div>
        <div>
          <label class="text-xs tracking-widest block mb-1" style="color: var(--bmo-muted)">SOURCE</label>
          <select name="sourceType" class="text-xs p-2 border bg-transparent"
                  style="border-color: var(--bmo-border); color: var(--bmo-text); background: var(--bmo-bg)">
            <option value="instant_scan">Instant Scan</option>
            <option value="digital">Digital</option>
            <option value="nfc_share">NFC Share</option>
            <option value="camera_capture">Camera Capture</option>
          </select>
        </div>
        <button type="submit"
                class="text-xs tracking-widest px-4 py-2 font-bold border"
                style="border-color: var(--bmo-green); color: var(--bmo-bg); background: var(--bmo-green)">
          UPLOAD
        </button>
      </div>
    </form>
  {/if}

  {#if data.photos.length === 0}
    <div class="p-8 text-center border" style="border-color: var(--bmo-border); background: var(--bmo-surface)">
      <div class="text-xs tracking-widest" style="color: var(--bmo-muted)">NO PHOTOS YET</div>
      <div class="text-xs mt-2" style="color: var(--bmo-muted)">
        upload photos from sessions or daily life
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-3 md:grid-cols-4 gap-2">
      {#each data.photos as photo}
        <div class="group relative aspect-square border overflow-hidden"
             style="border-color: var(--bmo-border); background: var(--bmo-surface)">
          <img src="/photos/{photo.thumbnailPath || photo.imagePath}"
               alt={photo.caption || 'photo'}
               class="w-full h-full object-cover" />
          <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2"
               style="background: linear-gradient(transparent 40%, rgba(10,15,13,0.9))">
            {#if photo.caption}
              <div class="text-xs mb-1 truncate" style="color: var(--bmo-text)">{photo.caption}</div>
            {/if}
            <div class="flex justify-between items-center">
              <span class="text-xs" style="color: var(--bmo-muted)">
                {new Date(photo.createdAt).toLocaleDateString()}
              </span>
              <span class="text-xs tracking-widest" style="color: var(--bmo-muted)">
                {photo.sourceType.toUpperCase().replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if data.totalPages > 1}
      <div class="flex justify-center gap-2 mt-4">
        {#if data.page > 1}
          <a href="?page={data.page - 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">PREV</a>
        {/if}
        <span class="text-xs px-3 py-1" style="color: var(--bmo-muted)">
          {data.page} / {data.totalPages}
        </span>
        {#if data.page < data.totalPages}
          <a href="?page={data.page + 1}" class="text-xs px-3 py-1 border"
             style="border-color: var(--bmo-border); color: var(--bmo-green)">NEXT</a>
        {/if}
      </div>
    {/if}
  {/if}

  </Panel>
  </PanelCanvas>
</div>
