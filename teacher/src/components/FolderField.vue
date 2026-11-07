<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.
-->
<!-- Shows a folder path with "Change …" / "Open" (and "Use default" when a custom folder is set). -->
<template>
<div>
    <div class="d-flex align-items-center gap-2 flex-wrap">
        <code class="bg-white border rounded px-2 py-1 text-break" data-e2e="folder-path" :title="folder">{{ folder }}</code>
        <button class="btn btn-sm btn-outline-primary" data-e2e="folder-change" @click="change">{{ $t('profile.change') }}</button>
        <button v-if="showOpen" class="btn btn-sm btn-outline-secondary" data-e2e="folder-open" @click="open">{{ $t('profile.open') }}</button>
        <button v-if="!isDefault" class="btn btn-sm btn-link" data-e2e="folder-default" @click="$emit('update', '')">{{ $t('profile.usedefault') }}</button>
    </div>
    <div v-if="error" class="text-danger small mt-1">{{ $t('profile.foldermissing') }}</div>
</div>
</template>

<script>
export default {
    props: {
        folder: { type: String, default: '' },
        isDefault: { type: Boolean, default: true },
        showOpen: { type: Boolean, default: true },
    },
    emits: ['update'],
    data() {
        return { error: false }
    },
    methods: {
        async change() {
            const chosen = await window.ipcRenderer.invoke('choose-folder', this.folder)
            if (chosen) this.$emit('update', chosen)
        },
        async open() {
            const r = await window.ipcRenderer.invoke('open-folder', this.folder)
            this.error = r?.status !== 'success'
        },
    },
}
</script>
