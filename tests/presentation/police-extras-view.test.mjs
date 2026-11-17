import test from 'node:test';
import assert from 'node:assert/strict';
import {createActorReactions} from '../../src/presentation/actor-reactions.js';
import {createPoliceExtras} from '../../src/presentation/police-extras.js';
import {createChameleon, createFerret} from '../../src/scene/characters.js';

const ctx = new Proxy({}, {get: (_, k) => k === 'createRadialGradient' ? () => ({addColorStop() {}}) : () => {}});
globalThis.document = {createElement: () => ({getContext: () => ctx})};
const view = (t, extra = {}) => ({playId: 'a', t, running: true, phase: 'eval', policeStage: 1, combo: 0, passed: 0, building: 1, matchState: null, lastEvalSuccess: false, ...extra});
const inquiry = elapsedMs => ({id: 34, kind: 'inquiry', startedAt: 1000, elapsedMs, durationMs: 1200, building: 1, phase: 'investigate'});
const footprints = elapsedMs => ({id: 39, kind: 'footprints', startedAt: 1000, elapsedMs, durationMs: 1500, building: 1, phase: 'investigate'});

function rig(opts = {}) {
  const hero = createChameleon(), police = [createFerret(), createFerret()];
  const r = createActorReactions({hero, police, ...opts});
  const capture = () => {
    const out = [];
    for (const actor of [hero, ...police]) actor.group.traverse(n => out.push([n.uuid, n.visible, ...n.position.toArray(), ...n.quaternion.toArray(), ...n.scale.toArray()]));
    return out;
  };
  return {
    hero, police, r, capture,
    // One stage frame: base animation, existing reactions, then the extra (same order as the stage).
    frame(v, extra = null) {
      hero.animate(0, {walking: false}); police.forEach(p => p.animate(0, {walking: false}));
      r.tick(v);
      return r.applyPoliceExtra(extra, v);
    },
    dispose() { r.dispose(); hero.dispose(); police.forEach(p => p.dispose()); },
  };
}
const sketchOf = a => a.police[0].head.children.find(n => n.isMesh && n.geometry.type === 'BoxGeometry' && n.material.color.getHex() === 0xfff1cc);

test('busy_matches_stats_for_hero_and_police_actions', () => {
  const a = rig();
  try {
    assert.deepEqual(a.r.busy(), {hero: false, police: false});
    a.frame(view(0, {policeStage: 0}));
    a.frame(view(100, {policeStage: 1}));
    assert.equal(a.r.stats().police, 'radio');
    assert.deepEqual(a.r.busy(), {hero: a.r.stats().hero !== null, police: a.r.stats().police !== null});
    assert.equal(a.r.busy().police, true);
    a.frame(view(200, {policeStage: 1, matchState: 'success'}));
    a.frame(view(5000, {policeStage: 0}));
    a.frame(view(5100, {policeStage: 0, building: 2, combo: 3}));
    assert.deepEqual(a.r.busy(), {hero: a.r.stats().hero !== null, police: a.r.stats().police !== null});
    assert.equal(a.r.busy().hero, true);
    for (let t = 6000; t < 9000; t += 250) {
      a.frame(view(t, {policeStage: 1}));
      assert.deepEqual(a.r.busy(), {hero: a.r.stats().hero !== null, police: a.r.stats().police !== null});
    }
    assert.deepEqual(a.r.busy(), {hero: false, police: false});
  } finally { a.dispose(); }
});

test('inquiry_offsets_follow_the_controller_clock_and_end_at_zero', () => {
  const a = rig();
  try {
    const dx = ms => a.frame(view(1000 + ms), inquiry(ms)).dx;
    assert.equal(dx(0), 0);
    assert.equal(dx(200), 0);
    assert.ok(Math.abs(dx(400) + 0.4) < 1e-9);
    assert.ok(Math.abs(dx(600) + 0.8) < 1e-9);
    assert.ok(Math.abs(dx(800) + 1.0) < 1e-9);
    assert.ok(dx(1000) < 0 && dx(1000) > -1);
    assert.ok(Math.abs(dx(1200)) < 1e-9);
    assert.ok(dx(900) <= 0, 'never moves the officer to the right of the formal position');
  } finally { a.dispose(); }
});

test('inquiry_turns_toward_the_wall_raises_the_sketch_and_hides_it_at_1150', () => {
  const a = rig();
  try {
    const lean = a.police[0].actorParts.lean, sketch = sketchOf(a);
    assert.ok(sketch);
    const restY = lean.rotation.y;
    a.frame(view(1000), inquiry(0));
    assert.equal(sketch.visible, false);
    a.frame(view(1400), inquiry(400));
    assert.ok(lean.rotation.y - restY > 0.7, 'turned toward the wall');
    assert.equal(sketch.visible, true);
    assert.ok(sketch.position.y > -.45 + .1, 'sketch raised by about 0.15');
    a.frame(view(2160), inquiry(1160));
    assert.equal(sketch.visible, false);
    // Legs stand still while asking.
    a.frame(view(1500), inquiry(500));
    assert.equal(Math.abs(a.police[0].actorParts.legs[0].rotation.z), 0);
  } finally { a.dispose(); }
});

