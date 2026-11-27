(function (global) {
  'use strict';

  function createBarrelMesh() {
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10),
      new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.6, metalness: 0.2 })
    );
    barrel.position.y = 0.52;
    g.add(barrel);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.435, 0.435, 0.22, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    band.position.y = 0.52;
    g.add(band);
    return g;
  }

  function createRobberNpc() {
    const g = new THREE.Group();
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.72, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    legs.position.y = 0.36;
    g.add(legs);
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.62, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    torso.position.y = 1.02;
    g.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c4a2d })
    );
    head.position.y = 1.48;
    g.add(head);
    const signalArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.48, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    signalArm.position.set(0.3, 1.28, 0);
    signalArm.rotation.z = -0.65;
    g.add(signalArm);
    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    torch.position.set(0.45, 1.48, 0);
    g.add(torch);
    g.userData.arm = signalArm;
    return g;
  }

  function createAssistPatrolCar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.78, 4.1),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    body.position.y = 0.65;
    g.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.56, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 })
    );
    cabin.position.set(0, 1.24, 0.1);
    g.add(cabin);
    const redBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    redBeacon.position.set(-0.32, 1.6, 0.1);
    const blueBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
    blueBeacon.position.set(0.32, 1.6, 0.1);
    g.add(redBeacon, blueBeacon);
    g.visible = false;
    return { group: g, redBeacon, blueBeacon };
  }

  class HighwayEventsManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.robberyZones = [];
      this.activeEncounter = null;
      this.policeAssistTimer = 0;
      this.patrolAssist = createAssistPatrolCar();
      this.scene.add(this.patrolAssist.group);
      this.buildRobberyZones();
    }

    buildRobberyZones() {
      const specs = [
        { edgeId: 'tangail_bogura', t: 0.22, name: 'Jamuna West Isolated Stretch', altRoute: 'Use Tangail → Mymensingh loop or bypass shoulder' },
        { edgeId: 'cumilla_sylhet', t: 0.56, name: 'Brahmanbaria Night Corridor', altRoute: 'Use Narsingdi–Bhairab Village Road' },
        { edgeId: 'dhaka_khulna', t: 0.74, name: 'Mawa Approach Isolated Strip', altRoute: 'Bypass along outer right shoulder cone gap' }
      ];

      specs.forEach((sp, idx) => {
        const edge = this.world.roadEdges.find((e) => e.id === sp.edgeId);
        if (!edge || !edge.samples.length) return;
        const pt = edge.samples[Math.floor(edge.samples.length * sp.t)];
        const group = new THREE.Group();
        const barrels = [];

        // Place 3 warning barrels across left lane
        [-4.2, -2.5, -0.8].forEach((latOffset) => {
          const b = createBarrelMesh();
          b.position.set(pt.x + pt.rx * latOffset, pt.y, pt.z + pt.rz * latOffset);
          group.add(b);
          barrels.push({
            mesh: b,
            x: b.position.x,
            z: b.position.z,
            active: true
          });
        });

        // Two fictional highway robber figures waving stop signal
        const n1 = createRobberNpc();
        n1.position.set(pt.x - pt.rx * 6.0, pt.y, pt.z - pt.rz * 6.0);
        const n2 = createRobberNpc();
        n2.position.set(pt.x + pt.rx * 5.2, pt.y, pt.z + pt.rz * 5.2);
        group.add(n1, n2);

        // Alternate bypass route chevron marker off to right clear shoulder
        const altSignTex = global.BDTextures.createSignTexture('#1e3a8a', '#fbbf24', '#ffffff', 'বিকল্প পথ', 'ALTERNATE BYPASS ➔');
        const altSign = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 1.4),
          new THREE.MeshBasicMaterial({ map: altSignTex, side: THREE.DoubleSide })
        );
        altSign.position.set(pt.x + pt.rx * 6.5 - pt.tx * 22, pt.y + 2.4, pt.z + pt.rz * 6.5 - pt.tz * 22);
        altSign.rotation.y = Math.atan2(-edge.dir.x, -edge.dir.z);
        group.add(altSign);

        this.scene.add(group);
        this.robberyZones.push({
          id: `robbery_${idx}`,
          name: sp.name,
          altRoute: sp.altRoute,
          x: pt.x,
          z: pt.z,
          tx: pt.tx,
          tz: pt.tz,
          rx: pt.rx,
          rz: pt.rz,
          group,
          barrels,
          npcs: [n1, n2],
          cooldown: 0,
          prompted: false,
          cleared: false,
          escapedMode: false
        });
      });
    }

    resetSession() {
      this.activeEncounter = null;
      this.policeAssistTimer = 0;
      this.patrolAssist.group.visible = false;
      this.robberyZones.forEach((rz) => {
        rz.cooldown = 0;
        rz.prompted = false;
        rz.cleared = false;
        rz.escapedMode = false;
        rz.group.visible = true;
        rz.barrels.forEach((b) => {
          b.active = true;
          b.mesh.visible = true;
        });
      });
    }

    resolveEncounter(action) {
      const rz = this.activeEncounter;
      this.activeEncounter = null;
      if (!rz) return { type: 'none' };

      if (action === 'pay') {
        rz.cleared = true;
        rz.cooldown = 160;
        rz.barrels.forEach((b) => { b.active = false; b.mesh.visible = false; });
        return {
          type: 'paid',
          cost: 800,
          msg: 'Paid ৳ 800 safe passage toll; roadblock barrels cleared.'
        };
      }

      if (action === 'police') {
        rz.cleared = true;
        rz.cooldown = 180;
        rz.barrels.forEach((b) => { b.active = false; b.mesh.visible = false; });
        rz.group.visible = false;
        this.policeAssistTimer = 8.0;
        this.patrolAssist.group.visible = true;
        this.patrolAssist.group.position.set(rz.x + rz.rx * 3.2, 0.05, rz.z + rz.rz * 3.2);
        this.patrolAssist.group.rotation.y = Math.atan2(-rz.tx, -rz.tz);
        return {
          type: 'police',
          reward: 2500,
          msg: '🚓 Highway Police Patrol arrived & cleared the roadblock! +৳ 2,500 Cooperation Bounty!'
        };
      }

      if (action === 'bypass') {
        rz.escapedMode = true;
        rz.cooldown = 140;
        return {
          type: 'bypass',
          reward: 900,
          msg: `Alternate route chosen (${rz.altRoute}). Steer right around the cones for +৳ 900 safe bypass!`
        };
      }

      // 'escape' — player floors it through or around!
      rz.escapedMode = true;
      rz.cooldown = 140;
      return {
        type: 'escape',
        reward: 1200,
        msg: 'Attempted high-speed escape! Avoid the orange barrels to earn +৳ 1,200!'
      };
    }

    update(dt, elapsed, busPhysics, robberyEnabled) {
      const result = {
        warning: null,
        triggerModalZone: null,
        barrelImpact: 0,
        escapeBonus: 0,
        policeBanner: false
      };

      // Update active Police Assistance patrol animation
      if (this.policeAssistTimer > 0) {
        this.policeAssistTimer -= dt;
        const flash = Math.floor(elapsed * 8) % 2 === 0;
        this.patrolAssist.redBeacon.material.color.setHex(flash ? 0xff1e42 : 0x450a0a);
        this.patrolAssist.blueBeacon.material.color.setHex(flash ? 0x1e3a8a : 0x3b82f6);
        result.policeBanner = true;
        if (this.policeAssistTimer <= 0) {
          this.patrolAssist.group.visible = false;
        }
      }

      for (let i = 0; i < this.robberyZones.length; i++) {
        const rz = this.robberyZones[i];
        if (rz.cooldown > 0) {
          rz.cooldown -= dt;
          if (rz.cooldown <= 0) {
            rz.cleared = false;
            rz.prompted = false;
            rz.escapedMode = false;
            rz.group.visible = !!robberyEnabled;
            rz.barrels.forEach((b) => { b.active = true; b.mesh.visible = true; });
          }
        }

        rz.group.visible = !!robberyEnabled && !rz.cleared;
        if (!robberyEnabled || rz.cleared) continue;

        // Animate robber signaling arm
        const wave = Math.sin(elapsed * 5 + i) * 0.45;
        rz.npcs.forEach((n) => {
          if (n.userData.arm) n.userData.arm.rotation.z = -0.65 + wave;
        });

        const dist = Math.hypot(busPhysics.x - rz.x, busPhysics.z - rz.z);
        if (dist < 48 && dist > 16) {
          result.warning = `⚠️ SUSPICIOUS ROADBLOCK AHEAD (${Math.round(dist)}m) — SLOW DOWN OR TAKE BYPASS`;
        }

        // Open interactive decision modal once when entering 24m zone
        if (dist < 24 && !rz.prompted && !rz.escapedMode && !this.activeEncounter) {
          rz.prompted = true;
          this.activeEncounter = rz;
          result.triggerModalZone = rz;
        }

        // Check barrel collisions
        for (let k = 0; k < rz.barrels.length; k++) {
          const b = rz.barrels[k];
          if (!b.active) continue;
          const imp = busPhysics.resolveCollision(b.x, b.z, 2.05, 0.55);
          if (imp && imp > 0) {
            b.active = false;
            b.mesh.visible = false;
            result.barrelImpact = Math.max(result.barrelImpact, Math.min(10, imp * 0.85));
          }
        }

        // Safe escape / bypass completion reward once clear past zone
        if (rz.escapedMode && dist > 38 && result.barrelImpact === 0) {
          rz.cleared = true;
          rz.group.visible = false;
          result.escapeBonus = 1200;
        }
      }

      return result;
    }
  }

  global.BDHighwayEvents = HighwayEventsManager;
})(typeof window !== 'undefined' ? window : globalThis);
