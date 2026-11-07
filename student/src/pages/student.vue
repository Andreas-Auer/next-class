<!--
  @license GPL LICENSE
  Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
  Modifications for Next-Class (c) 2026 Andreas Auer
  This program is free software: you can redistribute it and/or modify it under the terms of the
  GNU General Public License as published by the Free Software Foundation, either version 3 of the
  License, or any later version. See <http://www.gnu.org/licenses/>.
-->
<template>
    <!-- Header -->
    <div class="w-100 p-3 text-white bg-dark d-flex align-items-center" style="height: 66px;">
        <img src="/img/svg/speedometer.svg" class="white me-2" width="32" height="32">
        <span class="fs-4 me-auto">Next-Class</span>

        <div v-if="token" class="btn btn-success btn-sm me-2" style="cursor: unset;" data-e2e="status-connected">{{ $t('student.connected') }}</div>
        <div v-else-if="!hostipText" class="btn btn-danger btn-sm me-2" style="cursor: unset;">{{ $t('student.offline') }}</div>
        <div v-else class="btn btn-sm btn-outline-success me-2" :style="canSelectInterface ? 'cursor: pointer' : 'cursor: unset'"
             @click="canSelectInterface && selectPreferredInterface()">
            {{ hostip?.interface ? `${hostip.interface} : ${hostipText}` : hostipText }}
        </div>
        <span class="fs-4">{{ $t('student.title') }}</span>
    </div>

    <div id="wrapper" class="w-100 h-100 d-flex">
        <!-- Sidebar -->
        <div class="p-3 text-white bg-dark h-100 position-relative" style="width: 220px; min-width: 220px;">
            <div class="btn btn-light text-start w-100 nobutton">
                <img src="/img/svg/server.svg" class="me-2" width="16" height="16"> {{ $t('student.sessions') }}
            </div>

            <div class="form-check form-switch mt-3" :class="token ? 'disabledexam' : ''">
                <input id="manualsearch" type="checkbox" v-model="advanced" class="form-check-input" data-e2e="manual-search">
                <label for="manualsearch" class="form-check-label">{{ $t('student.manualsearch') }}</label>
            </div>

            <div class="position-absolute d-flex gap-2" style="bottom: 34px; left: 16px;">
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="toggleLocale">{{ inactiveLocale }}</button>
                <button type="button" class="btn btn-outline-danger btn-sm" :disabled="!!token" :title="$t('student.quit')" @click="quit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                        <path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
                        <path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
                    </svg>
                </button>
            </div>
            <span class="position-absolute" style="bottom: 4px; left: 8px; font-size: 0.8em; cursor: pointer;" @click="showCopyleft()">
                <span style="display:inline-block; transform: scaleX(-1);">&copy;</span> {{ version }} {{ info }}
            </span>
        </div>

        <!-- Content -->
        <div id="content" class="p-4 flex-grow-1 overflow-auto">

            <!-- connected -->
            <div v-if="token" class="card shadow-sm" style="max-width: 560px;" data-e2e="connected-card">
                <div class="card-body">
                    <h4 class="card-title"><span style="color:#198754;">●</span> {{ clientinfo.courseName || clientinfo.servername }}</h4>
                    <div v-if="!clientinfo.participating" class="alert mt-2" style="background:#d1e7dd; border-color:#198754;" data-e2e="not-participating">
                        <div class="mb-2">{{ $t('student.livehint') }}</div>
                        <button class="btn btn-success btn-lg w-100" data-e2e="participate" @click="participate">{{ $t('student.participate') }}</button>
                    </div>
                    <p class="mb-1">{{ $t('student.connectedto', { name: clientinfo.servername }) }}</p>
                    <p class="mb-1 text-secondary">{{ clientinfo.name }} · {{ clientinfo.serverip }}</p>
                    <p v-if="clientinfo.screenshotinterval > 0" class="mb-1">
                        <img src="/img/svg/eye-fill.svg" width="16" height="16" class="me-1"> {{ $t('student.liveview') }}
                    </p>
                    <p v-else class="mb-1 text-secondary">{{ $t('student.liveviewoff') }}</p>
                    <p v-if="(clientinfo.screenPermission && clientinfo.screenPermission !== 'granted') || clientinfo.screenCaptureError" class="alert alert-warning mt-2 mb-1" data-e2e="screen-permission-hint">
                        {{ $t('student.screenpermission') }}
                    </p>
                    <div v-if="clientinfo.applock?.state === 'grace'" class="alert alert-warning mt-2" data-e2e="applock-grace">
                        <strong>{{ $t('student.applockgrace', { s: graceCountdown }) }}</strong><br>
                        {{ $t('student.applocksave') }}<br>
                        <span class="small">{{ $t('student.applockallowed') }} {{ allowedList }}</span>
                    </div>
                    <div v-else-if="clientinfo.applock?.state === 'active'" class="alert alert-dark mt-2" data-e2e="applock-active">
                        <strong>{{ $t('student.applockactive') }}</strong><br>
                        <span class="small">{{ $t('student.applockallowed') }} {{ allowedList }}</span>
                    </div>
                    <div v-if="clientinfo.netlock?.state === 'active'" class="alert alert-dark mt-2" data-e2e="netlock-active">
                        <strong>{{ $t('student.netlockactive', { time: formatTime(clientinfo.netlock.until) }) }}</strong><br>
                        <span class="small">{{ $t('student.netlockinfo') }}</span>
                    </div>
                    <div v-if="!clientinfo.netlock?.installed" class="alert alert-info mt-2" data-e2e="netlock-setup">
                        {{ $t('student.netlocksetupinfo') }}<br>
                        <button class="btn btn-sm btn-primary mt-2" :disabled="clientinfo.netlock?.state === 'installing'" data-e2e="netlock-install" @click="installHelper">
                            {{ clientinfo.netlock?.state === 'installing' ? $t('student.netlockinstalling') : $t('student.netlocksetup') }}
                        </button>
                    </div>
                    <p v-if="clientinfo.netlock?.state === 'error' && clientinfo.netlock?.error" class="small text-danger">{{ clientinfo.netlock.error }}</p>
                    <p class="text-secondary small mt-3 mb-3">{{ $t('student.hidehint') }}</p>
                    <button class="btn btn-danger btn-sm" data-e2e="leave" @click="leaveSession">{{ $t('student.leave') }}</button>
                </div>
            </div>

            <!-- not connected -->
            <template v-else>
                <div v-if="clientinfo.releasedFrom" class="alert alert-success" style="max-width: 560px;" data-e2e="released">
                    {{ $t('student.released', { course: clientinfo.releasedFrom }) }}
                </div>
                <div v-if="clientinfo.reconnecting" class="alert alert-warning d-flex align-items-center" style="max-width: 560px;" data-e2e="reconnecting">
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    {{ $t('student.reconnecting', { name: clientinfo.reconnecting }) }}
                </div>
                <!-- knocking at a course lesson: the teacher has to let this device in -->
                <div v-if="clientinfo.knock?.state === 'pending'" class="alert d-flex align-items-center" style="max-width: 560px; background:#fff3cd; border-color:#fd7e14;" data-e2e="knock-pending">
                    <span class="spinner-border spinner-border-sm me-2" style="color:#fd7e14;"></span>
                    <span class="me-auto">{{ $t('student.knockpending', { course: clientinfo.knock.course }) }}</span>
                    <button class="btn btn-sm btn-outline-secondary" @click="cancelKnock">{{ $t('general.cancel') }}</button>
                </div>
                <div v-else-if="clientinfo.knock?.state === 'denied'" class="alert alert-danger d-flex align-items-center" style="max-width: 560px;" data-e2e="knock-denied">
                    <span class="me-auto">{{ $t('student.knockdenied', { course: clientinfo.knock.course }) }}</span>
                    <button class="btn btn-sm btn-outline-secondary" @click="cancelKnock">OK</button>
                </div>

                <!-- my courses: joined automatically when a teacher starts the lesson -->
                <template v-if="profile?.courses?.length">
                    <h5>{{ $t('student.mycourses') }}</h5>
                    <div class="d-flex flex-wrap gap-2 mb-4">
                        <div v-for="c in profile.courses" :key="c.id" class="border bg-white rounded p-3" style="width: 220px;" :data-e2e="`mycourse-${c.name}`">
                            <div class="fs-5 fw-bold text-truncate" :title="c.name">{{ c.name }}</div>
                            <div class="small text-secondary text-truncate">{{ courseTeachers(c) }}</div>
                            <div v-if="liveBeacon(c)" class="small fw-semibold mt-1" style="color:#198754;" :data-e2e="`mycourse-live-${c.name}`">● {{ $t('student.live') }}</div>
                            <div v-else class="small mt-1" style="color:#6c757d;">● {{ $t('student.notlive') }}</div>
                        </div>
                    </div>
                </template>

                <div class="mb-3" style="max-width: 420px;">
                    <div class="mb-2 text-secondary" data-e2e="profile-name">{{ $t('student.signedinas') }} <strong class="text-dark">{{ profile?.name }}</strong> <span v-if="profile?.className">({{ profile.className }})</span></div>
                    <div class="input-group mb-1">
                        <span class="input-group-text" style="width: 130px;">{{ $t('student.pin') }}</span>
                        <input v-model="pincode" type="text" inputmode="numeric" maxlength="6" class="form-control" id="pin" data-e2e="pin">
                    </div>
                    <div v-if="advanced" class="input-group mb-1">
                        <span class="input-group-text" style="width: 130px;">{{ $t('student.ip') }}</span>
                        <input v-model.trim="serverip" class="form-control" :class="{ 'is-invalid': !validip }" id="serverip" data-e2e="server-ip">
                    </div>
                    <button class="btn btn-info mt-2 px-4" :disabled="joining || serverlist.length === 0" data-e2e="join" @click="joinByPin">
                        <span v-if="joining" class="spinner-border spinner-border-sm me-1"></span>{{ $t('student.join') }}
                    </button>
                </div>

                <h5 class="mt-4">{{ $t('student.sessions') }}</h5>
                <div class="d-flex flex-wrap gap-2">
                    <div v-for="server in serverlist" :key="server.id || server.servername"
                         class="border bg-light rounded p-3" style="width: 240px;" :data-e2e="`session-${server.servername}`">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong class="text-truncate" :title="server.servername"><span style="color:#198754;">●</span> {{ server.courseName || server.servername }}</strong>
                            <span v-if="server.version !== version" class="badge" :class="versionIncompatible(server.version) ? 'bg-danger' : 'bg-warning'">
                                {{ $t('student.outdated') }}
                            </span>
                            <img v-if="server.reachable === false" src="/img/svg/emblem-warning.svg" width="18" height="18"
                                 :title="server.certChanged ? $t('student.certchanged') : $t('student.unreachable')">
                        </div>
                        <div v-if="server.teachers?.length" class="small text-secondary text-truncate mb-1">{{ server.teachers.join(', ') }}</div>
                        <button class="btn btn-sm btn-outline-secondary w-100" :disabled="joining" :data-e2e="`join-${server.servername}`"
                                @click="registerClient(server.serverip, server.servername, server.apiPort)">
                            {{ $t('student.joinonly') }}
                        </button>
                    </div>
                    <div v-if="serverlist.length === 0" class="text-muted">{{ $t('student.nosessions') }}</div>
                </div>
            </template>
        </div>
    </div>

    <!-- first start: name and class, entered once (afterwards only a teacher can change the name) -->
    <div v-if="profile && !profile.complete" class="nc-overlay" data-e2e="profile-dialog">
        <div class="bg-white rounded shadow p-4" style="width: 420px;">
            <h4 class="mb-1">{{ $t('student.welcome') }}</h4>
            <p class="text-secondary small">{{ $t('student.welcometext') }}</p>
            <label class="form-label mb-1" for="pf-first">{{ $t('student.firstname') }}</label>
            <input id="pf-first" v-model="pf.firstName" class="form-control mb-2" placeholder="Maria" maxlength="30" data-e2e="profile-first">
            <label class="form-label mb-1" for="pf-last">{{ $t('student.lastname') }}</label>
            <input id="pf-last" v-model="pf.lastName" class="form-control mb-2" placeholder="Musterschülerin" maxlength="30" data-e2e="profile-last">
            <label class="form-label mb-1" for="pf-class">{{ $t('student.class') }}</label>
            <input id="pf-class" v-model="pf.className" class="form-control mb-3" placeholder="3aHBT" maxlength="10" data-e2e="profile-class" @keyup.enter="saveProfile">
            <p class="small text-secondary">{{ $t('student.namelocked') }}</p>
            <button class="btn btn-success w-100" :disabled="!pf.firstName.trim() || !pf.lastName.trim() || !pf.className.trim()" data-e2e="profile-save" @click="saveProfile">{{ $t('student.save') }}</button>
        </div>
    </div>
