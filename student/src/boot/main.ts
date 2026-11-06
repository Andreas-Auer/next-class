/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
 * Modifications for Next-Class (c) 2026 Andreas Auer
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */

import { defineBoot } from '#q-app/wrappers'
import Swal from 'sweetalert2'
import i18n from '../locales/locales.js'
import config from '../utils/config.js'

export default defineBoot(async ({ app, router }) => {
    // one shared sweetalert2 instance with the Next-Class button colors, available as this.$swal
    const SwalMixin = Swal.mixin({ confirmButtonColor: '#0aa2c0', cancelButtonColor: '#6c757d', returnFocus: false })
    const $swal: any = (...args: any[]) => (SwalMixin.fire as any)(...args)
    Object.assign($swal, Swal)
    $swal.fire = (...args: any[]) => (SwalMixin.fire as any)(...args)
    app.config.globalProperties.$swal = $swal
    app.provide('$swal', $swal)
    app.config.globalProperties.$config = config
    app.use(i18n)

    // hide the loading overlay from index.html once the first route is ready
    router.isReady().then(() => {
        const overlay = document.getElementById('initial-loading-overlay')
        if (!overlay) return
        overlay.classList.add('fade-out')
        setTimeout(() => { overlay.style.display = 'none' }, 300)
    })
})
