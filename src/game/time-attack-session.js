import {
  applyTimeAttackEvent, centiseconds, COURSE_VERSION, createTimeAttackState,
  RULES_VERSION, HISTORY_FORMAT, MAX_HISTORY_EVENTS, MODE_ID, RESULT_FORMAT, titleForTime,
} from '../rules/time-attack/v1/index.js';

const timed = phase => phase === 'active' || phase === 'travel';
const pauseable = new Set(['active', 'await_travel', 'travel', 'await_ready']);

function longestColors(targets, durations) {
  const used = new Set();
  const result = [];
  for (const { building, elapsedMs } of [...durations].sort((a, b) => b.elapsedMs - a.elapsedMs || a.building - b.building)) {
    const hsv = targets[building - 1];
    const key = `${hsv.h}/${hsv.s}/${hsv.v}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push({ hsv, building, elapsedMs });
    if (result.length === 3) break;
  }
  return result;
}

export class TimeAttackSession {
  constructor(course) {
    this.course = course;
    this.state = createTimeAttackState(course);
    this.events = [];
    this.clock = 0;
    this.lastUpdate = null;
    this.hiddenBeforeReady = false;
    this.historyTooLarge = false;
    this.buildingStartedAt = 0;
    this.buildingTimes = [];
  }

  event(kind, fields = {}) {
    const event = { seq: this.events.length, t: this.state.t, kind, ...fields };
    if (kind === 'ready' && fields.building > 1) this.recordBuildingTime();
    this.state = applyTimeAttackEvent(this.state, event, this.course);
    if (kind !== 'end') {
      if (this.events.length < MAX_HISTORY_EVENTS - 1) this.events.push(event);
      else this.historyTooLarge = true;
    }
    return event;
  }

  recordBuildingTime() {
    const { building, elapsedMs } = this.state;
    const duration = elapsedMs - this.buildingStartedAt;
    if (duration > 0) this.buildingTimes.push({ building, elapsedMs: duration });
    this.buildingStartedAt = elapsedMs;
  }

  update(now) {
    if (!Number.isFinite(now) || (this.lastUpdate !== null && now < this.lastUpdate)) return;
    const delta = this.lastUpdate === null ? 0 : now - this.lastUpdate;
    this.lastUpdate = now;
    if (!timed(this.state.phase)) return;
    if (delta > 1000) {
      this.pauseAtCurrentTime();
      return;
    }
    const proposed = this.clock + delta;
    const phase = this.state.phase;
    this.state = applyTimeAttackEvent(this.state, { kind: 'tick', t: Math.floor(proposed + 1e-7) }, this.course);
    this.clock = this.state.phase === phase ? proposed : this.state.t;
    if (this.course.rulesVersion !== RULES_VERSION && this.state.phase === 'await_ready' && phase === 'active') {
      this.event('ready', { building: this.state.building + 1 });
    }
  }

  frame(now) {
    const phase = this.state.phase;
    this.update(now);
    // An intervening render exposes the movement or the next wall. Discard
    // time after the boundary until that new view is ready.
    if (this.state.phase !== phase) return;
    if (phase === 'prepared' && !this.hiddenBeforeReady) this.event('ready', { building: 1 });
    if (phase === 'await_travel') this.event('travel', { fromBuilding: this.state.building });
    if (phase === 'await_ready') this.event('ready', { building: this.state.building + 1 });
  }

  input(color, now) {
    const building = this.state.building;
    this.update(now);
    if (this.state.phase !== 'active' || this.state.building !== building) return false;
    const { h, s, v } = this.state.color;
    if (h !== color.h || s !== color.s || v !== color.v) this.event('input', color);
    return true;
  }

  pauseAtCurrentTime() {
    if (this.state.phase === 'prepared') this.hiddenBeforeReady = true;
    if (pauseable.has(this.state.phase)) this.event('pause');
  }

  pause(now) {
    this.update(now);
    this.pauseAtCurrentTime();
  }

  resume(now) {
    this.lastUpdate = now;
    this.hiddenBeforeReady = false;
    if (this.state.phase === 'paused') this.event('resume');
  }

  finish() {
    const { phase, elapsedMs, clearedCount } = this.state;
    const reason = phase === 'cleared' ? 'cleared' : 'quit';
    const elapsedCs = centiseconds(elapsedMs);
    this.recordBuildingTime();
    const trickyColors = longestColors(this.course.targets, this.buildingTimes);
    const end = phase === 'prepared' ? null : this.event('end', { reason, elapsedMs, elapsedCs });
    const { seed, family, rulesVersion } = this.course;
    const history = end && !this.historyTooLarge ? {
      format: HISTORY_FORMAT, modeId: MODE_ID, rulesVersion,
      generatorVersion: COURSE_VERSION, seed, family, events: this.events, end,
    } : null;
    return {
      history, historyTooLarge: this.historyTooLarge,
      result: { format: RESULT_FORMAT, rulesVersion, reason, clearedCount, elapsedCs,
        elapsedMs, family, trickyColors, titleId: reason === 'cleared' ? titleForTime(elapsedCs, rulesVersion) : null },
    };
  }
}
