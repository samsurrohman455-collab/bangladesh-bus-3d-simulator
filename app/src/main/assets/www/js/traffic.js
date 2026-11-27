(function (global) {
  'use strict';

  const SHARED = {};

  function ensureShared() {
    if (SHARED.ready) return;
    SHARED.ready = true;
    SHARED.wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 8);
    SHARED.smallWheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 8);
    SHARED.bigWheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 8);
    SHARED.wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    SHARED.rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.5 });
    SHARED.glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.65 });
    SHARED.headLightMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
    SHARED.tailLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    SHARED.darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    SHARED.chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.6 });
  }

  function addWheel(g, x, y, z, geo) {
    const w = new THREE.Mesh(geo, SHARED.wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
  }

  function addLights(g, halfW, y, frontZ, rearZ) {
    const hlGeo = new THREE.BoxGeometry(0.28, 0.14, 0.08);
    const tlGeo = new THREE.BoxGeometry(0.28, 0.14, 0.08);
    [-halfW + 0.24, halfW - 0.24].forEach((lx) => {
      const hl = new THREE.Mesh(hlGeo, SHARED.headLightMat);
      hl.position.set(lx, y, frontZ);
      const tl = new THREE.Mesh(tlGeo, SHARED.tailLightMat);
      tl.position.set(lx, y, rearZ);
      g.add(hl, tl);
    });
  }

  function buildTrafficMesh(kind, variantIdx) {
    ensureShared();
    const g = new THREE.Group();

    if (kind === 'cng') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 0.96, 2.38),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45 })
      );
      body.position.y = 0.72;
      g.add(body);
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.22, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
      );
      bumper.position.set(0, 0.38, -1.16);
      g.add(bumper);
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(1.32, 0.72, 1.92),
        SHARED.darkTrimMat
      );
      canopy.position.set(0, 1.5, 0.14);
      g.add(canopy);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.54, 0.08), SHARED.glassMat);
      ws.position.set(0, 1.38, -0.85);
      g.add(ws);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.08), SHARED.headLightMat);
      hl.position.set(0, 0.72, -1.21);
      g.add(hl);
      addLights(g, 0.62, 0.65, -1.2, 1.2);
      addWheel(g, 0, 0.28, -0.95, SHARED.smallWheelGeo);
      addWheel(g, -0.68, 0.28, 0.78, SHARED.smallWheelGeo);
      addWheel(g, 0.68, 0.28, 0.78, SHARED.smallWheelGeo);
      return { mesh: g, radius: 1.5, baseSpeed: 10.8 };
    }

    if (kind === 'rickshaw') {
      const seatColors = [0xe11d48, 0x059669, 0xd97706, 0x7c3aed];
      const hoodColors = [0x2563eb, 0xdc2626, 0x0d9488, 0xdb2777];
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.16, 0.52, 1.02),
        new THREE.MeshStandardMaterial({ color: seatColors[variantIdx % seatColors.length], roughness: 0.6 })
      );
      seat.position.set(0, 0.72, 0.48);
      g.add(seat);
      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(1.22, 0.74, 1.15),
        new THREE.MeshStandardMaterial({ color: hoodColors[variantIdx % hoodColors.length], roughness: 0.5 })
      );
      hood.position.set(0, 1.38, 0.56);
      g.add(hood);
      const rider = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.85, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b })
      );
      rider.position.set(0, 1.05, -0.55);
      g.add(rider);
      addWheel(g, 0, 0.28, -0.82, SHARED.smallWheelGeo);
      addWheel(g, -0.62, 0.28, 0.55, SHARED.smallWheelGeo);
      addWheel(g, 0.62, 0.28, 0.55, SHARED.smallWheelGeo);
      return { mesh: g, radius: 1.3, baseSpeed: 5.4 };
    }

    if (kind === 'bicycle') {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.58, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x0f766e })
      );
      frame.position.y = 0.55;
      g.add(frame);
      const rider = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.85, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc })
      );
      rider.position.set(0, 1.18, 0.05);
      g.add(rider);
      addWheel(g, 0, 0.28, -0.62, SHARED.smallWheelGeo);
      addWheel(g, 0, 0.28, 0.62, SHARED.smallWheelGeo);
      return { mesh: g, radius: 1.0, baseSpeed: 4.6 };
    }

    if (kind === 'bike') {
      const bikeColors = [0xdc2626, 0x1d4ed8, 0x0f172a, 0x059669];
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.62, 1.72),
        new THREE.MeshStandardMaterial({ color: bikeColors[variantIdx % bikeColors.length], roughness: 0.35 })
      );
      frame.position.y = 0.56;
      g.add(frame);
      const rider = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.84, 0.42),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      rider.position.set(0, 1.18, 0.12);
      g.add(rider);
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 6, 6),
        SHARED.chromeMat
      );
      helmet.position.set(0, 1.72, 0.05);
      g.add(helmet);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), SHARED.headLightMat);
      hl.position.set(0, 0.82, -0.9);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.08), SHARED.tailLightMat);
      tl.position.set(0, 0.78, 0.9);
      g.add(hl, tl);
      addWheel(g, 0, 0.28, -0.68, SHARED.smallWheelGeo);
      addWheel(g, 0, 0.28, 0.68, SHARED.smallWheelGeo);
      return { mesh: g, radius: 1.1, baseSpeed: 14.5 };
    }

    if (kind === 'pickup') {
      const cabColors = [0x1e40af, 0xd97706, 0xf8fafc, 0x047857];
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.38, 1.75),
        new THREE.MeshStandardMaterial({ color: cabColors[variantIdx % cabColors.length], roughness: 0.45 })
      );
      cab.position.set(0, 1.05, -1.2);
      g.add(cab);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.65, 0.1), SHARED.glassMat);
      ws.position.set(0, 1.32, -2.06);
      g.add(ws);
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(1.96, 0.92, 2.55),
        new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.7 })
      );
      bed.position.set(0, 0.9, 0.98);
      g.add(bed);
      addLights(g, 0.94, 0.68, -2.1, 2.28);
      addWheel(g, -0.96, 0.36, -1.3, SHARED.wheelGeo);
      addWheel(g, 0.96, 0.36, -1.3, SHARED.wheelGeo);
      addWheel(g, -0.96, 0.36, 1.35, SHARED.wheelGeo);
      addWheel(g, 0.96, 0.36, 1.35, SHARED.wheelGeo);
      return { mesh: g, radius: 2.3, baseSpeed: 14.8 };
    }

    if (kind === 'truck') {
      const cabColors = [0xf59e0b, 0xdc2626, 0x0284c7, 0x059669];
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(2.32, 2.25, 2.15),
        new THREE.MeshStandardMaterial({ color: cabColors[variantIdx % cabColors.length], roughness: 0.45 })
      );
      cab.position.set(0, 1.48, -2.35);
      g.add(cab);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.82, 0.1), SHARED.glassMat);
      ws.position.set(0, 1.92, -3.42);
      g.add(ws);
      const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(2.44, 2.18, 4.95),
        new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.7 })
      );
      cargo.position.set(0, 1.72, 1.25);
      g.add(cargo);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.48, 0.36, 4.97),
        new THREE.MeshStandardMaterial({ color: 0xe11d48 })
      );
      stripe.position.set(0, 1.48, 1.25);
      g.add(stripe);
      addLights(g, 1.12, 0.82, -3.45, 3.74);
      addWheel(g, -1.16, 0.48, -2.35, SHARED.bigWheelGeo);
      addWheel(g, 1.16, 0.48, -2.35, SHARED.bigWheelGeo);
      addWheel(g, -1.16, 0.48, 0.9, SHARED.bigWheelGeo);
      addWheel(g, 1.16, 0.48, 0.9, SHARED.bigWheelGeo);
      addWheel(g, -1.16, 0.48, 2.45, SHARED.bigWheelGeo);
      addWheel(g, 1.16, 0.48, 2.45, SHARED.bigWheelGeo);
      return { mesh: g, radius: 3.1, baseSpeed: 13.0 };
    }

    if (kind === 'bus') {
      const colors = [0x047857, 0xd9480f, 0x1d4ed8, 0x9f1239, 0x0f766e];
      const col = colors[variantIdx % colors.length];
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.48, 2.68, 9.8),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.38 })
      );
      body.position.y = 1.78;
      g.add(body);
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(2.52, 1.05, 8.8),
        SHARED.glassMat
      );
      win.position.y = 2.32;
      g.add(win);
      const acPod = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.3, 3.2),
        SHARED.chromeMat
      );
      acPod.position.set(0, 3.25, -0.5);
      g.add(acPod);
      addLights(g, 1.18, 0.85, -4.92, 4.92);
      addWheel(g, -1.2, 0.48, -2.9, SHARED.bigWheelGeo);
      addWheel(g, 1.2, 0.48, -2.9, SHARED.bigWheelGeo);
      addWheel(g, -1.2, 0.48, 2.8, SHARED.bigWheelGeo);
      addWheel(g, 1.2, 0.48, 2.8, SHARED.bigWheelGeo);
      return { mesh: g, radius: 4.1, baseSpeed: 17.8 };
    }

    // Car (Sedan or Microbus / SUV)
    const carColors = [0xf8fafc, 0x334155, 0x94a3b8, 0x1e40af, 0xb91c1c, 0x0f766e, 0x18181b];
    const isSuv = variantIdx % 3 === 1;
    const carCol = carColors[variantIdx % carColors.length];
    const bodyMat = new THREE.MeshStandardMaterial({ color: carCol, roughness: 0.32, metalness: 0.15 });

    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.88, 0.78, isSuv ? 4.45 : 4.25),
      bodyMat
    );
    carBody.position.y = 0.68;
    g.add(carBody);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, isSuv ? 0.78 : 0.68, isSuv ? 3.1 : 2.35),
      bodyMat
    );
    cabin.position.set(0, isSuv ? 1.44 : 1.38, isSuv ? 0.3 : 0.15);
    g.add(cabin);

    const glassBand = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, isSuv ? 0.56 : 0.5, isSuv ? 2.85 : 2.15),
      SHARED.glassMat
    );
    glassBand.position.set(0, isSuv ? 1.44 : 1.38, isSuv ? 0.3 : 0.15);
    g.add(glassBand);

    addLights(g, 0.9, 0.68, isSuv ? -2.24 : -2.14, isSuv ? 2.24 : 2.14);
    addWheel(g, -0.94, 0.36, -1.32, SHARED.wheelGeo);
    addWheel(g, 0.94, 0.36, -1.32, SHARED.wheelGeo);
    addWheel(g, -0.94, 0.36, 1.32, SHARED.wheelGeo);
    addWheel(g, 0.94, 0.36, 1.32, SHARED.wheelGeo);

    return { mesh: g, radius: 2.3, baseSpeed: isSuv ? 16.5 : 17.6 };
  }

  class TrafficManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.vehicles = [];
      this.activeCount = 20;
      this.poolTypes = [
        'car', 'cng', 'car', 'pickup', 'bike', 'bus', 'car', 'truck',
        'car', 'cng', 'car', 'bike', 'pickup', 'bus', 'car', 'truck',
        'car', 'rickshaw', 'cng', 'car'
      ];
      this.nodeEdgesMap = new Map();
      this.buildAdjacency();
      this.spawnAll(40);
    }

    buildAdjacency() {
      const edges = this.world.roadEdges;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (!this.nodeEdgesMap.has(e.from)) this.nodeEdgesMap.set(e.from, []);
        if (!this.nodeEdgesMap.has(e.to)) this.nodeEdgesMap.set(e.to, []);
        this.nodeEdgesMap.get(e.from).push(i);
        this.nodeEdgesMap.get(e.to).push(i);
      }
    }

    getEdgeDistSqToPoint(edge, px, pz) {
      const samples = edge.samples;
      if (!samples || !samples.length) return Infinity;
      let best = Infinity;
      const step = Math.max(1, Math.floor(samples.length / 8));
      for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        const dSq = (s.x - px) ** 2 + (s.z - pz) ** 2;
        if (dSq < best) best = dSq;
      }
      const last = samples[samples.length - 1];
      const lastD = (last.x - px) ** 2 + (last.z - pz) ** 2;
      return Math.min(best, lastD);
    }

    findNearestEdges(px, pz, maxCount) {
      const edges = this.world.roadEdges;
      const scored = [];
      for (let i = 0; i < edges.length; i++) {
        scored.push({ idx: i, dSq: this.getEdgeDistSqToPoint(edges[i], px, pz) });
      }
      scored.sort((a, b) => a.dSq - b.dSq);
      return scored.slice(0, Math.min(maxCount, scored.length));
    }

    laneForVehicle(kind, dir, edge) {
      const isSlow = kind === 'rickshaw' || kind === 'bicycle';
      const isVillage = edge && edge.type === 'village';
      // Keep slow rickshaws/bicycles far left on the road shoulder so highway cars pass freely
      const base = isSlow ? (isVillage ? 3.5 : 5.4) : (isVillage ? 2.2 : 3.15);
      return dir > 0 ? -base : base;
    }

    isSpaceClearOnEdge(edgeIdx, dir, t, minMeters, excludeVehicle) {
      const edge = this.world.roadEdges[edgeIdx];
      if (!edge) return true;
      for (let i = 0; i < this.activeCount && i < this.vehicles.length; i++) {
        const other = this.vehicles[i];
        if (other === excludeVehicle || other.edgeIndex !== edgeIdx || other.dir !== dir) continue;
        if (Math.abs(other.t - t) * edge.dist < minMeters) return false;
      }
      return true;
    }

    spawnAll(maxCount) {
      const edges = this.world.roadEdges;
      if (!edges || !edges.length) return;
      for (let i = 0; i < maxCount; i++) {
        const kind = this.poolTypes[i % this.poolTypes.length];
        const built = buildTrafficMesh(kind, i);
        const edgeIdx = i % edges.length;
        const edge = edges[edgeIdx];
        const dir = i % 2 === 0 ? 1 : -1;
        const baseLane = this.laneForVehicle(kind, dir, edge);

        this.scene.add(built.mesh);
        this.vehicles.push({
          kind,
          mesh: built.mesh,
          radius: built.radius,
          baseSpeed: built.baseSpeed,
          currentSpeed: built.baseSpeed,
          edgeIndex: edgeIdx,
          dir,
          baseLane,
          laneOffset: baseLane,
          overtakeTimer: 0,
          t: (0.08 + (i * 0.13)) % 0.86,
          x: edge.p1.x,
          y: 0,
          z: edge.p1.z
        });
      }
      this.populateNear(0, 0);
    }

    populateNear(px, pz) {
      const edges = this.world.roadEdges;
      if (!edges || !edges.length) return;
      const nearest = this.findNearestEdges(px, pz, 6);
      if (!nearest.length) return;

      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        // Spread traffic across nearest 4–6 roads so no single road gets congested
        const edgeRank = i % Math.min(4, nearest.length);
        const chosenEdgeIdx = nearest[edgeRank].idx;
        const edge = edges[chosenEdgeIdx];

        v.edgeIndex = chosenEdgeIdx;
        v.dir = i % 2 === 0 ? 1 : -1;
        v.baseLane = this.laneForVehicle(v.kind, v.dir, edge);
        v.laneOffset = v.baseLane;
        v.currentSpeed = v.baseSpeed;
        v.overtakeTimer = 0;
        v.stuckTimer = 0;

        // Evenly distribute along road while staying > 55 units from player and > 42 units from other AI
        let chosenT = (0.06 + ((i * 0.217) % 0.88));
        let bestPt = this.sampleEdge(edge, chosenT);
        for (let attempt = 0; attempt < 12; attempt++) {
          const candT = (0.06 + ((i * 0.13 + attempt * 0.09) % 0.88));
          const pt = this.sampleEdge(edge, candT);
          const dSq = (pt.x - px) ** 2 + (pt.z - pz) ** 2;
          if (dSq > 55 * 55 && dSq < 560 * 560 && this.isSpaceClearOnEdge(chosenEdgeIdx, v.dir, candT, 45, v)) {
            chosenT = candT;
            bestPt = pt;
            break;
          }
        }
        v.t = chosenT;
        v.x = bestPt.x + bestPt.rx * v.laneOffset;
        v.y = bestPt.y;
        v.z = bestPt.z + bestPt.rz * v.laneOffset;
        v.mesh.position.set(v.x, v.y, v.z);
        const mx = v.dir > 0 ? bestPt.tx : -bestPt.tx;
        const mz = v.dir > 0 ? bestPt.tz : -bestPt.tz;
        v.mesh.rotation.y = Math.atan2(-mx, -mz);
        const ndSq = (v.x - px) ** 2 + (v.z - pz) ** 2;
        v.mesh.visible = i < this.activeCount && ndSq < 600 * 600;
      }
    }

    setDensity(count) {
      this.activeCount = Math.min(count, this.vehicles.length);
      for (let i = 0; i < this.vehicles.length; i++) {
        if (i >= this.activeCount) {
          this.vehicles[i].mesh.visible = false;
        }
      }
    }

    sampleEdge(edge, t) {
      const clampedT = Math.max(0, Math.min(1, t));
      const idxF = clampedT * (edge.samples.length - 1);
      const i0 = Math.floor(idxF);
      const i1 = Math.min(edge.samples.length - 1, i0 + 1);
      const frac = idxF - i0;
      const s0 = edge.samples[i0];
      const s1 = edge.samples[i1];
      return {
        x: s0.x + (s1.x - s0.x) * frac,
        y: s0.y + (s1.y - s0.y) * frac,
        z: s0.z + (s1.z - s0.z) * frac,
        tx: s0.tx,
        tz: s0.tz,
        rx: s0.rx,
        rz: s0.rz
      };
    }

    relocateVehicleNear(v, idx, px, pz, nearestEdges) {
      const edges = this.world.roadEdges;
      if (!nearestEdges.length) return;
      const pickSlot = (idx + Math.floor(Math.random() * 4)) % Math.min(5, nearestEdges.length);
      const edgeIdx = nearestEdges[pickSlot].idx;
      const edge = edges[edgeIdx];

      for (let attempt = 0; attempt < 10; attempt++) {
        const candT = 0.06 + Math.random() * 0.88;
        const pt = this.sampleEdge(edge, candT);
        const dSq = (pt.x - px) ** 2 + (pt.z - pz) ** 2;
        const candDir = Math.random() < 0.5 ? 1 : -1;
        if (dSq > 125 * 125 && dSq < 560 * 560 && this.isSpaceClearOnEdge(edgeIdx, candDir, candT, 45, v)) {
          v.edgeIndex = edgeIdx;
          v.dir = candDir;
          v.baseLane = this.laneForVehicle(v.kind, v.dir, edge);
          v.laneOffset = v.baseLane;
          v.t = candT;
          v.currentSpeed = v.baseSpeed;
          v.stuckTimer = 0;
          v.x = pt.x + pt.rx * v.laneOffset;
          v.y = pt.y;
          v.z = pt.z + pt.rz * v.laneOffset;
          v.mesh.position.set(v.x, v.y, v.z);
          return;
        }
      }
    }

    update(dt, playerBus) {
      const clampedDt = Math.min(dt, 0.05);
      const edges = this.world.roadEdges;
      if (!edges || !edges.length) return;

      const refX = playerBus ? playerBus.x : 0;
      const refZ = playerBus ? playerBus.z : 0;
      let nearestEdges = null;

      for (let i = 0; i < this.activeCount && i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        let edge = edges[v.edgeIndex];
        let targetSpeed = v.baseSpeed;
        let blockedBySlow = false;
        let stoppedAtRed = false;

        // 1. Check Red Traffic Lights near vehicle
        const tl = this.world.getTrafficLightNear(v.x, v.z);
        if (tl && tl.state === 'red') {
          targetSpeed = 0;
          stoppedAtRed = true;
        }

        // 2. Check Vehicle Ahead in SAME lane (smooth spacing + proactive overtaking)
        for (let j = 0; j < this.activeCount; j++) {
          if (i === j) continue;
          const other = this.vehicles[j];
          if (other.edgeIndex !== v.edgeIndex || other.dir !== v.dir) continue;
          if (Math.abs(other.laneOffset - v.laneOffset) > 1.85) continue;
          const dT = (other.t - v.t) * v.dir;
          const distM = dT * edge.dist;
          if (distM > 0.5 && distM < 22) {
            if (v.baseSpeed > other.baseSpeed + 1.2 && !edge.bridge && v.overtakeTimer <= 0 && distM > 4.5) {
              v.overtakeTimer = 2.8;
            } else {
              targetSpeed = Math.min(targetSpeed, Math.max(2.5, other.currentSpeed * 0.96));
              if (distM < 4.5) targetSpeed = 0;
              blockedBySlow = true;
            }
          }
        }

        // Smooth lane offset for overtaking
        if (v.overtakeTimer > 0) {
          v.overtakeTimer -= clampedDt;
          const overtakeLane = v.dir > 0 ? -0.9 : 0.9;
          v.laneOffset += (overtakeLane - v.laneOffset) * Math.min(1, 3.8 * clampedDt);
        } else {
          v.laneOffset += (v.baseLane - v.laneOffset) * Math.min(1, 3.2 * clampedDt);
        }

        // 3. Yield ONLY if player bus is actually ahead in the SAME lane (never block oncoming traffic)
        const curPt = this.sampleEdge(edge, v.t);
        if (playerBus && !blockedBySlow) {
          const dx = playerBus.x - v.x;
          const dz = playerBus.z - v.z;
          const fwdX = v.dir > 0 ? curPt.tx : -curPt.tx;
          const fwdZ = v.dir > 0 ? curPt.tz : -curPt.tz;
          const along = dx * fwdX + dz * fwdZ;
          const lat = Math.abs(dx * curPt.rx + dz * curPt.rz);
          if (along > 2 && along < 15 && lat < 3.2) {
            targetSpeed = Math.min(targetSpeed, Math.max(2.0, (playerBus.speedMs || 0) * 0.9));
          }
        }

        // Anti-jam safeguard: if stuck for > 2.5s (not at red light), overtake around blocker
        if (!stoppedAtRed && v.currentSpeed < 1.5 && targetSpeed < 2.0) {
          v.stuckTimer = (v.stuckTimer || 0) + clampedDt;
          if (v.stuckTimer > 2.5) {
            v.overtakeTimer = 3.0;
            targetSpeed = v.baseSpeed * 0.75;
            v.stuckTimer = 0;
          }
        } else {
          v.stuckTimer = 0;
        }

        v.currentSpeed += (targetSpeed - v.currentSpeed) * Math.min(1, 4.0 * clampedDt);
        v.t += (v.dir * v.currentSpeed * clampedDt) / edge.dist;

        if (v.t >= 0.96 || v.t <= 0.04) {
          const nodeId = v.t >= 0.96 ? edge.to : edge.from;
          const conn = this.nodeEdgesMap.get(nodeId) || [];
          const others = conn.filter((idx) => idx !== v.edgeIndex);
          if (others.length > 0 && Math.random() < 0.65) {
            const nextEdgeIdx = others[Math.floor(Math.random() * others.length)];
            const nextEdge = edges[nextEdgeIdx];
            v.edgeIndex = nextEdgeIdx;
            if (nextEdge.from === nodeId) {
              v.dir = 1;
              v.t = 0.05;
            } else {
              v.dir = -1;
              v.t = 0.95;
            }
            edge = nextEdge;
            v.baseLane = this.laneForVehicle(v.kind, v.dir, edge);
            v.laneOffset = v.baseLane;
          } else {
            v.dir *= -1;
            v.baseLane = this.laneForVehicle(v.kind, v.dir, edge);
            v.laneOffset = v.baseLane;
            v.t = Math.max(0.05, Math.min(0.95, v.t));
          }
        }

        const pt = this.sampleEdge(edge, v.t);
        v.x = pt.x + pt.rx * v.laneOffset;
        v.y = pt.y;
        v.z = pt.z + pt.rz * v.laneOffset;
        v.mesh.position.set(v.x, v.y, v.z);

        // Keep all active vehicles inside a lively 650-unit bubble around player
        if (playerBus) {
          const pdx = v.x - refX;
          const pdz = v.z - refZ;
          const dSq = pdx * pdx + pdz * pdz;
          if (dSq > 660 * 660) {
            if (!nearestEdges) {
              nearestEdges = this.findNearestEdges(refX, refZ, 5);
            }
            this.relocateVehicleNear(v, i, refX, refZ, nearestEdges);
          }
          const ndx = v.x - refX;
          const ndz = v.z - refZ;
          v.mesh.visible = ndx * ndx + ndz * ndz < 600 * 600;
        } else {
          const ndx = v.x - refX;
          const ndz = v.z - refZ;
          v.mesh.visible = ndx * ndx + ndz * ndz < 600 * 600;
        }

        const activeEdge = edges[v.edgeIndex];
        const activePt = activeEdge === edge ? pt : this.sampleEdge(activeEdge, v.t);
        const mx = v.dir > 0 ? activePt.tx : -activePt.tx;
        const mz = v.dir > 0 ? activePt.tz : -activePt.tz;
        v.mesh.rotation.y = Math.atan2(-mx, -mz);
      }
    }

    checkPlayerCollisions(busPhysics) {
      let maxImpact = 0;
      for (let i = 0; i < this.activeCount && i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        if (!v.mesh.visible) continue;
        const impact = busPhysics.resolveCollision(v.x, v.z, v.radius + 1.85, 0.42);
        if (impact && impact > maxImpact) {
          maxImpact = impact;
          v.currentSpeed = 0;
        }
      }
      return maxImpact;
    }

    getNearbyDots(px, pz, radius) {
      const rSq = radius * radius;
      const dots = [];
      for (let i = 0; i < this.activeCount && i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        const dx = v.x - px;
        const dz = v.z - pz;
        if (dx * dx + dz * dz < rSq) {
          dots.push({ x: v.x, z: v.z, kind: v.kind });
        }
      }
      return dots;
    }
  }

  global.BDTrafficManager = TrafficManager;
})(typeof window !== 'undefined' ? window : globalThis);
