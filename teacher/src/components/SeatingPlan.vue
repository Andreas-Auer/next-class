<!--
  @license GPL LICENSE
  Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
  GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>.
-->
<!--
  Seating plan of a course: a grid of rows and columns, aisle columns stay empty.
  Drag a student onto a seat (snaps in; an occupied seat swaps), or back to "Nicht zugeordnet".
  "Ansicht von hinten": board at the top (as the students see the room);
  "Ansicht von vorne": board at the bottom, mirrored (as the teacher sees the room from the desk).
-->
<template>
<div data-e2e="seating">
    <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
        <button class="btn btn-sm btn-outline-dark" data-e2e="seating-view" @click="$emit('view', view === 'front' ? 'back' : 'front')">
            ⇅ {{ view === 'front' ? $t('seating.viewfront') : $t('seating.viewback') }}
        </button>
        <button class="btn btn-sm btn-outline-secondary" data-e2e="seating-edit" @click="editing = !editing">⚙ {{ $t('seating.layout') }}</button>
        <template v-if="editing">
            <label class="small">{{ $t('seating.rows') }}</label>
            <input type="number" min="1" max="15" class="form-control form-control-sm" style="width: 70px;" :value="plan.rows" data-e2e="seating-rows" @change="setSize('rows', $event.target.value)">
            <label class="small">{{ $t('seating.cols') }}</label>
            <input type="number" min="1" max="15" class="form-control form-control-sm" style="width: 70px;" :value="plan.cols" data-e2e="seating-cols" @change="setSize('cols', $event.target.value)">
            <span class="small text-secondary">{{ $t('seating.aislehint') }}</span>
        </template>
    </div>

    <div v-if="view === 'back'" class="board mb-2">{{ $t('seating.board') }}</div>
    <div class="seatgrid" :style="{ gridTemplateColumns: colOrder.map((c) => isAisle(c) ? '28px' : 'minmax(120px, 1fr)').join(' ') }">
        <template v-if="editing">
            <button v-for="c in colOrder" :key="'h' + c" class="btn btn-sm p-0 small" :class="isAisle(c) ? 'btn-secondary' : 'btn-outline-secondary'"
                    :title="$t('seating.aisletoggle')" :data-e2e="`aisle-${c}`" @click="toggleAisle(c)">{{ isAisle(c) ? '' : c + 1 }}</button>
        </template>
        <template v-for="r in rowOrder" :key="'r' + r">
            <div v-for="c in colOrder" :key="r + ',' + c" class="seat" :class="{ aisle: isAisle(c), over: dragOver === `${r},${c}` }"
                 :data-e2e="isAisle(c) ? null : `seat-${r}-${c}`"
                 @dragover.prevent="!isAisle(c) && (dragOver = `${r},${c}`)" @dragleave="dragOver = null" @drop.prevent="dropOn(r, c)">
                <div v-if="!isAisle(c) && studentAt(r, c)" class="seatcard" :class="stateOf(studentAt(r, c))" draggable="true"
                     :data-e2e="`seated-${studentAt(r, c).clientname}`" :title="stateText(studentAt(r, c))"
                     @dragstart="dragKey = studentAt(r, c).courseKey" @click="$emit('select', studentAt(r, c))">
                    <img v-if="studentAt(r, c).imageurl && studentAt(r, c).online" :src="studentAt(r, c).imageurl" class="seatthumb">
                    <div class="text-truncate small fw-semibold">{{ studentAt(r, c).clientname }}</div>
                </div>
            </div>
        </template>
    </div>
    <div v-if="view === 'front'" class="board mt-2">{{ $t('seating.board') }}</div>

    <div class="mt-3 p-2 border rounded bg-white" data-e2e="unassigned" @dragover.prevent @drop.prevent="dropUnassigned">
        <div class="small text-secondary mb-1">{{ $t('seating.unassigned') }} ({{ unassigned.length }})</div>
        <div class="d-flex flex-wrap gap-2">
            <div v-for="st in unassigned" :key="st.courseKey" class="seatcard" style="width: 150px;" :class="stateOf(st)" draggable="true"
                 :data-e2e="`unseated-${st.clientname}`" :title="stateText(st)" @dragstart="dragKey = st.courseKey" @click="$emit('select', st)">
                <div class="text-truncate small fw-semibold">{{ st.clientname }}</div>
            </div>
        </div>
    </div>
    <div class="d-flex gap-3 small mt-2 text-secondary">
        <span><span class="dot participating"></span>{{ $t('seating.participating') }}</span>
        <span><span class="dot notjoined"></span>{{ $t('seating.notjoined') }}</span>
        <span><span class="dot offline"></span>{{ $t('seating.offline') }}</span>
        <span><span class="dot alarm"></span>{{ $t('seating.alarm') }}</span>
    </div>
