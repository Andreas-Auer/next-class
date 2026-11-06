<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.

  Program lock: choose the allowed programs (catalog + own programs), save them as a template.
-->
<template>
<div class="nc-overlay" @click.self="$emit('close')">
    <div class="nc-modal card shadow" data-e2e="applock-picker">
        <div class="card-header d-flex align-items-center">
            <strong class="me-auto">{{ $t('applock.pickertitle') }}</strong>
            <button class="btn-close" @click="$emit('close')"></button>
        </div>
        <div class="card-body overflow-auto">
            <p class="small text-secondary">{{ $t('applock.pickerhint') }}</p>
            <div v-for="group in groups" :key="group.name" class="mb-3">
                <div class="fw-bold small text-uppercase text-secondary mb-1">{{ group.name }}</div>
                <div class="d-flex flex-wrap">
                    <div v-for="entry in group.entries" :key="entry.id" class="form-check me-3 mb-1" style="min-width: 220px;">
                        <input :id="`app-${entry.id}`" type="checkbox" class="form-check-input" :value="entry.id" v-model="selected" :data-e2e="`app-${entry.id}`">
                        <label :for="`app-${entry.id}`" class="form-check-label">{{ entry.label }}
                            <span class="text-secondary small">{{ platformsOf(entry) }}</span>
                        </label>
                        <button v-if="entry.custom" class="btn btn-link btn-sm text-danger p-0 ms-1" :title="$t('applock.deletecustom')" @click="$emit('delete-custom', entry.id)">✕</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="card-footer d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm" @click="saveAsTemplate">{{ $t('applock.saveastemplate') }}</button>
            <span class="me-auto small text-secondary align-self-center">{{ $t('applock.selectedcount', { n: selected.length }) }}</span>
            <button class="btn btn-secondary btn-sm" @click="$emit('close')">{{ $t('general.cancel') }}</button>
            <button class="btn btn-primary btn-sm" data-e2e="applock-picker-apply" @click="$emit('apply', [...selected])">{{ $t('applock.apply') }}</button>
        </div>
    </div>
</div>
</template>

<script>
export default {
    props: {
        catalog: { type: Array, required: true },
        customEntries: { type: Array, default: () => [] },
        allowedIds: { type: Array, default: () => [] },
    },
    emits: ['close', 'apply', 'save-template', 'delete-custom'],
    data() {
        return { selected: [...this.allowedIds] }
    },
    computed: {
        groups() {
            const groups = new Map()
            if (this.customEntries.length) groups.set(this.$t('applock.ownprograms'), [...this.customEntries])
            for (const entry of this.catalog) {
                if (!groups.has(entry.category)) groups.set(entry.category, [])
                groups.get(entry.category).push(entry)
            }
            return [...groups.entries()].map(([name, entries]) => ({ name, entries }))
        },
    },
    methods: {
        platformsOf(entry) {
            const p = []
            if (entry.win) p.push('Win')
            if (entry.mac) p.push('Mac')
            if (entry.linux) p.push('Linux')
            return p.length ? `(${p.join(', ')})` : ''
        },
        async saveAsTemplate() {
            const result = await this.$swal.fire({
                title: this.$t('applock.saveastemplate'),
                input: 'text',
                inputPlaceholder: this.$t('applock.templatename'),
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
                inputValidator: (v) => (!v || !v.trim() ? this.$t('applock.templatename') : undefined),
            })
            if (result.isConfirmed) this.$emit('save-template', { name: result.value.trim(), allowed: [...this.selected] })
        },
    },
}
</script>

<style scoped>
.nc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
.nc-modal { width: min(900px, 92vw); max-height: 86vh; display: flex; flex-direction: column; }
</style>
