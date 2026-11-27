(function (global) {
  'use strict';

  const GEAR_RATIOS = {
    R: { label: 'R', dir: -1, maxKmh: 32, torque: 1.15 },
    N: { label: 'N', dir: 0, maxKmh: 0, torque: 0 },
    1: { label: '1', dir: 1, maxKmh: 28, torque: 1.72 },
    2: { label: '2', dir: 1, maxKmh: 54, torque: 1.38 },
    3: { label: '3', dir: 1, maxKmh: 84, torque: 1.12 },
    4: { label: '4', dir: 1, maxKmh: 118, torque: 0.90 },
    5: { label: '5', dir: 1, maxKmh: 158, torque: 0.74 },
    6: { label: '6', dir: 1, maxKmh: 280, torque: 0.62 }
  };

  const MANUAL_SEQUENCE = ['R', 'N', '1', '2', '3', '4', '5', '6'];

  class BusPhysics {
    constructor() {
      this.powerMode = false;
      this.reset(0, 0, 0, 0);
    }

    reset(x, y, z, yaw) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.yaw = yaw;
      this.speedMs = 0;
      this.steerAngle = 0;
      this.rpm = 800;
      this.gear = '1';
      this.autoDriveMode = 'D';
      this.handbrake = false;
      this.isBraking = false;
      this.beamMode = 0; // 0=OFF, 1=LOW, 2=HIGH
      this.indLeft = false;
      this.indRight = false;
      this.hazardOn = false;
      this.doorOpen = false;
      this.suspPitch = 0;
      this.suspRoll = 0;
      this.suspBounce = 0;
      this.bouncePhase = 0;
      this.lastDt = 0.016;
      this.surfaceType = 'asphalt';
      this.hitCooldown = 0;
    }

    get headlightsOn() {
      return this.beamMode > 0;
    }

    set headlightsOn(v) {
      this.beamMode = v ? (this.beamMode || 1) : 0;
    }

    shiftUp(transmission) {
      if (transmission === 'auto') {
        if (this.autoDriveMode === 'R') this.autoDriveMode = 'N';
        else if (this.autoDriveMode === 'N') {
          this.autoDriveMode = 'D';
          this.gear = '1';
        }
        return this.autoDriveMode;
      }
      const idx = MANUAL_SEQUENCE.indexOf(this.gear);
      if (idx < MANUAL_SEQUENCE.length - 1) {
        this.gear = MANUAL_SEQUENCE[idx + 1];
      }
      return this.gear;
    }

    shiftDown(transmission) {
      if (transmission === 'auto') {
        if (this.autoDriveMode === 'D') this.autoDriveMode = 'N';
        else if (this.autoDriveMode === 'N' && Math.abs(this.speedMs) < 2.0) {
          this.autoDriveMode = 'R';
          this.gear = 'R';
        }
        return this.autoDriveMode;
      }
      const idx = MANUAL_SEQUENCE.indexOf(this.gear);
      if (idx > 0) {
        this.gear = MANUAL_SEQUENCE[idx - 1];
      }
      return this.gear;
    }

    step(dt, input, busSpec, upgrades, sensitivity, transmission, fuel, surfaceInfo, rainInput, mechMods, weatherState) {
      const clampedDt = Math.min(dt, 0.05);
      this.lastDt = clampedDt;
      if (this.hitCooldown > 0) this.hitCooldown -= clampedDt;

      const mods = mechMods || { engineStalled: false, powerMult: 1, brakeMult: 1, steerPull: 0, suspMult: 1, fatigueDrift: 0 };
      const wState = weatherState || { rainIntensity: rainInput ? 0.85 : 0, windStrength: 0.1, gripFactor: rainInput ? 0.78 : 1.0 };

      this.surfaceType = surfaceInfo.surface || 'asphalt';
      const engLvl = upgrades.engine || 0;
      const pwrSpeedMult = this.powerMode ? 1.14 : 1.0;
      const pwrTorqueMult = this.powerMode ? 1.28 : 1.0;
      const engineBoost = (1 + engLvl * 0.12) * (mods.powerMult || 1) * pwrSpeedMult;
      const engineTorqueBoost = (1 + engLvl * 0.18) * (mods.powerMult || 1) * pwrTorqueMult;
      const brakeBoost = (1 + (upgrades.brakes || 0) * 0.14) * (mods.brakeMult || 1);
      const suspBoost = (1 + (upgrades.suspension || 0) * 0.12) * (mods.suspMult || 1);
      const fuelEff = (1 - (upgrades.tank || 0) * 0.14) * (this.powerMode ? 1.12 : 1.0);

      const maxForwardKmh = busSpec.topSpeedKmh * engineBoost;
      const maxForwardMs = maxForwardKmh / 3.6;
      const speedKmh = Math.abs(this.speedMs) * 3.6;

      // Auto-close passenger door once moving faster than 6 km/h
      if (this.doorOpen && speedKmh > 6) {
        this.doorOpen = false;
      }

      let gas = input.gas ? 1 : 0;
      let brake = input.brake ? 1 : 0;

      if (transmission === 'auto') {
        if (this.autoDriveMode === 'D') {
          if (brake > 0 && this.speedMs <= 0.4) {
            this.gear = 'R';
            gas = brake;
            brake = 0;
          } else {
            if (speedKmh > 122) this.gear = '6';
            else if (speedKmh > 92) this.gear = '5';
            else if (speedKmh > 64) this.gear = '4';
            else if (speedKmh > 40) this.gear = '3';
            else if (speedKmh > 20) this.gear = '2';
            else this.gear = '1';
          }
        } else if (this.autoDriveMode === 'R') {
          this.gear = 'R';
        } else {
          this.gear = 'N';
        }
      }

      const gearCfg = GEAR_RATIOS[this.gear] || GEAR_RATIOS['1'];
      const hasFuel = fuel > 0.1 && !mods.engineStalled;

      const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      const steerSpeed = 2.6 * sensitivity;
      const maxSteer = 0.52 / (1 + Math.abs(this.speedMs) * 0.032);
      if (steerTarget !== 0) {
        this.steerAngle += (steerTarget * maxSteer - this.steerAngle) * Math.min(1, steerSpeed * 2.2 * clampedDt);
      } else {
        this.steerAngle += (0 - this.steerAngle) * Math.min(1, 5.2 * clampedDt);
      }

      // Apply puncture pull, fatigue micro-drift & storm wind gust sway
      const speedFactor = Math.min(1, Math.abs(this.speedMs) / 8);
      const windGust = (wState.windStrength || 0) > 0.5 ? Math.sin(this.bouncePhase * 0.25) * 0.018 * wState.windStrength : 0;
      const effectiveSteer = this.steerAngle + ((mods.steerPull || 0) + windGust + (mods.fatigueDrift || 0) * Math.sin(this.bouncePhase * 0.45)) * speedFactor;

      const offRoad = this.surfaceType === 'grass';
      const villageRoad = this.surfaceType === 'village';
      const brokenRoad = !!surfaceInfo.isBrokenRoad;
      const wetFactor = wState.gripFactor || 1.0;

      const rollingDrag = offRoad ? 2.4 : brokenRoad ? 1.35 : villageRoad ? 0.95 : 0.36;
      const aeroDrag = 0.0018 * this.speedMs * Math.abs(this.speedMs);

      let accelForce = 0;
      if (gas > 0 && hasFuel && gearCfg.dir !== 0) {
        const gearCapMs = this.gear === '6'
          ? maxForwardMs
          : Math.min(maxForwardMs, (gearCfg.maxKmh * engineBoost) / 3.6);
        const currentInDir = this.speedMs * gearCfg.dir;
        if (currentInDir < gearCapMs) {
          const rainScale = 1 - (wState.rainIntensity || 0) * 0.1;
          const baseAccel = 6.8 * busSpec.accelPower * engineTorqueBoost * gearCfg.torque * rainScale;
          accelForce = gearCfg.dir * baseAccel * gas;
        }
      }

      this.isBraking = brake > 0;
      let brakeDecel = 0;
      if (brake > 0) {
        brakeDecel += 15.5 * busSpec.brakePower * brakeBoost * wetFactor;
      }
      if (this.handbrake) {
        brakeDecel += 22.0 * brakeBoost * wetFactor;
      }

      this.speedMs += accelForce * clampedDt;

      const totalResist = (rollingDrag + Math.abs(aeroDrag) + brakeDecel) * clampedDt;
      if (this.speedMs > 0) {
        this.speedMs = Math.max(0, this.speedMs - totalResist);
      } else if (this.speedMs < 0) {
        this.speedMs = Math.min(0, this.speedMs + totalResist);
      }
      if (this.handbrake && Math.abs(this.speedMs) < 0.25) {
        this.speedMs = 0;
      }

      if (offRoad && Math.abs(this.speedMs) > 12) {
        this.speedMs *= 1 - 1.5 * clampedDt;
      }
      if (brokenRoad && Math.abs(this.speedMs) > 16) {
        this.speedMs *= 1 - 0.8 * clampedDt;
      }

      const wheelbase = 6.4;
      const grip = (offRoad ? 0.65 : wetFactor) * busSpec.handling * suspBoost;
      const angularVel = (this.speedMs / wheelbase) * Math.tan(effectiveSteer) * Math.min(1.25, grip);
      this.yaw += angularVel * clampedDt;

      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.x += fx * this.speedMs * clampedDt;
      this.z += fz * this.speedMs * clampedDt;

      const targetY = surfaceInfo.elevation || 0;
      this.y += (targetY - this.y) * Math.min(1, 14 * clampedDt);

      const gearMax = Math.max(20, gearCfg.maxKmh);
      const ratioSpeed = gearCfg.dir === 0 ? 0 : Math.min(1, speedKmh / gearMax);
      const powerRpmBonus = this.powerMode && gas > 0 ? 240 : 0;
      const targetRpm = gearCfg.dir === 0
        ? 850 + gas * 2400
        : 850 + ratioSpeed * 2650 + gas * 380 + powerRpmBonus;
      this.rpm += (targetRpm - this.rpm) * Math.min(1, 8 * clampedDt);

      const targetPitch = (accelForce * 0.0045) - (this.isBraking && Math.abs(this.speedMs) > 0.5 ? Math.sign(this.speedMs) * 0.032 : 0);
      const targetRoll = -angularVel * Math.min(1, Math.abs(this.speedMs) / 14) * 0.095 / suspBoost;
      this.suspPitch += (targetPitch - this.suspPitch) * Math.min(1, 7 * clampedDt);
      this.suspRoll += (targetRoll - this.suspRoll) * Math.min(1, 7 * clampedDt);

      this.bouncePhase += Math.abs(this.speedMs) * clampedDt * (offRoad || brokenRoad ? 2.6 : 0.9);
      const bumpAmp = brokenRoad ? 0.09 : offRoad ? 0.065 : surfaceInfo.onSpeedBump ? 0.085 : 0.012;
      const targetBounce = Math.sin(this.bouncePhase * 2.1) * bumpAmp * Math.min(1, Math.abs(this.speedMs) / 6);
      this.suspBounce += (targetBounce - this.suspBounce) * Math.min(1, 12 * clampedDt);

      const distanceMeters = Math.abs(this.speedMs) * clampedDt;
      const fuelBurn = (distanceMeters * 0.0042 + (gas > 0 ? 0.015 * clampedDt : 0)) * fuelEff;

      return {
        distanceMeters,
        fuelBurn,
        speedKmh: Math.round(Math.abs(this.speedMs) * 3.6),
        rpmNormalized: Math.max(0, Math.min(1, (this.rpm - 750) / 3000)),
        throttle: gas
      };
    }

    resolveCollision(otherX, otherZ, minDist, restitution = 0.45) {
      const dx = this.x - otherX;
      const dz = this.z - otherZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist || distSq < 0.0001) return null;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;
      this.x += nx * (overlap + 0.08);
      this.z += nz * (overlap + 0.08);

      const impactSpeed = Math.abs(this.speedMs);
      this.speedMs = -this.speedMs * restitution;
      if (Math.abs(this.speedMs) < 1.2) this.speedMs = 0;

      if (this.hitCooldown <= 0 && impactSpeed > 1.8) {
        this.hitCooldown = 0.55;
        return Math.min(18, impactSpeed * 0.85);
      }
      return 0;
    }
  }

  global.BDBusPhysics = BusPhysics;
})(typeof window !== 'undefined' ? window : globalThis);
