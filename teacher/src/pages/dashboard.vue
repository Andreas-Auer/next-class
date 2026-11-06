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
        <button class="btn btn-outline-light btn-sm me-2" data-e2e="events-open" @click="openEvents">
            {{ $t('events.title') }} <span v-if="events.length" class="badge bg-secondary ms-1">{{ events.length }}</span>
        </button>
        <span v-if="remote && !hostReachable" class="badge bg-danger me-2">{{ $t('coteacher.hostunreachable') }}</span>
        <button v-if="remote" class="btn btn-outline-danger btn-sm me-3" data-e2e="coteacher-leave" @click="leaveAsCoTeacher">{{ $t('coteacher.leave') }}</button>
        <button v-else class="btn btn-danger btn-sm me-3" data-e2e="session-end" @click="endSession">
            <img src="/src/assets/img/svg/stock_exit.svg" class="white me-1" width="16" height="16"> {{ $t('dashboard.end') }}
        </button>
        <span style="font-size: 23px;" data-e2e="role">{{ remote ? $t('coteacher.title') : $t('general.teacher') }}</span>
    </div>

    <div class="d-flex flex-grow-1" style="min-height: 0;">
        <!-- Sidebar: join data + session controls -->
        <div class="p-3 text-white bg-dark h-100 d-flex flex-column overflow-auto" style="width: 260px; min-width: 260px;">
            <div class="infobox mb-2">
                <div class="small text-secondary">{{ $t('dashboard.session') }}</div>
                <div class="fs-5 text-truncate" :title="servername">{{ servername }}</div>
            </div>
            <div class="infobox mb-2">
                <div class="small text-secondary">{{ $t('dashboard.pin') }}</div>
                <div class="fs-3 fw-bold" data-e2e="session-pin">{{ pin }}</div>
            </div>
            <div class="infobox mb-2">
                <div class="small text-secondary">{{ $t('dashboard.serverip') }}</div>
                <div class="fs-6">{{ serverip }}</div>
            </div>
            <div class="infobox mb-3" data-e2e="teachers">
                <div class="small text-secondary">{{ $t('coteacher.teachers') }}</div>
                <div v-for="tch in teachers" :key="tch.name + (tch.ip || '')" class="small" :class="{ 'text-secondary': !tch.online }" :data-e2e="`teacher-${tch.name}`">
                    {{ tch.name }}<span v-if="!tch.online"> ({{ $t('dashboard.offline') }})</span>
                </div>
                <div v-if="!remote && teacherCode" class="small mt-1">
                    {{ $t('coteacher.code') }}: <strong data-e2e="teacher-code">{{ teacherCode }}</strong>
                </div>
            </div>

            <button class="btn mb-2 text-start" :class="screenslocked ? 'btn-warning' : 'btn-outline-light'"
                    data-e2e="lock-screens" @click="toggleScreenlock">
                <img src="/src/assets/img/svg/shield-lock.svg" class="white me-2" width="18" height="18">
                {{ screenslocked ? $t('dashboard.unlockscreens') : $t('dashboard.lockscreens') }}
            </button>

            <label class="small text-secondary mt-2 mb-1" for="liveview">{{ $t('dashboard.liveview') }}</label>
            <select id="liveview" class="form-select form-select-sm" v-model.number="screenshotinterval" @change="saveScreenshotInterval">
                <option :value="2">{{ $t('dashboard.every', { s: 2 }) }}</option>
                <option :value="4">{{ $t('dashboard.every', { s: 4 }) }}</option>
                <option :value="8">{{ $t('dashboard.every', { s: 8 }) }}</option>
                <option :value="15">{{ $t('dashboard.every', { s: 15 }) }}</option>
                <option :value="0">{{ $t('dashboard.liveviewoff') }}</option>
            </select>

            <label class="small text-secondary mt-3 mb-1" for="idlethreshold">{{ $t('dashboard.idle') }}</label>
            <select id="idlethreshold" class="form-select form-select-sm" v-model.number="idlethreshold" data-e2e="idle-threshold" @change="saveIdleThreshold">
                <option :value="60">{{ $t('dashboard.afterminutes', { m: 1 }) }}</option>
                <option :value="120">{{ $t('dashboard.afterminutes', { m: 2 }) }}</option>
                <option :value="180">{{ $t('dashboard.afterminutes', { m: 3 }) }}</option>
                <option :value="300">{{ $t('dashboard.afterminutes', { m: 5 }) }}</option>
                <option :value="0">{{ $t('dashboard.liveviewoff') }}</option>
            </select>
            <div class="form-check form-switch mt-2 small">
                <input id="sortidle" type="checkbox" class="form-check-input" v-model="sortByIdle">
                <label for="sortidle" class="form-check-label">{{ $t('dashboard.sortidle') }}</label>
            </div>

            <!-- end time for new locks (internet + programs) -->
            <label class="small text-secondary mt-3 mb-1">{{ $t('netlock.endlabel') }}</label>
            <select class="form-select form-select-sm mb-1" v-model="netEndMode" data-e2e="netlock-end">
                <option value="50">{{ $t('netlock.plusminutes', { m: 50 }) }}</option>
                <option value="100">{{ $t('netlock.plusminutes', { m: 100 }) }}</option>
                <option value="time">{{ $t('netlock.attime') }}</option>
            </select>
            <input v-if="netEndMode === 'time'" type="time" class="form-control form-control-sm mb-1" v-model="netEndTime" data-e2e="netlock-time">

            <!-- internet lock -->
            <div class="lockbox mt-2 p-2" :class="{ active: netlock.active }">
                <div class="small fw-bold mb-1">{{ $t('netlock.title') }}</div>
                <button class="btn btn-sm w-100" :class="netlock.active ? 'btn-warning' : 'btn-outline-warning'" data-e2e="netlock-toggle" @click="toggleNetLock">
                    {{ netlock.active ? $t('netlock.lift') : $t('netlock.activate') }}
                </button>
                <div v-if="netlock.active" class="small mt-1 text-warning" data-e2e="netlock-until">{{ $t('netlock.until', { time: formatTime(netlock.until) }) }}</div>
                <details class="small mt-2">
                    <summary>{{ $t('netlock.exceptions', { n: netExceptionList.length }) }}</summary>
                    <textarea class="form-control form-control-sm mt-1" rows="3" v-model="netExceptionsText" data-e2e="netlock-exceptions"
                              :placeholder="$t('netlock.exceptionsplaceholder')" @change="saveNetExceptions"></textarea>
                    <div class="text-secondary mt-1">{{ $t('netlock.exceptionshint') }}</div>
                    <div v-if="invalidExceptions.length" class="text-danger mt-1">{{ $t('netlock.exceptionsinvalid', { list: invalidExceptions.join(', ') }) }}</div>
                </details>
            </div>

            <!-- program lock -->
            <div class="lockbox mt-3 p-2" :class="{ active: applock.active }">
                <div class="small fw-bold mb-1">{{ $t('applock.title') }}</div>
                <select class="form-select form-select-sm mb-1" v-model="selectedTemplateId" data-e2e="applock-template" @change="applyTemplate">
                    <option value="">{{ $t('applock.notemplate') }}</option>
                    <option v-for="tpl in applockData.templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option>
                </select>
                <button class="btn btn-sm btn-outline-light w-100 mb-1 text-start" data-e2e="applock-pick" @click="pickerOpen = true">
                    {{ $t('applock.allowedcount', { n: allowedIds.length }) }} …
                </button>
                <select class="form-select form-select-sm mb-2" v-model="applockMode" data-e2e="applock-mode" @change="applock.active && sendAppLock(true)">
                    <option value="kill">{{ $t('applock.modekill') }}</option>
                    <option value="report">{{ $t('applock.modereport') }}</option>
                </select>
                <button class="btn btn-sm w-100" :class="applock.active ? 'btn-warning' : 'btn-outline-warning'" data-e2e="applock-toggle" @click="toggleAppLock">
                    {{ applock.active ? $t('applock.lift') : $t('applock.activate') }}
                </button>
                <div v-if="applock.active" class="small mt-1 text-warning" data-e2e="applock-until">{{ $t('netlock.until', { time: formatTime(applock.until) }) }}</div>
            </div>

            <div class="mt-auto small text-secondary">
                {{ $t('dashboard.counts', { online: onlineCount, total: students.length }) }}
            </div>
        </div>

        <!-- Student grid -->
        <div id="studentslist" class="flex-grow-1 p-3 overflow-auto" style="background-color: #f5f5f5;">
            <div v-if="students.length === 0" class="text-secondary p-4">
                <h5>{{ $t('dashboard.nostudents') }}</h5>
                <p>{{ $t('dashboard.nostudentshint', { pin }) }}</p>
            </div>
            <div class="d-flex flex-wrap gap-3">
                <div v-for="student in sortedStudents" :key="student.clientname" class="studentwidget card shadow-sm"
                     :class="{ offline: !student.online, idle: idleSeconds(student) !== null }" :data-e2e="`student-${student.clientname}`">
                    <div class="thumb" @click="showLarge(student)">
                        <img v-if="student.imageurl && student.online" :src="student.imageurl" class="w-100 h-100" style="object-fit: contain;">
                        <div v-else class="w-100 h-100 d-flex align-items-center justify-content-center text-secondary small">
                            {{ student.online ? $t('dashboard.noimage') : $t('dashboard.offline') }}
                        </div>
                    </div>
                    <div class="card-body p-2">
                        <div class="d-flex align-items-center">
                            <strong class="text-truncate me-auto" :title="`${student.clientname} (${student.hostname})`">{{ student.clientname }}</strong>
                            <button class="btn btn-sm btn-link p-0 ms-2" :title="$t('applock.runningapps')" data-e2e="running-apps" @click="runningAppsOf = student.clientname">☰</button>
                            <button class="btn btn-sm btn-link text-danger p-0 ms-2" :title="$t('dashboard.kick')" @click="kick(student)">✕</button>
                        </div>
                        <div class="d-flex flex-wrap gap-1 mt-1">
                            <span v-if="student.online" class="badge bg-success" data-e2e="badge-online">{{ $t('dashboard.online') }}</span>
                            <span v-else-if="student.quitAt" class="badge bg-danger" data-e2e="badge-quit">{{ $t('events.quitat', { time: formatTime(student.quitAt) }) }}</span>
                            <span v-else-if="student.leftAt" class="badge bg-danger" data-e2e="badge-left">{{ $t('events.leftat', { time: formatTime(student.leftAt) }) }}</span>
                            <span v-else class="badge bg-secondary" data-e2e="badge-offline">{{ $t('dashboard.disconnectedsince', { time: formatTime(student.lastSeen) }) }}</span>
                            <span v-if="idleSeconds(student) !== null" class="badge idlebadge" data-e2e="badge-idle"
                                  :title="$t('dashboard.idlehint')">⏸ {{ formatDuration(idleSeconds(student)) }}</span>
                            <span v-if="student.online && student.screenlock" class="badge bg-warning text-dark" data-e2e="badge-locked">{{ $t('dashboard.locked') }}</span>
                            <span v-if="student.netlock?.state === 'active'" class="badge bg-dark" data-e2e="badge-netlock">{{ $t('netlock.badgeactive') }}</span>
                            <span v-if="netlock.active && ['notinstalled', 'unreachable', 'error'].includes(student.netlock?.state)" class="badge bg-danger"
                                  data-e2e="badge-netlock-problem" :title="student.netlock?.error || ''">{{ $t(`netlock.problem.${student.netlock.state}`) }}</span>
                            <span v-if="student.online && recentTamper(student)" class="badge bg-danger text-wrap text-start" data-e2e="badge-tamper"
                                  :title="$t('netlock.tamperhint')">⚠ {{ $t(`netlock.event.${recentTamper(student).detail || 'rules-missing'}`) }}</span>
                            <span v-if="student.online && student.applock?.state === 'grace'" class="badge bg-warning text-dark" data-e2e="badge-applock-grace">
                                {{ $t('applock.badgegrace', { s: student.applock.graceRemaining }) }}</span>
                            <span v-if="student.online && student.applock?.state === 'active'" class="badge bg-dark" data-e2e="badge-applock">{{ $t('applock.badgeactive') }}</span>
                            <span v-if="student.online && recentViolation(student)" class="badge bg-danger text-wrap text-start" data-e2e="badge-violation"
                                  :title="violationTooltip(student)">⚠ {{ recentViolation(student).name }} · {{ $t(`applock.action.${recentViolation(student).action}`) }}</span>
                            <span v-if="student.multiMonitor" class="badge bg-info text-dark">{{ $t('dashboard.multimonitor') }}</span>
                            <span v-if="student.online && (student.screenCaptureFailed || student.screenPermission === 'denied' || student.screenPermission === 'not-determined')"
                                  class="badge bg-danger" data-e2e="badge-nopermission" :title="$t('dashboard.nopermissionhint')">{{ $t('dashboard.nopermission') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- event log (memory only) -->
    <div v-if="eventsOpen" class="nc-overlay" @click.self="eventsOpen = false">
        <div class="card shadow" style="width: min(720px, 92vw); max-height: 80vh;" data-e2e="events-dialog">
            <div class="card-header d-flex"><strong class="me-auto">{{ $t('events.title') }}</strong>
                <button class="btn-close" @click="eventsOpen = false"></button></div>
            <div class="card-body overflow-auto small">
                <p class="text-secondary">{{ $t('events.hint') }}</p>
                <div v-if="!events.length" class="text-secondary">{{ $t('events.none') }}</div>
                <div v-for="(e, i) in events" :key="i" class="d-flex border-bottom py-1" :class="{ 'text-danger': importantEvent(e) }" :data-e2e="`event-${e.kind}`">
                    <span class="me-3 text-secondary" style="width: 44px;">{{ formatTime(e.at) }}</span>
                    <strong class="me-3" style="width: 140px;">{{ e.clientname }}</strong>
                    <span>{{ $t(`events.kind.${e.kind}`) }}<span v-if="eventDetail(e)"> – {{ eventDetail(e) }}</span></span>
                </div>
            </div>
        </div>
    </div>

    <AppPicker v-if="pickerOpen" :catalog="applockData.catalog" :custom-entries="applockData.customEntries" :allowed-ids="allowedIds"
               @close="pickerOpen = false" @apply="applyPicked" @save-template="saveTemplate" @delete-custom="deleteCustom" />

    <!-- running programs of one student (take over into the allowlist) -->
    <div v-if="runningStudent" class="nc-overlay" @click.self="runningAppsOf = null">
        <div class="card shadow" style="width: min(640px, 92vw); max-height: 80vh;" data-e2e="running-apps-dialog">
            <div class="card-header d-flex"><strong class="me-auto">{{ $t('applock.runningof', { name: runningStudent.clientname }) }}</strong>
                <button class="btn-close" @click="runningAppsOf = null"></button></div>
            <div class="card-body overflow-auto">
                <p class="small text-secondary">{{ $t('applock.runninghint') }}</p>
                <div v-if="!runningStudent.applock?.runningApps?.length" class="text-secondary">{{ $t('applock.norunning') }}</div>
                <div v-for="app in runningStudent.applock?.runningApps || []" :key="app.bundleId || app.exe || app.name" class="d-flex align-items-center border-bottom py-1">
                    <span class="me-auto">{{ app.appName || app.title || app.name }} <span class="text-secondary small">{{ app.bundleId || app.exe || app.name }}</span></span>
                    <button class="btn btn-sm btn-outline-primary" :data-e2e="`allow-${app.name}`" @click="allowRunning(app, runningStudent.platform)">{{ $t('applock.allow') }}</button>
                </div>
                <div v-if="runningStudent.applock?.violations?.length" class="mt-3">
                    <div class="fw-bold small">{{ $t('applock.violations') }}</div>
                    <div v-for="v in runningStudent.applock.violations" :key="v.at + v.name" class="small">{{ formatTime(v.at) }} · {{ v.name }} · {{ $t(`applock.action.${v.action}`) }}</div>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<script>
import AppPicker from '../components/AppPicker.vue'
const POLL_MS = 2000
const VIOLATION_SHOW_MS = 5 * 60 * 1000   // a violation badge stays visible for 5 minutes

export default {
    components: { AppPicker },
    data() {
        return {
            servername: this.$route.params.servername,
            pin: '',
            serverip: '',
            screenslocked: false,
            screenshotinterval: 4,
            idlethreshold: 120,
            sortByIdle: false,
            now: Date.now(),
            students: [],
            applock: { active: false },
            netlock: { active: false },
            netEndMode: '50',
            netEndTime: '',
            netExceptionsText: '',
            applockData: { catalog: [], customEntries: [], templates: [] },
            selectedTemplateId: '',
            allowedIds: [],
            applockMode: 'kill',
            pickerOpen: false,
            runningAppsOf: null,
            events: [],
            eventsOpen: false,
            remote: this.$route.query.remote === '1',
            hostReachable: true,
            leaving: false,
            teacherCode: '',
            teachers: [],
            joinDialogOpen: false,
            lastPolicyId: null,
            pollTimer: null,
            clockTimer: null,
        }
    },
    computed: {
        onlineCount() { return this.students.filter((s) => s.online).length },
        netExceptionList() {
            return this.netExceptionsText.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean)
        },
        invalidExceptions() {
            const ip = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
            return this.netExceptionList.filter((e) => {
                const [addr, bits] = e.split('/')
                if (ip.test(addr)) return bits !== undefined && !(Number(bits) >= 8 && Number(bits) <= 32 && /^\d+$/.test(bits))
                return !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(e) && e !== 'localhost'
            })
        },
        runningStudent() { return this.students.find((s) => s.clientname === this.runningAppsOf) || null },
        sortedStudents() {
            if (!this.sortByIdle) return this.students
            return [...this.students].sort((a, b) => (this.idleSeconds(b) ?? -1) - (this.idleSeconds(a) ?? -1))
        },
    },
    async mounted() {
        const info = await this.api('getSessionInfo', this.servername)
        if (info?.status !== 'success') { this.$router.push('/'); return }
        this.applySessionInfo(info, true)
        // failover: this co-teacher app now leads the session / the host moved / we were replaced as host
        window.ipcRenderer.on('coteacher-became-host', () => {
            this.remote = false
            this.hostReachable = true
            this.$swal.fire({ title: this.$t('coteacher.tookover'), text: this.$t('coteacher.tookovertext'), icon: 'info' })
        })
        window.ipcRenderer.on('coteacher-newhost', (_e, d) => {
            this.hostReachable = true
            this.$swal.fire({ title: this.$t('coteacher.newhost'), text: `${d?.name || ''} (${d?.host || ''})`, icon: 'info', timer: 6000 })
        })
        window.ipcRenderer.on('session-taken-over', async (_e, d) => {
            if (d?.servername !== this.servername) return
            clearInterval(this.pollTimer)
            await this.$swal.fire({ title: this.$t('coteacher.takenover'), text: this.$t('coteacher.takenovertext', { by: d.by }), icon: 'info' })
            this.$router.push('/')
        })
        await this.loadAppLockData()
        this.clockTimer = setInterval(() => { this.now = Date.now() }, 1000)   // the idle counter ticks every second
        await this.fetchStudents()
        this.pollTimer = setInterval(() => this.fetchStudents(), POLL_MS)
    },
    beforeUnmount() {
        clearInterval(this.pollTimer)
        clearInterval(this.clockTimer)
        for (const ch of ['coteacher-became-host', 'coteacher-newhost', 'session-taken-over']) window.ipcRenderer.removeAllListeners(ch)
    },
    methods: {
        /** Seconds the screen has been unchanged, or null when below the threshold / unknown / off. */
        idleSeconds(student) {
            if (!this.idlethreshold || !student.online || !student.unchangedSince) return null
            const seconds = Math.floor((this.now - student.unchangedSince) / 1000)
            return seconds >= this.idlethreshold ? seconds : null
        },
        formatDuration(seconds) {
            const m = Math.floor(seconds / 60)
            const s = String(seconds % 60).padStart(2, '0')
            return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`
        },
        // ---- internet lock ----------------------------------------------------
        netLockUntil() {
            if (this.netEndMode !== 'time') return Date.now() + Number(this.netEndMode) * 60_000
            const [h, m] = String(this.netEndTime || '').split(':').map(Number)
            if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
            const d = new Date()
            d.setHours(h, m, 0, 0)
            return d.getTime()
        },
        async saveNetExceptions() {
            await window.ipcRenderer.invoke('netlock-save-exceptions', [...this.netExceptionList])
            if (this.netlock.active) {   // apply to the running lock right away
                const r = await this.api('setNetLock', { servername: this.servername, active: true, until: this.netlock.until, extraAllow: [...this.netExceptionList] })
                if (r.status === 'success') this.netlock = r.netlock
            }
        },
        async toggleNetLock() {
            if (this.netlock.active) {
                const r = await this.api('setNetLock', { servername: this.servername, active: false })
                if (r.status === 'success') this.netlock = r.netlock
                return
            }
            const capped = this.validatedUntil()
            if (!capped) return
            const until = this.netLockUntil()
            const confirm = await this.$swal.fire({
                title: this.$t('netlock.activate'),
                html: this.$t('netlock.confirm', { time: this.formatTime(capped) }) + (until > capped ? `<br><br>${this.$t('netlock.capped')}` : ''),
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: this.$t('netlock.activate'),
                cancelButtonText: this.$t('general.cancel'),
            })
            if (!confirm.isConfirmed) return
            const r = await this.api('setNetLock', { servername: this.servername, active: true, until: capped, extraAllow: [...this.netExceptionList] })
            if (r.status === 'success') this.netlock = r.netlock
            else this.$swal.fire({ title: this.$t('general.error'), text: r.message, icon: 'error' })
        },
        /** End time from the selector, capped at 4 hours; shows an error and returns 0 when invalid. */
        validatedUntil() {
            const until = this.netLockUntil()
            if (!until || until <= Date.now() + 60_000) {
                this.$swal.fire({ title: this.$t('general.error'), text: this.$t('netlock.endinpast'), icon: 'error' })
                return 0
            }
            return Math.min(until, Date.now() + 4 * 60 * 60_000)
        },
        /** Last "rules restored" event of the helper within the violation window. */
        recentTamper(student) {
            const ev = (student.netlock?.events || []).find((e) => e.kind === 'restored' || e.kind === 'restore-failed')
            return ev && this.now - ev.at < VIOLATION_SHOW_MS ? ev : null
        },

        // ---- program lock -----------------------------------------------------
        async loadAppLockData() {
            this.applockData = await window.ipcRenderer.invoke('applock-overview')
            this.netExceptionsText = (this.applockData.netExceptions || []).join('\n')
        },
        applyTemplate() {
            const tpl = this.applockData.templates.find((t) => t.id === this.selectedTemplateId)
            if (tpl) this.allowedIds = [...tpl.allowed]
            if (this.applock.active) this.sendAppLock(true)
        },
        applyPicked(ids) {
            this.allowedIds = ids
            this.pickerOpen = false
            if (this.applock.active) this.sendAppLock(true)
        },
        async saveTemplate(tpl) {
            const result = await window.ipcRenderer.invoke('applock-save-template', tpl)
            await this.loadAppLockData()
            if (result.status === 'success') this.selectedTemplateId = result.template.id
        },
        async deleteCustom(id) {
            await window.ipcRenderer.invoke('applock-delete-custom', id)
            this.allowedIds = this.allowedIds.filter((a) => a !== id)
            await this.loadAppLockData()
        },
        async allowRunning(app, platform) {
            const result = await window.ipcRenderer.invoke('applock-add-running', { app: JSON.parse(JSON.stringify(app)), platform })
            if (result.status !== 'success') return
            await this.loadAppLockData()
            if (!this.allowedIds.includes(result.entry.id)) this.allowedIds = [...this.allowedIds, result.entry.id]
            if (this.applock.active) this.sendAppLock(true)
        },
        async toggleAppLock() {
            if (this.applock.active) {
                await this.sendAppLock(false)
                return
            }
            const tplName = this.applockData.templates.find((t) => t.id === this.selectedTemplateId)?.name || ''
            const until = this.validatedUntil()
            if (!until) return
            const confirm = await this.$swal.fire({
                title: this.$t('applock.activate'),
                html: this.$t(this.applockMode === 'kill' ? 'applock.confirmkill' : 'applock.confirmreport', { n: this.allowedIds.length })
                    + `<br>${this.$t('netlock.until', { time: this.formatTime(until) })}`
                    + (tplName ? `<br><b>${tplName.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</b>` : ''),
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: this.$t('applock.activate'),
                cancelButtonText: this.$t('general.cancel'),
            })
            if (confirm.isConfirmed) await this.sendAppLock(true, until)
        },
        async sendAppLock(active, until = this.applock.until) {
            const tplName = this.applockData.templates.find((t) => t.id === this.selectedTemplateId)?.name || ''
            const result = await this.api('setAppLock', {
                servername: this.servername, active, mode: this.applockMode, allowedIds: [...this.allowedIds], templateName: tplName, until,
                customEntries: JSON.parse(JSON.stringify(this.applockData.customEntries.filter((e) => this.allowedIds.includes(e.id)))),
            })
            if (result.status !== 'success') this.$swal.fire({ title: this.$t('general.error'), text: result.message, icon: 'error' })
            if (result.status === 'success') this.applock = result.applock
        },
        recentViolation(student) {
            const v = student.applock?.violations?.[0]
            return v && this.now - v.at < VIOLATION_SHOW_MS ? v : null
        },
        violationTooltip(student) {
            return (student.applock?.violations || []).slice(0, 8)
                .map((v) => `${this.formatTime(v.at)} ${v.name} (${this.$t(`applock.action.${v.action}`)})`).join('\n')
        },
        saveIdleThreshold() {
            this.setStatus({ idlethreshold: this.idlethreshold })
        },
        formatTime(ts) {
            return new Date(ts).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
        },
        async openEvents() {
            this.events = await this.api('sessionEvents', this.servername)
            this.eventsOpen = true
        },
        eventDetail(e) {
            if (e.kind === 'program') return `${e.detail} (${this.$t(`applock.action.${e.code}`)})`
            if (e.kind === 'firewall') return this.$t(`netlock.event.${e.code}`)
            if (e.kind === 'netlock-problem') return this.$t(`netlock.problem.${e.code}`)
            return e.detail
        },
        importantEvent(e) {
            return ['app-quit', 'program', 'firewall', 'netlock-problem', 'offline'].includes(e.kind)
        },
        /**
         * Local dashboard: IPC to this app. Co-teacher: forwarded to the host teacher app.
         * Returns the operation's result; a co-teacher whose session ended is sent back to the start page.
         */
        async api(method, payload) {
            if (!this.remote) return window.ipcRenderer.invoke(method, payload)
            const r = await window.ipcRenderer.invoke('remote-rpc', { method, args: payload })
            if (r?.status === 'success') { this.hostReachable = true; return r.result }
            if (r?.code === 'UNREACHABLE') { this.hostReachable = false; return null }
            if (['SESSION_ENDED', 'NOT_AUTHORIZED'].includes(r?.code) && !this.leaving) {
                this.leaving = true
                clearInterval(this.pollTimer)
                await this.$swal.fire({ title: this.$t('coteacher.ended'), text: this.$t('coteacher.endedtext'), icon: 'info' })
                await window.ipcRenderer.invoke('remote-leave')
                this.$router.push('/')
            }
            return null
        },
        /** Session state from the host (also changes made by another teacher). */
        applySessionInfo(info, initial = false) {
            this.pin = info.pin
            this.teacherCode = info.teacherCode
            this.serverip = info.serverip
            this.screenslocked = !!info.serverstatus?.screenslocked
            this.screenshotinterval = info.serverstatus?.screenshotinterval ?? 4
            this.idlethreshold = info.serverstatus?.idlethreshold ?? 120
            this.applock = info.serverstatus?.applock || { active: false }
            this.netlock = info.serverstatus?.netlock || { active: false }
            if (this.applock.active && (initial || this.applock.policyId !== this.lastPolicyId)) {
                this.allowedIds = [...(this.applock.allowedIds || [])]
                this.applockMode = this.applock.mode
            }
            this.lastPolicyId = this.applock.policyId
        },
        /** Host only: ask about co-teachers who want to join (one dialog at a time). */
        async checkTeacherJoins() {
            if (this.remote || this.joinDialogOpen) return
            const pending = await window.ipcRenderer.invoke('pendingTeacherJoins', this.servername)
            if (!pending?.length) return
            const req = pending[0]
            this.joinDialogOpen = true
            const r = await this.$swal.fire({
                title: this.$t('coteacher.requesttitle'),
                text: this.$t('coteacher.requesttext', { name: req.name, ip: req.ip }),
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: this.$t('coteacher.approve'),
                cancelButtonText: this.$t('coteacher.deny'),
            })
            await window.ipcRenderer.invoke('decideTeacherJoin', { servername: this.servername, requestId: req.requestId, approve: r.isConfirmed })
            this.joinDialogOpen = false
        },
        async fetchStudents() {
            const info = await this.api('getSessionInfo', this.servername)
            if (info?.status === 'success') this.applySessionInfo(info)
            this.teachers = (await this.api('teacherList', this.servername)) || []
            this.checkTeacherJoins()
            this.events = (await this.api('sessionEvents', this.servername)) || []
            const result = await this.api('studentlist', this.servername)
            if (result?.status !== 'success') return
            this.students = result.studentlist.sort((a, b) => a.clientname.localeCompare(b.clientname))
        },
        async setStatus(patch) {
            const result = await this.api('setServerStatus', { servername: this.servername, ...patch })
            if (result.status === 'success') {
                this.screenslocked = result.serverstatus.screenslocked
                this.screenshotinterval = result.serverstatus.screenshotinterval
                this.idlethreshold = result.serverstatus.idlethreshold
            }
        },
        toggleScreenlock() {
            this.setStatus({ screenslocked: !this.screenslocked })
        },
        saveScreenshotInterval() {
            this.setStatus({ screenshotinterval: this.screenshotinterval })
        },
        async kick(student) {
            const result = await this.$swal.fire({
                title: this.$t('dashboard.kick'),
                text: this.$t('dashboard.kickconfirm', { name: student.clientname }),
                icon: 'question',
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
            })
            if (!result.isConfirmed) return
            await this.api('kickStudent', { servername: this.servername, clientname: student.clientname })
            this.fetchStudents()
        },
        showLarge(student) {
            if (!student.imageurl || !student.online) return
            this.$swal.fire({
                title: student.clientname,
                imageUrl: student.imageurl,
                imageAlt: student.clientname,
                width: '80vw',
                showConfirmButton: false,
                showCloseButton: true,
            })
        },
        async leaveAsCoTeacher() {
            this.leaving = true
            clearInterval(this.pollTimer)
            await window.ipcRenderer.invoke('remote-leave')
            this.$router.push('/')
        },
        async endSession() {
            const result = await this.$swal.fire({
                title: this.$t('dashboard.end'),
                text: this.$t('dashboard.endconfirm'),
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: this.$t('dashboard.end'),
                cancelButtonText: this.$t('general.cancel'),
            })
            if (!result.isConfirmed) return
            // unlock first so students are released with their next heartbeat, then stop the session
            await this.api('setServerStatus', { servername: this.servername, screenslocked: false })
            await window.ipcRenderer.invoke('stopserver', this.servername)
            this.$router.push('/')
        },
    },
}
</script>

<style scoped>
.infobox { background: #2b3035; border-radius: 4px; padding: 8px 10px; }
.studentwidget { width: 260px; }
.studentwidget.offline { opacity: 0.6; }
.studentwidget.idle { outline: 3px solid #fd7e14; }
.lockbox { border: 1px solid #495057; border-radius: 4px; }
.lockbox.active { border-color: #ffc107; }
.nc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
.idlebadge { background-color: #fd7e14; color: #fff; font-variant-numeric: tabular-nums; }
.thumb { height: 150px; background: #e9ecef; cursor: zoom-in; border-top-left-radius: 4px; border-top-right-radius: 4px; overflow: hidden; }
</style>
