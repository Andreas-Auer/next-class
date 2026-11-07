<!--
  @license GPL LICENSE
  Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
  Modifications for Next-Class (c) 2026 Andreas Auer
  This program is free software: you can redistribute it and/or modify it under the terms of the
  GNU General Public License as published by the Free Software Foundation, either version 3 of the
  License, or any later version. See <http://www.gnu.org/licenses/>.
-->
<template>
<div class="d-flex flex-column" style="height: 100vh;">
    <!-- Header -->
    <div class="w-100 p-3 text-white bg-dark d-flex align-items-center flex-shrink-0" style="height: 63px;">
        <img src="/src/assets/img/svg/shield-lock-fill.svg" class="white me-2" width="32" height="32">
        <span class="me-auto" style="font-size: 23px;">Next-Class</span>
        <div v-if="!hostip?.hostip" class="btn btn-sm btn-outline-danger me-3" style="cursor: unset;">{{ $t('general.offline') }}</div>
        <div v-else class="btn btn-sm btn-outline-success me-3" @click="selectPreferredInterface">{{ hostip.interface }} : {{ hostip.hostip }}</div>
        <span style="font-size: 23px;">{{ $t('general.teacher') }}</span>
    </div>

    <div class="d-flex flex-grow-1" style="min-height: 0;">
        <!-- Sidebar -->
        <div class="p-3 text-white bg-dark h-100 d-flex flex-column" style="width: 240px; min-width: 240px;">
            <div class="btn btn-light text-start" style="cursor: default;">
                <img src="/src/assets/img/svg/server.svg" class="me-2" width="16" height="16"> {{ $t('startserver.title') }}
            </div>
            <button class="btn btn-outline-light text-start mt-2" data-e2e="open-settings" @click="$router.push({ name: 'settings' })">
                ⚙ {{ $t('profile.settings') }}
            </button>
            <div class="mt-auto">
                <div v-if="profile?.name" class="small text-secondary mb-2" data-e2e="profile-name">{{ profile.name }}</div>
                <button class="btn btn-outline-secondary btn-sm mb-2" @click="toggleLocale">{{ inactiveLocale }}</button><br>
                <span style="font-size: 0.8em; cursor: pointer;" @click="showCopyleft">
                    <span style="display:inline-block; transform: scaleX(-1);">&copy;</span> {{ config.version }} {{ config.info }}
                </span>
            </div>
        </div>

        <!-- first start: name and submission folder, asked once -->
        <div v-if="profile && !profile.name" class="flex-grow-1 p-4 overflow-auto" style="background-color: #f5f5f5;" data-e2e="welcome">
            <div class="bg-white border rounded p-4" style="max-width: 560px;">
                <h4 class="mb-2">{{ $t('profile.welcome') }}</h4>
                <p class="text-secondary">{{ $t('profile.welcometext') }}</p>
                <label class="form-label fw-semibold" for="welcome-name">{{ $t('profile.name') }}</label>
                <input id="welcome-name" v-model="welcomeName" class="form-control mb-3" data-e2e="welcome-name" maxlength="40"
                       :placeholder="$t('profile.nameplaceholder')" @keyup.enter="saveWelcome">
                <label class="form-label fw-semibold">{{ $t('profile.folder') }}</label>
                <FolderField :folder="welcomeFolder || profile.defaultFolder" :is-default="!welcomeFolder" :show-open="false" @update="(f) => welcomeFolder = f" />
                <p class="text-secondary small mt-1">{{ $t('profile.folderhint') }}</p>
                <button class="btn btn-success mt-2" data-e2e="welcome-save" :disabled="!welcomeName.trim()" @click="saveWelcome">{{ $t('profile.continue') }}</button>
            </div>
        </div>

        <!-- Content -->
        <div v-else class="flex-grow-1 p-4 overflow-auto" style="background-color: #f5f5f5;">
            <!-- courses: recurring lessons with fixed PIN, template and time -->
            <h3 class="mb-3">{{ $t('course.mycourses') }}</h3>
            <div class="d-flex flex-wrap gap-3 mb-2" data-e2e="courses">
                <div v-for="c in courses" :key="c.id" class="coursetile border bg-white rounded p-3 d-flex flex-column" :data-e2e="`course-${c.name}`">
                    <div class="d-flex align-items-start">
                        <div class="fs-4 fw-bold text-truncate me-auto" :title="c.name">{{ c.name }}</div>
                        <button class="btn btn-sm btn-link text-secondary p-0 ms-2" :title="$t('course.settings')" :data-e2e="`course-edit-${c.name}`" @click="editCourse(c)">⚙</button>
                    </div>
                    <div class="small text-secondary text-truncate" :title="teacherNames(c)">{{ teacherNames(c) }}</div>
                    <div class="small text-secondary">{{ timeLabel(c.time) }}</div>
                    <div v-if="liveCourse(c)" class="small fw-semibold mt-1" style="color: #198754;" :data-e2e="`course-live-${c.name}`">● {{ $t('course.live') }}</div>
                    <button class="btn btn-sm mt-auto pt-1" :class="liveCourse(c) ? 'btn-outline-success' : 'btn-success'" style="margin-top: 10px !important;"
                            :data-e2e="`course-start-${c.name}`" :disabled="starting" @click="startCourse(c)">
                        {{ liveCourse(c) === 'own' ? $t('startserver.open') : liveCourse(c) ? $t('course.joinlesson') : $t('course.start') }}
                    </button>
                </div>
                <button class="coursetile border rounded bg-transparent text-secondary d-flex flex-column align-items-center justify-content-center"
                        style="border-style: dashed !important;" data-e2e="course-new" @click="editCourse(null)">
                    <span class="fs-2">+</span>{{ $t('course.new') }}
                </button>
            </div>

            <!-- single lesson: one-off, no course -->
            <div class="mt-5 p-3 border rounded" style="max-width: 640px; background: #fffbea;">
                <h5 class="mb-1">{{ $t('course.single') }}</h5>
                <p class="text-secondary small mb-2">{{ $t('course.singlehint') }}</p>
                <div class="input-group" style="max-width: 480px;">
                    <input v-model="servername" id="servername" data-e2e="session-name" class="form-control" maxlength="40"
                           :placeholder="$t('startserver.nameplaceholder')" @keyup.enter="startSession">
                    <button id="examstart" data-e2e="session-start" class="btn btn-warning" :disabled="!validName || starting" @click="startSession">
                        {{ $t('course.singlestart') }}
                    </button>
                </div>
                <div v-if="servername && !validName" class="text-danger small mt-1">{{ $t('startserver.invalidname') }}</div>
            </div>

            <div v-if="runningSessions.length" class="mt-5">
                <h5>{{ $t('startserver.runningsessions') }}</h5>
                <div class="d-flex flex-wrap gap-2">
                    <div v-for="name in runningSessions" :key="name" class="border bg-white rounded p-3" style="width: 240px;">
                        <strong>{{ name }}</strong>
                        <button class="btn btn-sm btn-info w-100 mt-2" @click="openDashboard(name)">{{ $t('startserver.open') }}</button>
                    </div>
                </div>
            </div>

            <!-- team teaching: join another teacher's session -->
            <div class="mt-5" style="max-width: 640px;">
                <h5>{{ $t('coteacher.join') }}</h5>
                <p class="text-secondary small">{{ $t('coteacher.joinhint') }}</p>
                <div class="d-flex flex-wrap gap-2 mb-2">
                    <div v-for="s in [...lanSessions, ...manualSessions].filter((x) => !isOwnCourse(x))" :key="s.id + s.address" class="border bg-white rounded p-2" style="width: 240px;">
                        <strong>{{ s.servername }}</strong> <span class="text-secondary small">{{ s.address }}</span>
                        <button class="btn btn-sm btn-outline-primary w-100 mt-1" :data-e2e="`cojoin-${s.servername}`" @click="coJoin(s.address, s.servername)">{{ $t('coteacher.join') }}</button>
                    </div>
                </div>
                <div class="input-group input-group-sm" style="max-width: 420px;">
                    <span class="input-group-text">{{ $t('coteacher.address') }}</span>
                    <input v-model.trim="coAddress" class="form-control" data-e2e="cojoin-address" placeholder="10.0.0.5" @keyup.enter="searchManual">
                    <button class="btn btn-outline-secondary" data-e2e="cojoin-search" @click="searchManual">{{ $t('coteacher.search') }}</button>
                </div>
            </div>
        </div>
    </div>
    <CourseSettings v-if="courseDialog" :course="courseDialog.course" :templates="templates" :default-folder="profile?.folder || ''"
                    :own-name="profile?.name || ''" @close="courseClosed" />