test('footprints_lean_look_around_and_aim_the_light_without_touching_the_hero', () => {
  const a = rig();
  try {
    const p = a.police[0], restBeam = p.beam.rotation.z;
    const heroBefore = a.capture().slice(0, 1);
    a.frame(view(1000), footprints(0));
    const leanRest = p.actorParts.lean.rotation.z;
    a.frame(view(1400), footprints(400));
    assert.ok(p.actorParts.lean.rotation.z < leanRest - 0.15, 'bends forward');
    assert.ok(p.beam.rotation.z < restBeam - 0.1, 'light points toward the ground');
    const yaw = ms => { a.frame(view(1000 + ms), footprints(ms)); return p.actorParts.head.rotation.y; };
    const y750 = yaw(750), y950 = yaw(950), y1150 = yaw(1150);
    assert.ok(y750 < -0.5 && y950 > 0.5 && y1150 < -0.2, `${y750} ${y950} ${y1150}`);
    assert.equal(a.frame(view(1600), footprints(600)).dx, -0.8);
    assert.ok(Math.abs(a.frame(view(2500), footprints(1500)).dx) < 1e-9);
    assert.equal(a.hero.actorParts.arms[0].rotation.z, heroBefore ? a.hero.actorParts.arms[0].rotation.z : 0);
  } finally { a.dispose(); }
});

test('null_cancels_to_zero_and_the_next_frame_has_no_residual_pose', () => {
  for (const make of [inquiry, footprints]) {
    const a = rig();
    try {
      const plain = rig();
      a.frame(view(1000));
      plain.frame(view(1000));
      assert.equal(a.frame(view(1400), make(400)).dx !== 0, true);
      const cancelled = a.frame(view(1416), null);
      assert.equal(cancelled.dx, 0);
      plain.frame(view(1400));
      plain.frame(view(1416));
      // The nodes the extra owns are back at what a rig that never ran an extra shows.
      const own = node => [node.police[0].actorParts.lean.rotation.y, node.police[0].actorParts.head.rotation.y, node.police[0].beam.rotation.z].map(v => v + 0);
      assert.deepEqual(own(a), own(plain));
      assert.equal(sketchOf(a).visible, false);
      plain.dispose();
    } finally { a.dispose(); }
  }
});

test('police_one_to_zero_and_one_to_two_cancel_through_the_real_extras_module', () => {
  for (const next of [0, 2]) {
    const a = rig(), extras = createPoliceExtras({fresh: true});
    try {
      const base = {...view(1000, {phase: 'eval'}), placements: {policeSettled: true}};
      extras.step(base);
      let e = extras.step({...base, t: 1100, phase: 'grace'});
      assert.equal(e?.kind, 'inquiry');
      a.frame(view(1100), e);
      e = extras.step({...base, t: 1500, phase: 'grace'});
      assert.ok(e && e.elapsedMs === 400);
      assert.ok(a.frame(view(1500), e).dx < 0);
      e = extras.step({...base, t: 1516, phase: 'grace', policeStage: next});
      assert.equal(e, null);
      assert.equal(a.frame(view(1516, {policeStage: next}), e).dx, 0);
      // The logical formal position is untouched by the view-only offset.
      assert.equal(a.police[0].group.position.x, 0);
    } finally { extras.dispose(); a.dispose(); }
  }
});

test('paused_frames_never_stack_the_pose_and_return_the_same_offset', () => {
  const a = rig();
  try {
    a.frame(view(1000), inquiry(0));
    const first = a.frame(view(1400), inquiry(400));
    const captured = a.capture();
    for (let i = 0; i < 6; i++) {
      // Paused: the scene skips base animators, so only the reaction tick and the extra run.
      a.r.tick(view(1400, {running: false}));
      const again = a.r.applyPoliceExtra(inquiry(400), view(1400, {running: false}));
      assert.equal(again.dx, first.dx);
    }
    assert.deepEqual(a.capture(), captured);
    // Resuming at the same clock rewrites the same pose (restore first, write once).
    a.frame(view(1400), inquiry(400));
    assert.deepEqual(a.capture(), captured);
  } finally { a.dispose(); }
});

test('extras_do_not_advance_the_sketch_binocular_alternation', () => {
  const successGrace = (a, building, t, extra) => {
    a.frame(view(t, {building}));
    a.frame(view(t + 1, {building, phase: 'grace', lastEvalSuccess: true}), extra);
    a.frame(view(t + 502, {building, phase: 'grace', lastEvalSuccess: true}), extra);
    return a.r.stats().police;
  };
  const plain = rig(), mixed = rig();
  plain.frame(view(0)); mixed.frame(view(0));
  try {
    const seq = [[1, 1000], [2, 3500], [3, 6000], [4, 8500]];
    const a = seq.map(([b, t]) => successGrace(plain, b, t, null));
    const b = seq.map(([bb, t], i) => successGrace(mixed, bb, t, i % 2 ? footprints(300) : inquiry(300)));
    assert.deepEqual(a, ['sketch', 'binoculars', 'sketch', 'binoculars']);
    assert.deepEqual(b, a);
    assert.deepEqual(mixed.r.stats().counts, plain.r.stats().counts);
  } finally { plain.dispose(); mixed.dispose(); }
});

test('reduced_motion_holds_a_static_pose_without_sliding', () => {
  const a = rig({reducedMotion: true});
  try {
    for (const make of [inquiry, footprints]) {
      for (const ms of [0, 300, 800, 1100]) assert.equal(a.frame(view(1000 + ms), make(ms)).dx, 0);
    }
  } finally { a.dispose(); }
});

test('unknown_or_missing_extras_return_zero_and_leave_actors_alone', () => {
  const a = rig();
  try {
    a.frame(view(1000));
    const before = a.capture();
    for (const bad of [null, undefined, {}, {kind: 'x', elapsedMs: 1}, {kind: 'inquiry'}]) assert.deepEqual(a.r.applyPoliceExtra(bad, view(1000)), {dx: 0});
    assert.deepEqual(a.capture(), before);
    a.r.dispose();
    assert.deepEqual(a.r.applyPoliceExtra(inquiry(100), view(1000)), {dx: 0});
  } finally { a.hero.dispose(); a.police.forEach(p => p.dispose()); }
});
