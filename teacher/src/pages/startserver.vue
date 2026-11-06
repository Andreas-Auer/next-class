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
            <div class="mt-auto">
                <button class="btn btn-outline-secondary btn-sm mb-2" @click="toggleLocale">{{ inactiveLocale }}</button><br>
                <span style="font-size: 0.8em; cursor: pointer;" @click="showCopyleft">
                    <span style="display:inline-block; transform: scaleX(-1);">&copy;</span> {{ config.version }} {{ config.info }}
                </span>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-grow-1 p-4 overflow-auto" style="background-color: #f5f5f5;">
            <h3 class="mb-3">{{ $t('startserver.title') }}</h3>
            <p class="text-secondary" style="max-width: 640px;">{{ $t('startserver.intro') }}</p>

            <div class="input-group mb-2" style="max-width: 480px;">
                <span class="input-group-text" style="width: 140px;">{{ $t('startserver.name') }}</span>
                <input v-model="servername" id="servername" data-e2e="session-name" class="form-control" maxlength="40"
                       :placeholder="$t('startserver.nameplaceholder')" @keyup.enter="startSession">
            </div>
            <div v-if="servername && !validName" class="text-danger small mb-2">{{ $t('startserver.invalidname') }}</div>
            <button id="examstart" data-e2e="session-start" class="btn btn-success mt-2" :disabled="!validName || starting" @click="startSession">
                {{ $t('startserver.start') }}
            </button>

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
                    <div v-for="s in [...lanSessions, ...manualSessions]" :key="s.id + s.address" class="border bg-white rounded p-2" style="width: 240px;">
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
</div>
</template>

<script>
const NAME_PATTERN = /^[a-z0-9äöüß][a-z0-9äöüß _.-]{0,39}$/

export default {
    data() {
        return {
            config: window.config || {},
            servername: '',
            starting: false,
            hostip: null,
            runningSessions: [],
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
        async refresh() {
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
            if (r.status === 'success') this.manualSessions = r.serverlist.map((s) => ({ id: s.id, servername: s.servername, address: s.address }))
            else this.$swal.fire({ title: this.$t('general.error'), text: r.message, icon: 'error' })
        },
        /** Ask to join as co-teacher, then wait for the host's approval. */
        async coJoin(address, servername) {
            const form = await this.$swal.fire({
                title: this.$t('coteacher.join'),
                html: `<input id="co-name" class="swal2-input" data-e2e="cojoin-name" placeholder="${this.$t('coteacher.name')}" value="${(localStorage.getItem('next-class-teacher-name') || '').replace(/"/g, '')}">`
                    + `<input id="co-code" class="swal2-input" data-e2e="cojoin-code" inputmode="numeric" maxlength="6" placeholder="${this.$t('coteacher.code')}">`,
                showCancelButton: true,
                cancelButtonText: this.$t('general.cancel'),
                preConfirm: () => ({ name: document.getElementById('co-name').value.trim(), code: document.getElementById('co-code').value.trim() }),
            })
            if (!form.isConfirmed) return
            const { name, code } = form.value
            try { localStorage.setItem('next-class-teacher-name', name) } catch { /* private mode */ }
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