</div>
</template>

<style scoped>
.coursetile { width: 230px; min-height: 150px; }
</style>

<script>
import FolderField from '../components/FolderField.vue'
import CourseSettings from '../components/CourseSettings.vue'

const NAME_PATTERN = /^[a-z0-9äöüß][a-z0-9äöüß _.-]{0,39}$/

export default {
    components: { FolderField, CourseSettings },
    data() {
        return {
            profile: null,
            courses: [],
            templates: [],
            courseDialog: null,
            welcomeName: '',
            welcomeFolder: '',
            config: window.config || {},
            servername: '',
            starting: false,
            hostip: null,
            runningSessions: [],
            runningCourseIds: [],
            lanSessions: [],
            manualSessions: [],
            coAddress: '',
            pollTimer: null,
            interfaceDialogOpen: false,
        }
    },
    computed: {
        inactiveLocale() { return this.$i18n.locale === 'de' ? 'en' : 'de' },
        validName() { return NAME_PATTERN.test(this.servername.trim().toLowerCase()) },
    },
    async mounted() {
        await this.refresh()
        this.pollTimer = setInterval(() => this.refresh(), 4000)
    },
    beforeUnmount() {
        clearInterval(this.pollTimer)
    },
    methods: {
        async saveWelcome() {
            if (!this.welcomeName.trim()) return
            const r = await window.ipcRenderer.invoke('profile-set', { name: this.welcomeName, folder: this.welcomeFolder })
            if (r.status === 'success') this.profile = r.profile
        },
        teacherNames(c) {
            return (c.teachers || []).map((t) => t.name).join(', ')
        },
        timeLabel(time) {
            if (time?.mode === 'clock') return `${time.start} – ${time.end}`
            const m = time?.minutes || 50
            return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}` : `${m} min`
        },
        isOwnCourse(beacon) {
            return !!beacon.courseId && this.courses.some((c) => c.id === beacon.courseId)
        },
        /** 'own' = lesson runs on this app, 'lan' = another teacher of the course runs it, null = not live */
        liveCourse(c) {
            if (this.runningCourseIds.includes(c.id)) return 'own'
            return [...this.lanSessions, ...this.manualSessions].some((s) => s.courseId === c.id) ? 'lan' : null
        },
        async editCourse(course) {
            this.templates = (await window.ipcRenderer.invoke('applock-overview')).templates
            this.courseDialog = { course: course ? JSON.parse(JSON.stringify(course)) : null }
        },
        async courseClosed() {
            this.courseDialog = null
            this.courses = await window.ipcRenderer.invoke('course-list')
        },
        async startCourse(c) {
            if (this.starting) return
            this.starting = true
            try {
                // lessons found via "IP der anderen Lehrer-App" (networks without multicast) are tried as well
                const extra = this.manualSessions.filter((s) => s.courseId === c.id).map((s) => ({ address: s.address, servername: s.servername, epoch: s.epoch }))
                const r = await window.ipcRenderer.invoke('course-start', { id: c.id, extra: JSON.parse(JSON.stringify(extra)) })
                if (r.status === 'started') this.openDashboard(r.servername)
                else if (r.status === 'joined') this.$router.push({ name: 'dashboard', params: { servername: r.servername }, query: { remote: '1' } })
                else this.$swal.fire({ title: this.$t('general.error'), text: r.message || this.$t('course.errors.START_FAILED'), icon: 'error' })
            } finally {
                this.starting = false
            }
        },
        async refresh() {
            if (!this.profile?.name) this.profile = await window.ipcRenderer.invoke('profile-get')
            this.courses = await window.ipcRenderer.invoke('course-list')
            this.runningCourseIds = await window.ipcRenderer.invoke('runningCourseIds')
            this.hostip = await window.ipcRenderer.invoke('checkhostip')
            const cfg = await window.ipcRenderer.invoke('getconfigasync')
            this.config = cfg
            if (this.hostip?.availableInterfaces?.length > 1 && !this.hostip.preferredInterface) this.selectPreferredInterface()
            this.runningSessions = await window.ipcRenderer.invoke('runningSessions')
            this.lanSessions = (await window.ipcRenderer.invoke('lanSessions')).map((s) => ({ ...s, address: s.serverip }))
        },
        async startSession() {
            if (!this.validName || this.starting) return
            this.starting = true
            try {
                const result = await window.ipcRenderer.invoke('startExamServer', { servername: this.servername })
                if (result.status === 'success') this.openDashboard(result.servername)
                else this.$swal.fire({ title: this.$t('general.error'), text: result.message, icon: 'error' })
            } finally {
                this.starting = false
            }
        },
        openDashboard(servername) {
            this.$router.push({ name: 'dashboard', params: { servername } })
        },
        async selectPreferredInterface() {
            if (this.interfaceDialogOpen || !this.hostip?.availableInterfaces?.length) return
            this.interfaceDialogOpen = true
            const result = await this.$swal.fire({
                title: this.$t('startserver.selectinterface'),
                text: this.$t('startserver.selectinterfaceinfo'),
                input: 'select',
                inputOptions: Object.fromEntries(this.hostip.availableInterfaces.map((i) => [i.name, `${i.name}: ${i.address}`])),
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
            })
            if (result.isConfirmed) {
                await window.ipcRenderer.invoke('setPreferredInterface', result.value)
                this.hostip = await window.ipcRenderer.invoke('checkhostip')
            }
            this.interfaceDialogOpen = false
        },
        async searchManual() {
            if (!this.coAddress) return
            const r = await window.ipcRenderer.invoke('cojoin-list', this.coAddress)
            if (r.status === 'success') this.manualSessions = r.serverlist.map((s) => ({ id: s.id, servername: s.servername, address: s.address, courseId: s.courseId, epoch: s.epoch }))
            else this.$swal.fire({ title: this.$t('general.error'), text: r.message, icon: 'error' })
        },
        /** Ask to join as teacher (own name from the profile), then wait for the other teacher's approval. */
        async coJoin(address, servername) {
            const name = this.profile?.name
            if (!name) return this.$swal.fire({ title: this.$t('general.error'), text: this.$t('coteacher.noname'), icon: 'error' })
            const form = await this.$swal.fire({
                title: this.$t('coteacher.join'),
                html: `<div class="small text-secondary mb-1">${this.$t('profile.name')}: <b>${name.replace(/[<>&"]/g, '')}</b></div>`
                    + `<input id="co-code" class="swal2-input" data-e2e="cojoin-code" inputmode="numeric" maxlength="6" placeholder="${this.$t('coteacher.code')}">`,
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
                preConfirm: () => ({ code: document.getElementById('co-code').value.trim() }),
            })
            if (!form.isConfirmed) return
            const { code } = form.value
            const req = await window.ipcRenderer.invoke('cojoin-request', { address, servername, code, name })
            if (req.status !== 'pending') {
                const text = req.code && this.$te(`coteacher.errors.${req.code}`) ? this.$t(`coteacher.errors.${req.code}`) : req.message
                this.$swal.fire({ title: this.$t('general.error'), text, icon: 'error' })
                return
            }
            let cancelled = false
            this.$swal.fire({ title: this.$t('coteacher.waiting'), text: this.$t('coteacher.waitingtext'), showConfirmButton: false, showCancelButton: true, cancelButtonText: this.$t('general.cancel'), allowOutsideClick: false })
                .then((r) => { if (r.isDismissed) cancelled = true })
            for (let i = 0; i < 90 && !cancelled; i++) {   // up to 3 minutes
                await new Promise((r) => setTimeout(r, 2000))
                const st = await window.ipcRenderer.invoke('cojoin-status', { address, servername, requestId: req.requestId, name })
                if (st.status === 'approved') {
                    this.$swal.close()
                    this.$router.push({ name: 'dashboard', params: { servername }, query: { remote: '1' } })
                    return
                }
                if (st.status === 'denied' || st.status === 'error') {
                    this.$swal.fire({ title: this.$t('coteacher.join'), text: this.$t('coteacher.denied'), icon: 'error' })
                    return
                }
            }
        },
        toggleLocale() {
            this.$i18n.locale = this.inactiveLocale
        },
        showCopyleft() {
            this.$swal.fire({
                title: "<span style='font-size:0.8em'>Next-Class</span>",
                icon: 'info',
                html: `
                <span style="font-size:0.9em">Unterrichtswerkzeug – keine Prüfungsumgebung</span> <br><br>
                <span style="font-size:0.8em"><b>Fork von <a href="https://next-exam.at" target="_blank">Next-Exam</a></b></span> <br>
                <span style="font-size:0.8em">Next-Exam &copy; Thomas Michael Weissel und Mitwirkende</span> <br>
                <span style="font-size:0.8em">Anpassungen für Next-Class: Andreas Auer</span> <br><br>
                <span style="font-size:0.8em">Lizenz: GNU GPL v3 · <a href="https://github.com/Andreas-Auer/next-class" target="_blank">Quellcode</a></span> <br>
                <span style="font-size:0.75em; opacity:0.7">Next-Class ist kein offizielles Produkt des BMB und wird nicht vom Next-Exam-Team betreut.</span> <br><br>
                <span style="font-size:0.8em">Version: ${this.config.version} ${this.config.info}</span> <br>
                <span style="font-size:0.8em">Build: ${this.config.buildDate}</span>
                `,
            })
        },
    },
}
</script>
