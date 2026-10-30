import type { Rig } from './characters';
import type { meleePose } from './melee-motion';

type MeleePose = ReturnType<typeof meleePose>;

/** Clear the extra joint offsets before composing the next frame's pose. */
export function resetRigJoints(rig: Rig): void {
  rig.armR.rotation.order = 'XYZ';
  rig.armL.rotation.order = 'XYZ';
  rig.armR.rotation.y = 0;
  rig.armL.rotation.y = 0;
  rig.elbowL.rotation.set(0, 0, 0);
  rig.elbowR.rotation.set(0, 0, 0);
  rig.kneeL.rotation.set(0, 0, 0);
  rig.kneeR.rotation.set(0, 0, 0);
  rig.body.position.y = 0;
}

/** Apply a committed swing over the normal locomotion pose. */
export function applyMeleePose(rig: Rig, pose: MeleePose, hand: 'left' | 'right' = 'right'): void {
  const { torso, legL, legR, kneeL, kneeR, body } = rig;
  const strikingArm = hand === 'right' ? rig.armR : rig.armL;
  const offArm = hand === 'right' ? rig.armL : rig.armR;
  const strikingElbow = hand === 'right' ? rig.elbowR : rig.elbowL;
  const offElbow = hand === 'right' ? rig.elbowL : rig.elbowR;
  const blendOut = 1 - pose.weight;
  const baseArmX = strikingArm.rotation.x, baseOffX = offArm.rotation.x;
  torso.rotation.y = torso.rotation.y * blendOut + pose.torsoYaw;
  torso.rotation.x = torso.rotation.x * blendOut + pose.lean;
  // Counter-rotate at the shoulder so the hand continues to sweep across the
  // intended facing-relative arc while the torso contributes its own twist.
  const weight = pose.weight;
  const elbowBend = -0.35 * weight;
  // YXZ makes yaw a turn about the upright axis after raising the arm. Correct
  // for the sideways contribution of roll, including the bent forearm.
  const forward = -0.52 * Math.sin(pose.armX) * Math.cos(pose.armZ)
    - 0.48 * Math.sin(pose.armX + elbowBend) * Math.cos(pose.armZ);
  const sideways = Math.sin(pose.armZ);
  const rollBearing = Math.atan2(sideways, Math.max(0.001, forward));
  strikingArm.rotation.order = 'YXZ';
  strikingArm.rotation.set(pose.armX + (baseArmX + .12) * blendOut, pose.armY - pose.torsoYaw - rollBearing * weight, pose.armZ);
  offArm.rotation.x = pose.offArmX + (baseOffX + .12) * blendOut;
  strikingElbow.rotation.x = strikingElbow.rotation.x * blendOut + elbowBend;
  offElbow.rotation.x = offElbow.rotation.x * blendOut - 0.22 * weight;
  legL.rotation.x = legL.rotation.x * (1 - pose.weight) - pose.kneeBend;
  legR.rotation.x = legR.rotation.x * (1 - pose.weight) - pose.kneeBend * 0.7;
  kneeL.rotation.x = kneeL.rotation.x * (1 - pose.weight) + pose.kneeBend * 1.8;
  kneeR.rotation.x = kneeR.rotation.x * (1 - pose.weight) + pose.kneeBend * 1.4;
  body.position.y = -pose.kneeBend * 0.09;
}

/** Follow-through at the elbows and knees during gait and in the air. */
export function applyLocomotionJoints(rig: Rig, walkPhase: number, moving: boolean, grounded: boolean): void {
  if (!grounded) {
    rig.kneeL.rotation.x = 0.65;
    rig.kneeR.rotation.x = 0.35;
    rig.elbowL.rotation.x = -0.4;
    rig.elbowR.rotation.x = -0.35;
    return;
  }
  const stride = moving ? Math.sin(walkPhase) : 0;
  rig.kneeL.rotation.x = Math.max(0, stride) * 0.65;
  rig.kneeR.rotation.x = Math.max(0, -stride) * 0.65;
  rig.elbowL.rotation.x = moving ? -0.25 - Math.max(0, -stride) * 0.15 : 0;
  rig.elbowR.rotation.x = moving ? -0.25 - Math.max(0, stride) * 0.15 : 0;
}

/** A loaded elbow extends on release; the opposite arm balances the throw. */
export function applyThrowJoints(rig: Rig, progress: number): void {
  const t = Math.max(0, Math.min(1, progress));
  const load = Math.min(1, t / 0.45);
  const release = Math.max(0, Math.min(1, (t - 0.45) / 0.25));
  rig.elbowR.rotation.x = -0.65 * load * (1 - release);
  rig.elbowL.rotation.x = -0.25 * Math.sin(Math.PI * t);
  rig.kneeL.rotation.x = 0.25 * Math.sin(Math.PI * t);
  rig.kneeR.rotation.x = 0.15 * Math.sin(Math.PI * t);
}
