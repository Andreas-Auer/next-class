<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.
-->
<!-- Tasks of the lesson: create (with material), see who handed in, open the folder. -->
<template>
<div class="nc-overlay" @click.self="$emit('close')">
    <div class="bg-white rounded shadow p-4" style="width: min(820px, 94vw); max-height: 92vh; overflow: auto;" data-e2e="tasks-dialog">
        <div class="d-flex align-items-center mb-3">
            <h4 class="me-auto mb-0">{{ $t('tasks.title') }}</h4>
            <button class="btn btn-success btn-sm me-2" data-e2e="task-new" @click="startNew">+ {{ $t('tasks.new') }}</button>
            <button class="btn-close" @click="$emit('close')"></button>
        </div>

        <!-- new task -->
        <div v-if="form" class="border rounded p-3 mb-3" style="background:#f8f9fa;" data-e2e="task-form">
            <label class="form-label fw-semibold mb-1" for="task-title">{{ $t('tasks.tasktitle') }}</label>
            <input id="task-title" v-model="form.title" class="form-control mb-2" maxlength="120" :placeholder="$t('tasks.titleplaceholder')" data-e2e="task-title">
            <label class="form-label fw-semibold mb-1" for="task-text">{{ $t('tasks.text') }}</label>
            <textarea id="task-text" v-model="form.text" class="form-control mb-2" rows="3" data-e2e="task-text"></textarea>
            <div class="d-flex flex-wrap gap-3 mb-2 align-items-center">
                <label class="small">{{ $t('tasks.deadline') }}
                    <input v-model="form.deadline" type="time" class="form-control form-control-sm d-inline-block ms-1" style="width: 120px;" data-e2e="task-deadline">
                </label>
                <label class="small">{{ $t('tasks.limit') }}
                    <input v-model.number="form.maxMb" type="number" min="1" max="10240" class="form-control form-control-sm d-inline-block ms-1" style="width: 100px;" data-e2e="task-limit"> MB
                </label>
            </div>
            <div class="mb-2">
                <div class="small fw-semibold">{{ $t('tasks.material') }}</div>
                <div v-for="(p, i) in form.materials" :key="p" class="small">📄 {{ baseName(p) }} <button class="btn btn-sm btn-link p-0 text-danger" @click="form.materials.splice(i, 1)">✕</button></div>
                <button class="btn btn-sm btn-outline-secondary mt-1" data-e2e="task-add-material" @click="pickMaterial">{{ $t('tasks.addmaterial') }}</button>
            </div>
            <div class="small mb-2" data-e2e="task-folder">
                {{ $t('tasks.storedin') }} <code>{{ folder }}</code>
                <button class="btn btn-sm btn-link p-0 ms-1" @click="changeFolder">{{ $t('profile.change') }}</button>
            </div>
            <div v-if="error" class="text-danger small mb-2">{{ error }}</div>
            <button class="btn btn-success btn-sm me-2" :disabled="!form.title.trim() || busy" data-e2e="task-create" @click="create">{{ $t('tasks.create') }}</button>
            <button class="btn btn-outline-secondary btn-sm" @click="form = null">{{ $t('general.cancel') }}</button>
        </div>

        <div v-if="!tasks.length && !form" class="text-secondary">{{ $t('tasks.none') }}</div>
        <div v-for="task in tasks" :key="task.id" class="border rounded p-3 mb-3" :data-e2e="`taskcard-${task.title}`">
            <div class="d-flex align-items-start">
                <div class="me-auto">
                    <h5 class="mb-0">📝 {{ task.title }} <span v-if="!task.open" class="badge bg-secondary">{{ $t('tasks.closed') }}</span></h5>
                    <div class="small text-secondary">{{ task.folderName }}<span v-if="task.deadline"> · {{ $t('tasks.until', { time: formatTime(task.deadline) }) }}</span></div>
                </div>
                <button class="btn btn-sm btn-outline-primary me-2" data-e2e="task-open-folder" @click="openFolder(task)">{{ $t('tasks.openfolder') }}</button>
                <button v-if="task.open" class="btn btn-sm btn-outline-secondary" @click="$emit('close-task', task)">{{ $t('tasks.close') }}</button>
            </div>
            <div class="small mt-1">
                <strong :data-e2e="`taskcount-${task.title}`">{{ $t('tasks.count', { n: doneCount(task), total: rows(task).length }) }}</strong>
                · <span :class="localStored(task) === task.fileCount ? 'text-success' : 'text-warning'" :data-e2e="`tasklocal-${task.title}`">
                    {{ $t('tasks.localstored', { n: localStored(task), total: task.fileCount }) }}</span>
            </div>
            <div class="d-flex flex-wrap gap-1 mt-2">
                <span v-for="r in rows(task)" :key="r.id" class="badge" :class="badgeClass(r.state)" :title="r.files" :data-e2e="`taskstate-${r.name}-${r.state}`">{{ r.name }}</span>
            </div>
        </div>
    </div>
