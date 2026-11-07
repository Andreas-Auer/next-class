<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.
-->
<!-- Create or edit a course (overlay). Emits "close" with the saved course or null. -->
<template>
<div class="nc-overlay" @click.self="$emit('close', null)">
    <div class="bg-white rounded shadow p-4" style="width: 620px; max-height: 92vh; overflow: auto;" data-e2e="course-settings">
        <h4 class="mb-3">{{ course ? $t('course.settings') : $t('course.new') }}</h4>

        <label class="form-label fw-semibold" for="course-name">{{ $t('course.name') }}</label>
        <input id="course-name" v-model="form.name" class="form-control mb-3" data-e2e="course-name" maxlength="40" :placeholder="$t('course.nameplaceholder')">

        <label class="form-label fw-semibold">{{ $t('course.time') }}</label>
        <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
            <select v-model="form.time.mode" class="form-select form-select-sm" style="width: 170px;" data-e2e="course-timemode">
                <option value="clock">{{ $t('course.timeclock') }}</option>
                <option value="duration">{{ $t('course.timeduration') }}</option>
            </select>
            <template v-if="form.time.mode === 'clock'">
                <input v-model="form.time.start" type="time" class="form-control form-control-sm" style="width: 120px;" data-e2e="course-start">
                <span>–</span>
                <input v-model="form.time.end" type="time" class="form-control form-control-sm" style="width: 120px;" data-e2e="course-end">
            </template>
            <template v-else>
                <input v-model.number="hours" type="number" min="0" max="4" class="form-control form-control-sm" style="width: 70px;" data-e2e="course-hours"> <span>h</span>
                <input v-model.number="minutes" type="number" min="0" max="59" step="5" class="form-control form-control-sm" style="width: 80px;" data-e2e="course-minutes"> <span>min</span>
            </template>
        </div>

        <label class="form-label fw-semibold" for="course-template">{{ $t('course.template') }}</label>
        <select id="course-template" v-model="form.templateId" class="form-select mb-3" data-e2e="course-template">
            <option value="">{{ $t('course.notemplate') }}</option>
            <option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option>
        </select>

        <label class="form-label fw-semibold" for="course-exceptions">{{ $t('course.exceptions') }}</label>
        <textarea id="course-exceptions" v-model="exceptionsText" class="form-control mb-1" rows="2" data-e2e="course-exceptions" placeholder="lizenz.schule.at, 10.10.0.0/16"></textarea>
        <div class="text-secondary small mb-3">{{ $t('course.exceptionshint') }}</div>

        <label class="form-label fw-semibold">{{ $t('profile.folder') }}</label>
        <FolderField :folder="folder || defaultFolder" :is-default="!folder" @update="(f) => folder = f" />
        <div class="text-secondary small mb-3 mt-1">{{ folder ? '' : $t('profile.default') }}</div>

        <template v-if="course">
            <div class="mb-3">
                <span class="fw-semibold">{{ $t('course.pin') }}:</span> <code class="fs-5" data-e2e="course-pin">{{ course.pin }}</code>
                <button class="btn btn-sm btn-link" data-e2e="course-newpin" @click="newPin">{{ $t('course.newpin') }}</button>
            </div>
            <div class="mb-3">
                <div class="fw-semibold">{{ $t('course.teachers') }}</div>
                <div v-for="t in course.teachers" :key="t.name" class="d-flex align-items-center small">
                    <span class="me-auto">{{ t.name }}</span>
                    <button v-if="t.name !== ownName" class="btn btn-sm btn-link text-danger" @click="removeTeacher(t.name)">{{ $t('course.remove') }}</button>
                </div>
                <div class="text-secondary small">{{ $t('course.teachershint') }}</div>
            </div>
        </template>

        <div v-if="error" class="text-danger small mb-2">{{ error }}</div>
        <div class="d-flex gap-2">
            <button v-if="course" class="btn btn-outline-danger me-auto" data-e2e="course-delete" @click="remove">{{ $t('course.delete') }}</button>
            <span v-else class="me-auto"></span>
            <button class="btn btn-outline-secondary" @click="$emit('close', null)">{{ $t('general.cancel') }}</button>
            <button class="btn btn-success" data-e2e="course-save" :disabled="!form.name.trim()" @click="save">{{ $t('profile.save') }}</button>
        </div>
    </div>
</div>
</template>

<script>
import FolderField from './FolderField.vue'

export default {
    components: { FolderField },
    props: {
        course: { type: Object, default: null },
        templates: { type: Array, default: () => [] },
        defaultFolder: { type: String, default: '' },
        ownName: { type: String, default: '' },
    },
    emits: ['close'],
    data() {
        const c = this.course
        const time = c?.time ? { start: '08:00', end: '09:40', minutes: 50, ...c.time } : { mode: 'clock', start: '08:00', end: '09:40', minutes: 50 }
        return {
            form: { name: c?.name || '', time, templateId: c?.templateId || '' },
            hours: Math.floor((time.minutes || 50) / 60),
            minutes: (time.minutes || 50) % 60,
            exceptionsText: (c?.netExceptions || []).join('\n'),
            folder: c?.local?.folder || '',
            error: '',
        }
    },
    methods: {
        payload() {
            const time = this.form.time.mode === 'clock'
                ? { mode: 'clock', start: this.form.time.start, end: this.form.time.end }
                : { mode: 'duration', minutes: (Number(this.hours) || 0) * 60 + (Number(this.minutes) || 0) }
            return {
                name: this.form.name, time, templateId: this.form.templateId,
                netExceptions: this.exceptionsText.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean),
            }
        },
        async save() {
            const r = this.course
                ? await window.ipcRenderer.invoke('course-update', { id: this.course.id, ...this.payload() })
                : await window.ipcRenderer.invoke('course-create', this.payload())
            if (r.status !== 'success') { this.error = this.$t(`course.errors.${r.code}`); return }
            await window.ipcRenderer.invoke('course-set-local', { id: r.course.id, patch: { folder: this.folder } })
            this.$emit('close', r.course)
        },
        async newPin() {
            const r = await window.ipcRenderer.invoke('course-update', { id: this.course.id, regeneratePin: true })
            if (r.status === 'success') this.course.pin = r.course.pin   // eslint-disable-line vue/no-mutating-props
        },
        async removeTeacher(name) {
            await window.ipcRenderer.invoke('course-remove-teacher', { id: this.course.id, name })
            this.course.teachers = this.course.teachers.filter((t) => t.name !== name)   // eslint-disable-line vue/no-mutating-props
        },
        async remove() {
            const r = await this.$swal.fire({
                title: this.$t('course.delete'), text: this.$t('course.deleteconfirm', { name: this.course.name }),
                icon: 'warning', showCancelButton: true, confirmButtonText: this.$t('course.delete'), cancelButtonText: this.$t('general.cancel'),
            })
            if (!r.isConfirmed) return
            await window.ipcRenderer.invoke('course-delete', this.course.id)
            this.$emit('close', { deleted: true })
        },
    },
}
</script>

<style scoped>
.nc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
</style>
