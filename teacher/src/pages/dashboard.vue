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
        <button class="btn btn-danger btn-sm me-3" data-e2e="session-end" @click="endSession">
            <img src="/src/assets/img/svg/stock_exit.svg" class="white me-1" width="16" height="16"> {{ $t('dashboard.end') }}
        </button>
        <span style="font-size: 23px;">{{ $t('general.teacher') }}</span>
    </div>

    <div class="d-flex flex-grow-1" style="min-height: 0;">
        <!-- Sidebar: join data + session controls -->
        <div class="p-3 text-white bg-dark h-100 d-flex flex-column" style="width: 260px; min-width: 260px;">
            <div class="infobox mb-2">
                <div class="small text-secondary">{{ $t('dashboard.session') }}</div>
                <div class="fs-5 text-truncate" :title="servername">{{ servername }}</div>
            </div>
            <div class="infobox mb-2">
                <div class="small text-secondary">{{ $t('dashboard.pin') }}</div>
                <div class="fs-3 fw-bold" data-e2e="session-pin">{{ pin }}</div>
            </div>
            <div class="infobox mb-3">
                <div class="small text-secondary">{{ $t('dashboard.serverip') }}</div>
                <div class="fs-6">{{ serverip }}</div>
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
                <div v-for="student in students" :key="student.clientname" class="studentwidget card shadow-sm"
                     :class="{ offline: !student.online }" :data-e2e="`student-${student.clientname}`">
                    <div class="thumb" @click="showLarge(student)">
                        <img v-if="student.imageurl && student.online" :src="student.imageurl" class="w-100 h-100" style="object-fit: contain;">
                        <div v-else class="w-100 h-100 d-flex align-items-center justify-content-center text-secondary small">
                            {{ student.online ? $t('dashboard.noimage') : $t('dashboard.offline') }}
                        </div>
                    </div>
                    <div class="card-body p-2">
                        <div class="d-flex align-items-center">
                            <strong class="text-truncate me-auto" :title="`${student.clientname} (${student.hostname})`">{{ student.clientname }}</strong>
                            <button class="btn btn-sm btn-link text-danger p-0 ms-2" :title="$t('dashboard.kick')" @click="kick(student)">✕</button>
                        </div>
                        <div class="d-flex flex-wrap gap-1 mt-1">
                            <span v-if="student.online" class="badge bg-success" data-e2e="badge-online">{{ $t('dashboard.online') }}</span>
                            <span v-else class="badge bg-secondary" data-e2e="badge-offline">{{ $t('dashboard.disconnectedsince', { time: formatTime(student.lastSeen) }) }}</span>
                            <span v-if="student.online && student.screenlock" class="badge bg-warning text-dark" data-e2e="badge-locked">{{ $t('dashboard.locked') }}</span>
                            <span v-if="student.multiMonitor" class="badge bg-info text-dark">{{ $t('dashboard.multimonitor') }}</span>
                            <span v-if="student.online && (student.screenCaptureFailed || student.screenPermission === 'denied' || student.screenPermission === 'not-determined')"
                                  class="badge bg-danger" data-e2e="badge-nopermission" :title="$t('dashboard.nopermissionhint')">{{ $t('dashboard.nopermission') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<script>
const POLL_MS = 2000

export default {
    data() {
        return {
            servername: this.$route.params.servername,
            pin: '',
            serverip: '',
            screenslocked: false,
            screenshotinterval: 4,
            students: [],
            pollTimer: null,
        }
    },
    computed: {
        onlineCount() { return this.students.filter((s) => s.online).length },
    },
    async mounted() {
        const info = await window.ipcRenderer.invoke('getSessionInfo', this.servername)
        if (info.status !== 'success') { this.$router.push('/'); return }
        this.pin = info.pin
        this.serverip = info.serverip
        this.screenslocked = !!info.serverstatus?.screenslocked
        this.screenshotinterval = info.serverstatus?.screenshotinterval ?? 4
        await this.fetchStudents()
        this.pollTimer = setInterval(() => this.fetchStudents(), POLL_MS)
    },
    beforeUnmount() {
        clearInterval(this.pollTimer)
    },
    methods: {
        formatTime(ts) {
            return new Date(ts).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
        },
        async fetchStudents() {
            const result = await window.ipcRenderer.invoke('studentlist', this.servername)
            if (result.status !== 'success') return
            this.students = result.studentlist.sort((a, b) => a.clientname.localeCompare(b.clientname))
        },
        async setStatus(patch) {
            const result = await window.ipcRenderer.invoke('setServerStatus', { servername: this.servername, ...patch })
            if (result.status === 'success') {
                this.screenslocked = result.serverstatus.screenslocked
                this.screenshotinterval = result.serverstatus.screenshotinterval
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
            await window.ipcRenderer.invoke('kickStudent', { servername: this.servername, clientname: student.clientname })
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
            await window.ipcRenderer.invoke('setServerStatus', { servername: this.servername, screenslocked: false })
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
.thumb { height: 150px; background: #e9ecef; cursor: zoom-in; border-top-left-radius: 4px; border-top-right-radius: 4px; overflow: hidden; }
</style>