</div>
</template>

<script>
import { submissionState } from 'next-class-shared/submissionRules.js'

export default {
    props: {
        tasks: { type: Array, default: () => [] },
        students: { type: Array, default: () => [] },
        courseId: { type: String, default: '' },
        localCounts: { type: Object, default: () => ({}) },   // taskId -> files stored on this device
    },
    emits: ['close', 'create', 'close-task'],
    data() {
        return { form: null, folder: '', error: '', busy: false }
    },
    async mounted() {
        await this.loadFolder()
    },
    methods: {
        async loadFolder() {
            const profile = await window.ipcRenderer.invoke('profile-get')
            const local = this.courseId ? await window.ipcRenderer.invoke('course-local', this.courseId) : null
            this.folder = local?.folder || profile.folder
        },
        startNew() {
            this.form = { title: '', text: '', deadline: '', maxMb: 1024, materials: [] }
            this.error = ''
        },
        baseName(p) { return String(p).split(/[\\/]/).pop() },
        async pickMaterial() {
            const files = await window.ipcRenderer.invoke('choose-files')
            if (files?.length) this.form.materials.push(...files.filter((f) => !this.form.materials.includes(f)))
        },
        async changeFolder() {
            const chosen = await window.ipcRenderer.invoke('choose-folder', this.folder)
            if (!chosen) return
            if (this.courseId) await window.ipcRenderer.invoke('course-set-local', { id: this.courseId, patch: { folder: chosen } })
            else await window.ipcRenderer.invoke('profile-set', { folder: chosen })
            await this.loadFolder()
        },
        deadlineTs() {
            if (!this.form.deadline) return null
            const [h, m] = this.form.deadline.split(':').map(Number)
            const d = new Date()
            d.setHours(h, m, 0, 0)
            return d.getTime()
        },
        async create() {
            this.busy = true
            this.error = ''
            try {
                const err = await new Promise((resolve) => this.$emit('create', {
                    title: this.form.title, text: this.form.text, deadline: this.deadlineTs(), maxMb: this.form.maxMb, materials: [...this.form.materials],
                }, resolve))
                if (err) this.error = err
                else this.form = null
            } finally {
                this.busy = false
            }
        },
        async openFolder(task) {
            await window.ipcRenderer.invoke('open-folder', `${this.folder}/${task.folderName}`)
        },
        /** One row per student of the lesson (incl. absent course students). */
        rows(task) {
            const subs = task.submissions || {}
            const list = this.students.map((st) => {
                const id = st.courseKey || st.clientname
                const sub = subs[id]
                return { id, name: st.clientname, state: submissionState(task, sub ? { files: sub.files, firstAt: sub.firstAt } : null), files: (sub?.files || []).map((f) => f.name).join('\n') }
            })
            for (const [id, sub] of Object.entries(subs)) {
                if (!list.some((r) => r.id === id)) list.push({ id, name: sub.student, state: submissionState(task, sub), files: sub.files.map((f) => f.name).join('\n') })
            }
            return list
        },
        doneCount(task) { return this.rows(task).filter((r) => r.state !== 'none').length },
        localStored(task) { return this.localCounts[task.id] ?? 0 },
        badgeClass(state) { return state === 'done' ? 'bg-success' : state === 'late' ? 'text-bg-warning' : 'bg-secondary' },
        formatTime(ts) { return new Date(ts).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) },
    },
}
</script>

<style scoped>
.nc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
.text-bg-warning { background: #fd7e14 !important; color: #fff !important; }
</style>