</div>
</template>

<script>
import { normalizeSeating, placeStudent, unseat } from 'next-class-shared/seating.js'

export default {
    props: {
        seating: { type: Object, default: null },
        students: { type: Array, default: () => [] },   // dashboard entries of course students (courseKey)
        view: { type: String, default: 'front' },
        alarmFor: { type: Function, default: () => null },
    },
    emits: ['change', 'view', 'select'],
    data() {
        return { editing: false, dragKey: null, dragOver: null }
    },
    computed: {
        plan() { return normalizeSeating(this.seating) },
        // back view: front row on top, columns left to right; front view: rotated by 180°
        rowOrder() { const r = [...Array(this.plan.rows).keys()]; return this.view === 'front' ? r.reverse() : r },
        colOrder() { const c = [...Array(this.plan.cols).keys()]; return this.view === 'front' ? c.reverse() : c },
        byKey() { return new Map(this.students.filter((s) => s.courseKey).map((s) => [s.courseKey, s])) },
        unassigned() {
            const seated = new Set(Object.values(this.plan.seats))
            return this.students.filter((s) => s.courseKey && !seated.has(s.courseKey))
        },
    },
    methods: {
        isAisle(c) { return this.plan.aisles.includes(c) },
        studentAt(r, c) { return this.byKey.get(this.plan.seats[`${r},${c}`]) || null },
        stateOf(st) {
            if (this.alarmFor(st)) return 'alarm'
            if (!st.online || st.absent) return 'offline'
            return st.participating ? 'participating' : 'notjoined'
        },
        stateText(st) { return this.$t(`seating.${this.stateOf(st)}`) },
        emit(plan) { this.$emit('change', JSON.parse(JSON.stringify(plan))) },
        dropOn(r, c) {
            this.dragOver = null
            if (!this.dragKey || this.isAisle(c)) return
            this.emit(placeStudent(this.plan, this.dragKey, r, c))
            this.dragKey = null
        },
        dropUnassigned() {
            if (!this.dragKey) return
            this.emit(unseat(this.plan, this.dragKey))
            this.dragKey = null
        },
        setSize(key, value) {
            this.emit(normalizeSeating({ ...this.plan, [key]: Number(value) }))
        },
        toggleAisle(c) {
            const aisles = this.isAisle(c) ? this.plan.aisles.filter((a) => a !== c) : [...this.plan.aisles, c]
            this.emit(normalizeSeating({ ...this.plan, aisles }))
        },
    },
}
</script>

<style scoped>
.seatgrid { display: grid; gap: 6px; }
.seat { min-height: 64px; border: 1px dashed #ced4da; border-radius: 6px; background: #fff; }
.seat.aisle { border: none; background: transparent; }
.seat.over { border: 2px solid #0d6efd; }
.seatcard { height: 100%; min-height: 60px; border-radius: 6px; padding: 4px 6px; cursor: grab; border-left: 6px solid #6c757d; background: #f8f9fa; }
.seatcard.participating { border-left-color: #198754; }
.seatcard.notjoined { border-left-color: #fd7e14; }
.seatcard.offline { border-left-color: #adb5bd; opacity: 0.7; }
.seatcard.alarm { border-left-color: #dc3545; background: #f8d7da; }
.seatthumb { width: 100%; height: 40px; object-fit: cover; border-radius: 3px; }
.board { text-align: center; background: #343a40; color: #fff; border-radius: 4px; font-size: 0.8em; padding: 2px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.dot.participating { background: #198754; } .dot.notjoined { background: #fd7e14; } .dot.offline { background: #adb5bd; } .dot.alarm { background: #dc3545; }
</style>
