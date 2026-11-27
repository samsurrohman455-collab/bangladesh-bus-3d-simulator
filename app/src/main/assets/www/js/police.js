(function (global) {
  'use strict';

  function createTrafficOfficerMesh() {
    const g = new THREE.Group();
    const trousers = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.72, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    trousers.position.y = 0.36;
    g.add(trousers);

    // White Bangladeshi Traffic Police shirt + reflective vest
    const shirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.65, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc })
    );
    shirt.position.y = 1.02;
    g.add(shirt);

    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.38, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x84cc16 })
    );
    vest.position.y = 0.98;
    g.add(vest);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8d5524 })
    );
    head.position.y = 1.52;
    g.add(head);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a })
    );
    cap.position.y = 1.68;
    g.add(cap);

    const signTex = global.BDTextures.createSignTexture('#1e3a8a', '#ffffff', '#fbbf24', 'পুলিশ চেকপোস্ট', 'SPEED LIMIT 60');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(1.8, 2.8, 0);
    g.add(sign);

    return g;
  }

  function createPatrolCarMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.95, 4.4),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
    );
    body.position.y = 0.72;
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.98, 0.3, 4.42),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
    );
    stripe.position.y = 0.78;
    g.add(stripe);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.75, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    cabin.position.set(0, 1.48, 0.1);
    g.add(cabin);

    const redBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    redBar.position.set(-0.32, 1.94, 0.1);
    const blueBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    );
    blueBar.position.set(0.32, 1.94, 0.1);
    g.add(redBar, blueBar);

    return { mesh: g, redBar, blueBar };
  }

  class PoliceManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.checkpoints = [];
      this.patrolCars = [];
      this.finesTotal = 0;
      this.fineCooldown = 0;
      this.redLightCooldown = 0;
      this.overtakeCooldown = 0;

      this.buildCheckpoints();
      this.buildPatrols();
    }

    buildCheckpoints() {
      // Station traffic police checkpoints across N1–N8 national corridors
      const targetEdgeIds = [
        'dhaka_gazipur', 'tangail_bogura', 'dhaka_cumilla', 'dhaka_khulna',
        'cumilla_chittagong', 'bogura_gaibandha', 'habiganj_moulvibazar', 'jashore_khulna',
        'madaripur_barishal'
      ];
      targetEdgeIds.forEach((eid) => {
        const edge = this.world.roadEdges.find((e) => e.id === eid);
        if (!edge) return;
        const pt = edge.samples[Math.floor(edge.samples.length * 0.78)];
        const yaw = Math.atan2(-pt.tx, -pt.tz);
        const officer = createTrafficOfficerMesh();
        officer.position.set(pt.x - pt.rx * (edge.halfW + 1.8), pt.y, pt.z - pt.rz * (edge.halfW + 1.8));
        officer.rotation.y = yaw;
        this.scene.add(officer);

        this.checkpoints.push({
          x: pt.x,
          z: pt.z,
          speedLimit: 60,
          radius: 42
        });
      });
    }

    buildPatrols() {
      const patrolEdgeIds = [
        'dhaka_gazipur', 'cumilla_chittagong', 'sirajganj_bogura',
        'sayedabad_mawa', 'habiganj_moulvibazar', 'jashore_khulna'
      ];
      patrolEdgeIds.forEach((eid, idx) => {
        const edge = this.world.roadEdges.find((e) => e.id === eid);
        if (!edge) return;
        const car = createPatrolCarMesh();
        this.scene.add(car.mesh);
        this.patrolCars.push({
          ...car,
          edge,
          t: 0.25 + idx * 0.12,
          dir: idx % 2 === 0 ? 1 : -1,
          x: edge.p1.x,
          z: edge.p1.z
        });
      });
    }

    resetSession() {
      this.finesTotal = 0;
      this.fineCooldown = 0;
      this.redLightCooldown = 0;
      this.overtakeCooldown = 0;
    }

    update(dt, elapsed, busPhysics, surfaceInfo, sound) {
      const clampedDt = Math.min(dt, 0.05);
      if (this.fineCooldown > 0) this.fineCooldown -= clampedDt;
      if (this.redLightCooldown > 0) this.redLightCooldown -= clampedDt;
      if (this.overtakeCooldown > 0) this.overtakeCooldown -= clampedDt;

      const flash = Math.floor(elapsed * 6) % 2 === 0;

      // Update highway patrol cars
      for (let i = 0; i < this.patrolCars.length; i++) {
        const pc = this.patrolCars[i];
        pc.t += (pc.dir * 16.5 * clampedDt) / pc.edge.dist;
        if (pc.t >= 0.94 || pc.t <= 0.06) {
          pc.dir *= -1;
        }
        const idx = Math.max(0, Math.min(pc.edge.samples.length - 1, Math.floor(pc.t * (pc.edge.samples.length - 1))));
        const s = pc.edge.samples[idx];
        const laneOff = pc.dir > 0 ? -3.4 : 3.4;
        pc.x = s.x + s.rx * laneOff;
        pc.z = s.z + s.rz * laneOff;
        pc.mesh.position.set(pc.x, s.y, pc.z);
        const mx = pc.dir > 0 ? s.tx : -s.tx;
        const mz = pc.dir > 0 ? s.tz : -s.tz;
        pc.mesh.rotation.y = Math.atan2(-mx, -mz);

        pc.redBar.material.color.setHex(flash ? 0xff1e38 : 0x450a0a);
        pc.blueBar.material.color.setHex(flash ? 0x172554 : 0x3b82f6);
      }

      const speedKmh = Math.abs(busPhysics.speedMs) * 3.6;
      let warning = '';
      let fineIssued = null;

      // 1. Speed Check near Police Checkpoints or Patrol Cars
      let activeSpeedLimit = surfaceInfo.speedLimit || 80;
      let nearPolice = false;

      for (let i = 0; i < this.checkpoints.length; i++) {
        const cp = this.checkpoints[i];
        const dx = busPhysics.x - cp.x;
        const dz = busPhysics.z - cp.z;
        if (dx * dx + dz * dz < cp.radius * cp.radius) {
          nearPolice = true;
          activeSpeedLimit = Math.min(activeSpeedLimit, cp.speedLimit);
          break;
        }
      }

      for (let i = 0; i < this.patrolCars.length; i++) {
        const pc = this.patrolCars[i];
        const dx = busPhysics.x - pc.x;
        const dz = busPhysics.z - pc.z;
        if (dx * dx + dz * dz < 48 * 48) {
          nearPolice = true;
          break;
        }
      }

      if (nearPolice && speedKmh > activeSpeedLimit + 8) {
        warning = `👮 POLICE SPEED CHECK! Limit ${activeSpeedLimit} km/h`;
        if (speedKmh > activeSpeedLimit + 18 && this.fineCooldown <= 0) {
          this.fineCooldown = 10.0;
          this.finesTotal += 500;
          fineIssued = { reason: 'Speeding Violation', amount: 500 };
        }
      }

      // 2. Red Traffic Signal Violation
      const tl = this.world.getTrafficLightNear(busPhysics.x, busPhysics.z);
      if (tl && tl.state === 'red') {
        const dx = busPhysics.x - tl.x;
        const dz = busPhysics.z - tl.z;
        if (dx * dx + dz * dz < 42 && speedKmh > 18 && this.redLightCooldown <= 0) {
          this.redLightCooldown = 9.0;
          this.finesTotal += 400;
          fineIssued = { reason: 'Red Signal Violation', amount: 400 };
        } else if (speedKmh > 12) {
          warning = warning || '🚦 RED SIGNAL — STOP TO AVOID POLICE FINE!';
        }
      }

      // 3. Illegal Overtaking Detection on Bridges & Checkpoints
      if ((surfaceInfo.isBridge || nearPolice) && surfaceInfo.surface === 'asphalt' && speedKmh > 16) {
        // Alignment check: if moving forward with road tangent but on right-hand side (> +1.6m)
        const fx = -Math.sin(busPhysics.yaw);
        const fz = -Math.cos(busPhysics.yaw);
        const dot = fx * surfaceInfo.nearestSample.tx + fz * surfaceInfo.nearestSample.tz;
        const wrongLane = (dot > 0.5 && surfaceInfo.lateralOffset > 1.7) || (dot < -0.5 && surfaceInfo.lateralOffset < -1.7);
        if (wrongLane) {
          warning = '⚠️ NO OVERTAKING ZONE — RETURN TO LEFT LANE!';
          if (this.overtakeCooldown <= 0) {
            this.overtakeCooldown = 9.0;
            this.finesTotal += 350;
            fineIssued = { reason: 'Illegal Overtaking', amount: 350 };
          }
        }
      }

      if (fineIssued) {
        sound.playTone(880, 0.14, 'sawtooth', 0.22);
        setTimeout(() => sound.playTone(660, 0.18, 'sawtooth', 0.22), 140);
      }

      return {
        nearPolice,
        activeSpeedLimit,
        warning,
        fineIssued,
        finesTotal: this.finesTotal
      };
    }
  }

  global.BDPoliceManager = PoliceManager;
})(typeof window !== 'undefined' ? window : globalThis);