</template>

<script>
import validator from 'validator'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '../stores/configStore.ts'
import { normalizeStudentClientName } from 'next-class-shared/normalizeStudentClientName.js'
import loggingBridge from '../utils/loggingBridge.js'

const FETCH_INTERVAL_MS = 3000

export default {
    setup() {
        const { version, info, buildDate, development } = storeToRefs(useConfigStore())
        return { version, info, buildDate, development }
    },

    data() {
        return {
            username: '',
            profile: null,
            pf: { firstName: '', lastName: '', className: '' },
            pincode: '',
            serverip: '',
            advanced: false,
            validip: true,
            joining: false,
            token: false,
            clientinfo: {},
            hostip: null,
            serverlist: [],
            serverlistManual: [],
            emptyRounds: 0,
            interfaceDialogOpen: false,
            fetchTimer: null,
            fetchedAt: Date.now(),
            nowTick: Date.now(),
            tickTimer: null,
        }
    },

    computed: {
        inactiveLocale() { return this.$i18n.locale === 'de' ? 'en' : 'de' },
        hostipText() { return this.hostip?.hostip || '' },
        canSelectInterface() { return !this.token && this.hostip?.availableInterfaces?.length > 1 },
        allowedList() {
            const labels = this.clientinfo.applock?.allowedLabels || []
            return labels.length ? labels.join(', ') : this.$t('student.applocknone')
        },
        graceCountdown() {
            // graceRemaining comes with each poll (3 s); count down locally in between
            const remaining = (this.clientinfo.applock?.graceRemaining || 0) - Math.floor((this.nowTick - this.fetchedAt) / 1000)
            return Math.max(0, remaining)
        },
    },

    async mounted() {
        this.profile = await window.ipcRenderer.invoke('profile-get')
        this.username = this.profile.name
        await this.fetchInfo()
        this.fetchTimer = setInterval(() => this.fetchInfo(), FETCH_INTERVAL_MS)
        this.tickTimer = setInterval(() => { this.nowTick = Date.now() }, 1000)
        window.ipcRenderer.on('applock-state', () => this.fetchInfo())   // show the warning right away
    },

    beforeUnmount() {
        clearInterval(this.fetchTimer)
        clearInterval(this.tickTimer)
    },

    methods: {
        versionIncompatible(serverVersion) {
            const part = (v, i) => parseInt(String(v || '').split('.')[i], 10) || 0
            if (!serverVersion || !this.version) return false
            return part(serverVersion, 0) !== part(this.version, 0) || part(serverVersion, 1) !== part(this.version, 1)
        },

        // lowercase while typing; :value instead of v-model so the normalized value wins
        onUsernameInput(event) {
            const el = event.target
            const normalized = normalizeStudentClientName(el.value)
            this.username = normalized
            if (el.value !== normalized) el.value = normalized
        },

        async saveProfile() {
            const r = await window.ipcRenderer.invoke('profile-set-name', JSON.parse(JSON.stringify(this.pf)))
            if (r.status === 'success') { this.profile = r.profile; this.username = r.profile.name }
        },
        courseTeachers(c) {
            return (this.liveBeacon(c)?.teachers?.length ? this.liveBeacon(c).teachers : c.teachers || []).join(', ')
        },
        liveBeacon(c) {
            return this.serverlist.find((s) => s.courseId === c.id) || null
        },
        async participate() {
            await window.ipcRenderer.invoke('participate')
            this.fetchInfo()
        },
        async cancelKnock() {
            await window.ipcRenderer.invoke('knock-cancel')
            this.fetchInfo()
        },
        toggleLocale() {
            this.$i18n.locale = this.inactiveLocale
            window.ipcRenderer.send('set-new-locale', this.$i18n.locale)
        },

        /** Poll main process: own state, sessions found via multicast, manual IP sessions, reachability. */
        async fetchInfo() {
            let info
            try {
                info = await window.ipcRenderer.invoke('getinfoasync')
            } catch (e) {
                loggingBridge.error(`student.vue @ fetchInfo: ${e.message}`)
                return
            }
            this.clientinfo = info.clientinfo
            this.fetchedAt = Date.now()
            if (this.profile?.complete) this.profile = await window.ipcRenderer.invoke('profile-get')   // courses change after a join
            this.token = info.clientinfo.token
            if (this.token && info.clientinfo.name) this.username = info.clientinfo.name

            // multicast blocked? after a few empty rounds offer the manual IP field
            if (info.serverlist.length === 0 && this.serverlistManual.length === 0) {
                if (++this.emptyRounds > 3 && !this.advanced && !this.token) this.advanced = true
            } else {
                this.emptyRounds = 0
            }

            if (this.advanced && !this.token && this.serverip) {
                this.validip = validator.isIP(this.serverip) || validator.isFQDN(this.serverip, { require_tld: false })
                if (this.validip) {
                    const data = await window.ipcRenderer.invoke('fetch-exam-server-list', { serverip: this.serverip }).catch(() => null)
                    if (data?.status === 'success') this.serverlistManual = data.serverlist
                }
            } else {
                this.validip = true
            }

            // merge: multicast entries win, manual entries fill the gaps (dedupe by id)
            const merged = new Map()
            for (const s of [...this.serverlistManual, ...info.serverlist]) {
                const key = s.id || s.servername
                const old = this.serverlist.find((o) => (o.id || o.servername) === key)
                merged.set(key, { ...s, reachable: old?.reachable, certChanged: old?.certChanged })
            }
            this.serverlist = [...merged.values()]

            this.hostip = await window.ipcRenderer.invoke('checkhostip')
            if (!this.hostip?.hostip || this.token) return
            if (this.hostip.availableInterfaces?.length > 1 && !this.hostip.preferredInterface) this.selectPreferredInterface()

            for (const server of this.serverlist) {
                if (!server.serverip) continue
                window.ipcRenderer.invoke('pingexamserver', { serverip: server.serverip, serverport: server.apiPort }).then((result) => {
                    server.reachable = !!result?.ok
                    server.certChanged = result?.status === 'fingerprint-changed'
                }).catch(() => { server.reachable = false })
            }
        },

        async selectPreferredInterface() {
            if (this.interfaceDialogOpen || !this.hostip?.availableInterfaces?.length) return
            this.interfaceDialogOpen = true
            const result = await this.$swal.fire({
                title: this.$t('student.selectinterface'),
                text: this.$t('student.selectinterfaceinfo'),
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

        errorText(response) {
            const code = response?.code
            if (code && this.$te(`student.errors.${code}`)) return this.$t(`student.errors.${code}`)
            return response?.message || this.$t('student.errors.NETWORK')
        },

        validateInput() {
            if (!this.profile?.complete) return false
            if (!this.pincode) { this.$swal.fire({ title: this.$t('general.error'), text: this.$t('student.nopin'), icon: 'error' }); return false }
            return true
        },

        /** One register attempt incl. the "teacher app restarted" certificate question. */
        async tryRegister(serverip, servername, serverport) {
            const args = { clientname: this.username, servername, serverip, serverport, pin: String(this.pincode), participate: true }   // PIN typed = takes part
            let response = await window.ipcRenderer.invoke('register', args)
            if (response?.status === 'fingerprint-changed') {
                const confirm = await this.$swal.fire({
                    title: this.$t('student.fingerprintChangeTitle'),
                    text: this.$t('student.fingerprintChangeText'),
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: this.$t('student.fingerprintChangeConfirm'),
                    cancelButtonText: this.$t('general.cancel'),
                })
                if (!confirm.isConfirmed) return { status: 'cancelled' }
                const accepted = await window.ipcRenderer.invoke('accept-teacher-certificate', { serverip, serverport })
                if (!accepted?.ok) return { status: 'error', code: 'CERT' }
                response = await window.ipcRenderer.invoke('register', args)
            }
            return response
        },

        showJoinResult(response) {
            if (response?.status === 'cancelled') return
            if (response?.code === 'KNOCK_PENDING' || response?.code === 'KNOCK_DENIED') { this.fetchInfo(); return }   // shown as banner
            if (response?.status === 'success') {
                this.token = response.token
                localStorage.setItem('next-class-name', this.username)
                this.$swal.fire({ title: 'OK', text: response.reconnected ? this.$t('student.rejoined') : this.$t('student.joined'), icon: 'success', timer: 4000 })
                this.fetchInfo()
            } else {
                this.$swal.fire({ title: this.$t('general.error'), text: this.errorText(response), icon: 'error' })
            }
        },

        /** Join with name + PIN only: try every session found, the one whose PIN matches accepts. */
        async joinByPin() {
            if (!this.validateInput()) return
            this.joining = true
            try {
                let last = { status: 'error', code: 'WRONG_PIN' }
                for (const server of this.serverlist) {
                    if (!server.serverip) continue
                    const response = await this.tryRegister(server.serverip, server.servername, server.apiPort)
                    if (['success', 'cancelled'].includes(response?.status) || ['KNOCK_PENDING', 'KNOCK_DENIED'].includes(response?.code)) { last = response; break }
                    if (response?.code !== 'WRONG_PIN') last = response   // keep the most useful error
                }
                this.showJoinResult(last)
            } finally {
                this.joining = false
            }
        },

        /** Join one specific session. */
        async registerClient(serverip, servername, serverport) {
            if (!this.validateInput()) return
            this.joining = true
            try {
                this.showJoinResult(await this.tryRegister(serverip, servername, serverport))
            } finally {
                this.joining = false
            }
        },

        async leaveSession() {
            const result = await this.$swal.fire({
                title: this.$t('student.leave'),
                text: this.$t('student.leaveconfirm'),
                icon: 'question',
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
            })
            if (!result.isConfirmed) return
            await window.ipcRenderer.invoke('disconnect')
            this.token = false
            this.fetchInfo()
        },

        formatTime(ts) {
            return ts ? new Date(ts).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : ''
        },

        async installHelper() {
            const result = await window.ipcRenderer.invoke('netlock-install')
            if (result?.status === 'success') this.$swal.fire({ title: 'OK', text: this.$t('student.netlockinstalled'), icon: 'success', timer: 4000 })
            else this.$swal.fire({ title: this.$t('general.error'), text: this.$t('student.netlockinstallfailed') + (result?.message ? ` (${result.message})` : ''), icon: 'error' })
            this.fetchInfo()
        },

        quit() {
            window.ipcRenderer.invoke('quit-app')
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
                <span style="font-size:0.8em">Version: ${this.version} ${this.info}</span> <br>
                <span style="font-size:0.8em">Build: ${this.buildDate}</span>
                `,
            })
        },
    },
}
</script>

<style scoped>
#content { background-color: #f5f5f5; }
.nc-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
.nobutton { cursor: default; }
.disabledexam { pointer-events: none; opacity: 0.5; }
</style>
