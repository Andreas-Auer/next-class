<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.
-->
<template>
<div class="d-flex flex-column" style="height: 100vh;">
    <div class="w-100 p-3 text-white bg-dark d-flex align-items-center flex-shrink-0" style="height: 63px;">
        <button class="btn btn-sm btn-outline-light me-3" data-e2e="settings-back" @click="$router.push({ name: 'startserver' })">← {{ $t('profile.back') }}</button>
        <span style="font-size: 23px;">{{ $t('profile.settings') }}</span>
    </div>
    <div class="flex-grow-1 p-4 overflow-auto" style="background-color: #f5f5f5;">
        <div style="max-width: 680px;">
            <!-- submission folder first: the setting teachers look for most -->
            <div class="bg-white border rounded p-3 mb-3" data-e2e="settings-folder">
                <h5 class="mb-1">{{ $t('profile.folder') }}</h5>
                <p class="text-secondary small mb-2">{{ $t('profile.folderhint') }}</p>
                <FolderField v-if="profile" :folder="profile.folder" :is-default="profile.isDefault" @update="setFolder" />
            </div>

            <div class="bg-white border rounded p-3 mb-3">
                <h5 class="mb-2">{{ $t('profile.name') }}</h5>
                <div class="input-group" style="max-width: 420px;">
                    <input v-model="name" class="form-control" data-e2e="settings-name" maxlength="40" :placeholder="$t('profile.nameplaceholder')" @keyup.enter="saveName">
                    <button class="btn btn-outline-primary" :disabled="!name.trim() || name.trim() === profile?.name" @click="saveName">{{ $t('profile.save') }}</button>
                </div>
            </div>

            <div class="bg-white border rounded p-3 mb-3">
                <h5 class="mb-2">{{ $t('profile.language') }}</h5>
                <div class="btn-group">
                    <button class="btn btn-sm" :class="$i18n.locale === 'de' ? 'btn-primary' : 'btn-outline-primary'" @click="$i18n.locale = 'de'">Deutsch</button>
                    <button class="btn btn-sm" :class="$i18n.locale === 'en' ? 'btn-primary' : 'btn-outline-primary'" @click="$i18n.locale = 'en'">English</button>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<script>
import FolderField from '../components/FolderField.vue'

export default {
    components: { FolderField },
    data() {
        return { profile: null, name: '' }
    },
    async mounted() {
        this.profile = await window.ipcRenderer.invoke('profile-get')
        this.name = this.profile.name
    },
    methods: {
        async saveName() {
            const r = await window.ipcRenderer.invoke('profile-set', { name: this.name })
            if (r.status === 'success') {
                this.profile = r.profile
                this.name = r.profile.name
                this.$swal.fire({ title: this.$t('profile.saved'), icon: 'success', timer: 1200, showConfirmButton: false })
            }
        },
        async setFolder(folder) {
            const r = await window.ipcRenderer.invoke('profile-set', { folder })
            if (r.status === 'success') this.profile = r.profile
        },
    },
}
</script>
