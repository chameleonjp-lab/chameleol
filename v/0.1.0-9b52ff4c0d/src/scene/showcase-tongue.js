import { createPoseLedger, createTongueRig } from './tongue-rig.js';

const clamp = (value, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/**
 * ホーム専用の巻きベロ。形は共通部品（tongue-rig.js）、時間制御と乱数は showcase-motion.js が持つ。
 * 顎・口はホームの絶対値で書き、頭と目だけを加算して台帳で戻す。借りた材質は破棄しない。
 */
export function createShowcaseTongue(hero) {
  const { head, actorParts: { jaw, mouth, eyes } } = hero;
  const jawPosition = jaw.position.clone();
  const mouthPosition = mouth.position.clone();
  const jawRotation = jaw.rotation.clone();
  const mouthRotation = mouth.rotation.clone();
  const jawScale = jaw.scale.clone();
  const mouthScale = mouth.scale.clone();
  // 加算する姿勢の「前後の値」を台帳が持つ。通常の歩行が値を置き換えた後に、古い補正を引かない。
  const ledger = createPoseLedger();
  const rig = createTongueRig(hero, { name: 'showcase-tongue' });
  let disposed = false;

  function reset() {
    ledger.restore();
    jaw.position.copy(jawPosition);
    jaw.rotation.copy(jawRotation);
    jaw.scale.copy(jawScale);
    mouth.position.copy(mouthPosition);
    mouth.rotation.copy(mouthRotation);
    mouth.scale.copy(mouthScale);
    rig.reset();
  }

  return {
    apply(frame) {
      if (disposed) return;
      if (frame.tonguePhase === 'idle') {
        reset();
        return;
      }
      ledger.restore();
      const mouthOpen = clamp(frame.mouthOpen);
      jaw.position.copy(jawPosition);
      jaw.position.y -= 0.05 * mouthOpen;
      mouth.position.copy(mouthPosition);
      mouth.position.y -= 0.025 * mouthOpen;
      const gaze = clamp(frame.gazeWeight);
      ledger.add(head.rotation, 'z', clamp(frame.headTilt, -0.04, 0.04));
      eyes.forEach((eye, index) => ledger.add(eye.rotation, 'y', (index === 0 ? 0.18 : -0.18) * gaze));
      const storage = frame.tonguePhase === 'settle' ? 1 - clamp(frame.tonguePhaseMs / 150) : 1;
      rig.apply({ visible: true, extension: frame.extension, unroll: frame.unroll, storage });
    },
    getLocalEnvelope: (outBox) => rig.getLocalEnvelope(outBox),
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      rig.dispose();
    },
  };
}
