(function (global) {
  'use strict';

  const { BANGLADESH_LOCATIONS, ROAD_NETWORK_EDGES } = global.BDGameConfig;
  const Geo = global.BDGeoData || {};

  function computeElevationAtWorld(x, z, isBridge, t, bridgeHeight) {
    let baseElev = 0.04;
    if (Geo.worldToLatLon && Geo.getElevationAtLatLon) {
      const { lat, lon } = Geo.worldToLatLon(x, z);
      // Keep roads gently undulating with real DEM while keeping intersections smooth
      baseElev = 0.04 + Geo.getElevationAtLatLon(lat, lon) * 0.25;
    }
    if (isBridge) {
      const dMid = Math.abs(t - 0.5);
      if (dMid < 0.24) {
        const factor = Math.cos((dMid / 0.24) * (Math.PI / 2));
        baseElev += factor * (bridgeHeight || 5.4);
      }
    }
    return baseElev;
  }

  function buildRoadSegmentMesh(p1, p2, waypoints, halfWidth, mat, bridgeName, isFerry) {
    const rawPts = [
      new THREE.Vector3(p1.x, 0, p1.z),
      ...(Array.isArray(waypoints) ? waypoints.map((w) => new THREE.Vector3(w.x, 0, w.z)) : []),
      new THREE.Vector3(p2.x, 0, p2.z)
    ];

    // Total polyline distance
    let totalDist = 0;
    for (let i = 1; i < rawPts.length; i++) {
      totalDist += rawPts[i - 1].distanceTo(rawPts[i]);
    }
    totalDist = Math.max(20, totalDist);

    const curve = rawPts.length >= 3
      ? new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.35)
      : new THREE.LineCurve3(rawPts[0], rawPts[1]);

    // Step resolution balances smooth real curves & low vertex budget on Android
    const segs = Math.max(14, Math.min(96, Math.round(totalDist / 16)));
    const spacedPts = curve.getSpacedPoints(segs);

    const positions = [];
    const uvs = [];
    const indices = [];
    const samples = [];

    const isPadma = bridgeName && bridgeName.indexOf('Padma') >= 0;
    const isJamuna = bridgeName && (bridgeName.indexOf('Jamuna') >= 0 || bridgeName.indexOf('যমুনা') >= 0);
    const bridgeH = isPadma ? 7.5 : isJamuna ? 7.2 : isFerry ? 0.45 : 5.4;

    for (let i = 0; i < spacedPts.length; i++) {
      const t = i / (spacedPts.length - 1);
      const pt = spacedPts[i];
      const prevPt = spacedPts[Math.max(0, i - 1)];
      const nextPt = spacedPts[Math.min(spacedPts.length - 1, i + 1)];

      const txRaw = nextPt.x - prevPt.x;
      const tzRaw = nextPt.z - prevPt.z;
      const tLen = Math.max(0.001, Math.hypot(txRaw, tzRaw));
      const tx = txRaw / tLen;
      const tz = tzRaw / tLen;
      const rx = -tz;
      const rz = tx;

      const elev = computeElevationAtWorld(pt.x, pt.z, !!bridgeName && !isFerry, t, bridgeH);
      samples.push({ x: pt.x, y: elev, z: pt.z, tx, tz, rx, rz, t });

      positions.push(pt.x - rx * halfWidth, elev, pt.z - rz * halfWidth);
      positions.push(pt.x + rx * halfWidth, elev, pt.z + rz * halfWidth);
      uvs.push(0, (t * totalDist) / 14);
      uvs.push(1, (t * totalDist) / 14);

      if (i < spacedPts.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const overallDir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z).normalize();
    const overallRight = new THREE.Vector3(-overallDir.z, 0, overallDir.x).normalize();

    const roadMesh = new THREE.Mesh(geo, mat);

    // Raised earthen/grassy road embankment (রাস্তার পাড় / বাঁধ) so roads blend naturally into fields
    if (!bridgeName && !isFerry) {
      const embPos = [];
      const embIdx = [];
      const skirtOut = halfWidth + 2.8;
      for (let i = 0; i < spacedPts.length; i++) {
        const pt = spacedPts[i];
        const s = samples[i];
        const yTop = s.y - 0.015;
        const yBot = s.y - 0.58;
        embPos.push(pt.x - s.rx * skirtOut, yBot, pt.z - s.rz * skirtOut);
        embPos.push(pt.x - s.rx * halfWidth, yTop, pt.z - s.rz * halfWidth);
        embPos.push(pt.x + s.rx * halfWidth, yTop, pt.z + s.rz * halfWidth);
        embPos.push(pt.x + s.rx * skirtOut, yBot, pt.z + s.rz * skirtOut);
        if (i < spacedPts.length - 1) {
          const b = i * 4;
          embIdx.push(b, b + 1, b + 4, b + 1, b + 5, b + 4);
          embIdx.push(b + 2, b + 3, b + 6, b + 3, b + 7, b + 6);
        }
      }
      const embGeo = new THREE.BufferGeometry();
      embGeo.setAttribute('position', new THREE.Float32BufferAttribute(embPos, 3));
      embGeo.setIndex(embIdx);
      embGeo.computeVertexNormals();
      const embMat = getBuildingPalette().embankmentMat;
      const embMesh = new THREE.Mesh(embGeo, embMat);
      embMesh.receiveShadow = true;
      roadMesh.add(embMesh);
    }

    return { mesh: roadMesh, samples, dist: totalDist, dir: overallDir, right: overallRight };
  }

  function buildRiverRibbonMesh(pointsWorld, widthWorld, mat) {
    if (!pointsWorld || pointsWorld.length < 2) return null;
    const vecs = pointsWorld.map((p) => new THREE.Vector3(p.x, 0, p.z));
    const curve = vecs.length >= 3
      ? new THREE.CatmullRomCurve3(vecs, false, 'centripetal', 0.4)
      : new THREE.LineCurve3(vecs[0], vecs[1]);
    const segs = Math.max(18, vecs.length * 8);
    const pts = curve.getSpacedPoints(segs);

    const positions = [];
    const uvs = [];
    const indices = [];
    const halfW = widthWorld * 0.5;
    let accum = 0;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) accum += p.distanceTo(pts[i - 1]);
      const pPrev = pts[Math.max(0, i - 1)];
      const pNext = pts[Math.min(pts.length - 1, i + 1)];
      const dx = pNext.x - pPrev.x;
      const dz = pNext.z - pPrev.z;
      const len = Math.max(0.001, Math.hypot(dx, dz));
      const rx = -dz / len;
      const rz = dx / len;

      positions.push(p.x - rx * halfW, -0.045, p.z - rz * halfW);
      positions.push(p.x + rx * halfW, -0.045, p.z + rz * halfW);
      uvs.push(0, accum / 90);
      uvs.push(1, accum / 90);
      if (i < pts.length - 1) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { mesh: new THREE.Mesh(geo, mat), points: pts };
  }

  const TREE_SHARED = {};

  function getTreeShared() {
    if (TREE_SHARED.ready) return TREE_SHARED;
    TREE_SHARED.ready = true;
    TREE_SHARED.trunkDarkMat = new THREE.MeshStandardMaterial({ color: 0x57412d, roughness: 0.92 });
    TREE_SHARED.palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 0.9 });
    TREE_SHARED.bambooMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.72 });
    TREE_SHARED.bananaStemMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 });
    TREE_SHARED.leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.86 });
    TREE_SHARED.leafMidMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.84 });
    TREE_SHARED.leafBrightMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    TREE_SHARED.bananaLeafMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.74 });
    TREE_SHARED.flameMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.78 });
    TREE_SHARED.flameRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.78 });
    TREE_SHARED.coconutMat = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.7 });

    TREE_SHARED.canopyGeo = new THREE.DodecahedronGeometry(1, 0);
    TREE_SHARED.coconutGeo = new THREE.SphereGeometry(0.18, 6, 5);
    TREE_SHARED.palmSegGeo = new THREE.CylinderGeometry(0.18, 0.24, 2.7, 6);
    TREE_SHARED.frondGeo = new THREE.BoxGeometry(0.36, 0.06, 2.5);
    TREE_SHARED.banyanTrunkGeo = new THREE.CylinderGeometry(0.26, 0.48, 3.6, 6);
    TREE_SHARED.bambooCulmGeo = new THREE.CylinderGeometry(0.05, 0.075, 5.4, 5);
    return TREE_SHARED;
  }

  function createTree(type) {
    const s = getTreeShared();
    const g = new THREE.Group();

    if (type === 'palm') {
      // Gently curved Bangladeshi coconut/palmyra palm (নারকেল/তাল গাছ)
      for (let seg = 0; seg < 3; seg++) {
        const tSeg = new THREE.Mesh(s.palmSegGeo, s.palmTrunkMat);
        tSeg.position.set(seg * 0.16, 1.3 + seg * 2.5, seg * 0.08);
        tSeg.rotation.z = -0.06 * (seg + 1);
        tSeg.scale.setScalar(1 - seg * 0.12);
        g.add(tSeg);
      }
      const cx = 0.42;
      const cy = 7.6;
      const cz = 0.2;
      for (let c = 0; c < 3; c++) {
        const nut = new THREE.Mesh(s.coconutGeo, s.coconutMat);
        const ca = (c * Math.PI * 2) / 3;
        nut.position.set(cx + Math.cos(ca) * 0.25, cy - 0.25, cz + Math.sin(ca) * 0.25);
        g.add(nut);
      }
      for (let i = 0; i < 7; i++) {
        const frond = new THREE.Mesh(s.frondGeo, i % 2 === 0 ? s.leafBrightMat : s.leafMidMat);
        const ang = (i * Math.PI * 2) / 7;
        frond.position.set(cx + Math.sin(ang) * 0.9, cy - 0.05, cz + Math.cos(ang) * 0.9);
        frond.rotation.y = ang;
        frond.rotation.x = 0.36 + (i % 2) * 0.14;
        g.add(frond);
      }
      return g;
    }

    if (type === 'banana') {
      // Cluster of 2–3 banana plants (কলাগাছের ঝাড়)
      const offsets = [[0, 0, 1.0], [0.75, 0.45, 0.82], [-0.65, 0.55, 0.78]];
      offsets.forEach(([ox, oz, sc], idx) => {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.3 * sc, 5), s.bananaStemMat);
        stem.position.set(ox, 1.15 * sc, oz);
        g.add(stem);
        for (let l = 0; l < 4; l++) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.54 * sc, 0.04, 1.75 * sc), s.bananaLeafMat);
          const ang = (l * Math.PI) / 2 + idx * 0.6;
          leaf.position.set(ox + Math.sin(ang) * 0.55 * sc, 2.2 * sc, oz + Math.cos(ang) * 0.55 * sc);
          leaf.rotation.y = ang;
          leaf.rotation.x = 0.34;
          g.add(leaf);
        }
      });
      return g;
    }

    if (type === 'bamboo') {
      // Iconic Bangladeshi village bamboo grove (বাঁশঝাড়)
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6;
        const culm = new THREE.Mesh(s.bambooCulmGeo, s.bambooMat);
        culm.position.set(Math.cos(ang) * 0.35, 2.6, Math.sin(ang) * 0.35);
        culm.rotation.z = -Math.cos(ang) * 0.16;
        culm.rotation.x = Math.sin(ang) * 0.16;
        g.add(culm);

        const tuft = new THREE.Mesh(s.canopyGeo, s.leafBrightMat);
        tuft.scale.set(0.9, 0.65, 0.9);
        tuft.position.set(Math.cos(ang) * 1.1, 5.1 + (i % 2) * 0.5, Math.sin(ang) * 1.1);
        g.add(tuft);
      }
      return g;
    }

    if (type === 'krishnachura') {
      // Bangladeshi Flame Tree (কৃষ্ণচূড়া) with vibrant scarlet-orange canopy
      const trunk = new THREE.Mesh(s.banyanTrunkGeo, s.trunkDarkMat);
      trunk.position.y = 1.8;
      g.add(trunk);
      const clusters = [
        [0, 4.6, 0, 2.4, 1.25, 2.2, s.flameRedMat],
        [-1.3, 4.2, 0.9, 1.6, 1.0, 1.5, s.flameMat],
        [1.3, 4.3, -0.8, 1.7, 1.05, 1.6, s.leafBrightMat],
        [0.4, 3.8, 1.1, 1.4, 0.9, 1.4, s.flameRedMat]
      ];
      clusters.forEach(([x, y, z, sx, sy, sz, mat]) => {
        const c = new THREE.Mesh(s.canopyGeo, mat);
        c.position.set(x, y, z);
        c.scale.set(sx, sy, sz);
        g.add(c);
      });
      return g;
    }

    if (type === 'mangrove') {
      // Sundarbans Sundari mangrove with stilt roots
      const trunk = new THREE.Mesh(s.banyanTrunkGeo, s.trunkDarkMat);
      trunk.scale.set(0.8, 0.78, 0.8);
      trunk.position.y = 1.45;
      g.add(trunk);
      for (let r = 0; r < 4; r++) {
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 4), s.trunkDarkMat);
        const ra = (r * Math.PI) / 2;
        root.position.set(Math.cos(ra) * 0.42, 0.6, Math.sin(ra) * 0.42);
        root.rotation.z = Math.cos(ra) * 0.45;
        root.rotation.x = -Math.sin(ra) * 0.45;
        g.add(root);
      }
      const c1 = new THREE.Mesh(s.canopyGeo, s.leafDarkMat);
      c1.scale.set(2.2, 1.45, 2.1);
      c1.position.y = 3.4;
      const c2 = new THREE.Mesh(s.canopyGeo, s.leafMidMat);
      c2.scale.set(1.5, 1.1, 1.5);
      c2.position.set(0.9, 3.0, 0.6);
      g.add(c1, c2);
      return g;
    }

    // Lush Bangladeshi Banyan / Mango / Jackfruit tree (বট / আম / কাঁঠাল গাছ)
    const trunk = new THREE.Mesh(s.banyanTrunkGeo, s.trunkDarkMat);
    trunk.position.y = 1.8;
    g.add(trunk);
    const puffs = [
      [0, 4.7, 0, 2.5, 1.65, 2.4, s.leafMidMat],
      [-1.3, 4.0, 0.8, 1.75, 1.3, 1.65, s.leafDarkMat],
      [1.2, 4.2, -0.7, 1.85, 1.35, 1.75, s.leafBrightMat]
    ];
    puffs.forEach(([x, y, z, sx, sy, sz, mat]) => {
      const puff = new THREE.Mesh(s.canopyGeo, mat);
      puff.position.set(x, y, z);
      puff.scale.set(sx, sy, sz);
      g.add(puff);
    });
    return g;
  }

  const BLDG_PALETTE = {};

  function getBuildingPalette() {
    if (BLDG_PALETTE.ready) return BLDG_PALETTE;
    BLDG_PALETTE.ready = true;
    BLDG_PALETTE.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    BLDG_PALETTE.tankGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 8);
    BLDG_PALETTE.embankmentMat = new THREE.MeshStandardMaterial({ color: 0x5c5334, roughness: 0.96 });
    BLDG_PALETTE.wallMats = [
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xfce7f3, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xdcfce7, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.85 })
    ];
    BLDG_PALETTE.urbanMats = [
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: 0xfecdd3, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.78 })
    ];
    BLDG_PALETTE.roofMats = [
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.52, metalness: 0.28 }),
      new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.52, metalness: 0.28 }),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.25 }),
      new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.52, metalness: 0.28 }),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.55, metalness: 0.25 })
    ];
    BLDG_PALETTE.awningMats = [
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 })
    ];
    BLDG_PALETTE.plinthMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 });
    BLDG_PALETTE.doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 });
    BLDG_PALETTE.ledgeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    BLDG_PALETTE.tankMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45 });
    BLDG_PALETTE.brickMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.88 });
    BLDG_PALETTE.hayMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.95 });
    BLDG_PALETTE.paddyMat = new THREE.MeshStandardMaterial({ color: 0x4d8a32, roughness: 0.92 });
    BLDG_PALETTE.mustardMat = new THREE.MeshStandardMaterial({ color: 0xd4b120, roughness: 0.9 });
    BLDG_PALETTE.pondWaterMat = new THREE.MeshStandardMaterial({ color: 0x0f6b78, roughness: 0.16, metalness: 0.38 });
    BLDG_PALETTE.whitePostMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    BLDG_PALETTE.yellowPostMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.65 });
    BLDG_PALETTE.redPostMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.65 });
    BLDG_PALETTE.poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
    BLDG_PALETTE.hillMat = new THREE.MeshStandardMaterial({ color: 0x1e5a32, roughness: 0.93 });
    BLDG_PALETTE.hillLightMat = new THREE.MeshStandardMaterial({ color: 0x2f7539, roughness: 0.92 });
    BLDG_PALETTE.windowMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.35
    });
    return BLDG_PALETTE;
  }

  function createVillageHouse(variant) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const v = Math.abs(variant);
    const w = 5.8 + (v % 3) * 1.1;
    const d = 4.4 + ((v >> 1) % 2) * 0.7;
    const h = 2.85 + (v % 2) * 0.35;

    // Raised earthen/cement foundation plinth (ভিটি)
    const plinth = new THREE.Mesh(p.boxGeo, p.plinthMat);
    plinth.scale.set(w + 0.6, 0.32, d + 1.45);
    plinth.position.set(0, 0.16, 0.45);
    g.add(plinth);

    // Main walls
    const walls = new THREE.Mesh(p.boxGeo, p.wallMats[v % p.wallMats.length]);
    walls.scale.set(w, h, d);
    walls.position.y = 0.32 + h / 2;
    g.add(walls);

    // Authentic Bangladeshi two-slope corrugated tin roof (দোচালা টিনের চাল)
    const roofMat = p.roofMats[v % p.roofMats.length];
    const slopeW = w + 0.7;
    const halfSlopeD = d * 0.56 + 0.35;
    const frontSlope = new THREE.Mesh(p.boxGeo, roofMat);
    frontSlope.scale.set(slopeW, 0.14, halfSlopeD);
    frontSlope.position.set(0, 0.32 + h + 0.45, halfSlopeD * 0.44);
    frontSlope.rotation.x = 0.36;
    g.add(frontSlope);

    const backSlope = new THREE.Mesh(p.boxGeo, roofMat);
    backSlope.scale.set(slopeW, 0.14, halfSlopeD);
    backSlope.position.set(0, 0.32 + h + 0.45, -halfSlopeD * 0.44);
    backSlope.rotation.x = -0.36;
    g.add(backSlope);

    const ridge = new THREE.Mesh(p.boxGeo, p.ledgeMat);
    ridge.scale.set(slopeW + 0.1, 0.18, 0.24);
    ridge.position.set(0, 0.32 + h + 0.98, 0);
    g.add(ridge);

    // Front veranda overhang & bamboo/wood posts (+Z faces the road)
    const verandaRoof = new THREE.Mesh(p.boxGeo, roofMat);
    verandaRoof.scale.set(w + 0.3, 0.12, 1.45);
    verandaRoof.position.set(0, 2.38, d / 2 + 0.68);
    verandaRoof.rotation.x = 0.18;
    g.add(verandaRoof);

    [-w * 0.42, 0, w * 0.42].forEach((px, idx) => {
      if (idx === 1 && v % 2 === 0) return;
      const post = new THREE.Mesh(p.boxGeo, p.doorMat);
      post.scale.set(0.13, 2.08, 0.13);
      post.position.set(px, 1.32, d / 2 + 1.24);
      g.add(post);
    });

    // Front door & warm-lit windows
    const door = new THREE.Mesh(p.boxGeo, p.doorMat);
    door.scale.set(0.95, 1.85, 0.1);
    door.position.set(0, 1.24, d / 2 + 0.04);
    g.add(door);

    [-w * 0.28, w * 0.28].forEach((wx) => {
      const win = new THREE.Mesh(p.boxGeo, p.windowMat);
      win.scale.set(0.85, 0.75, 0.1);
      win.position.set(wx, 1.75, d / 2 + 0.04);
      g.add(win);
    });

    // Optional golden rice-straw haystack (খড়ের গাদা) next to village homestead
    if (v % 3 === 0) {
      const stack = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.05, 7), p.hayMat);
      stack.position.set(w * 0.68, 1.0, -0.4);
      g.add(stack);
    }

    return { group: g, radius: Math.max(w, d + 1.5) * 0.58 };
  }

  function createRoadsideShop(variant) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const v = Math.abs(variant);
    const w = 5.0 + (v % 2) * 1.2;
    const d = 3.6;
    const h = 2.85;

    const body = new THREE.Mesh(p.boxGeo, p.wallMats[(v + 2) % p.wallMats.length]);
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    g.add(body);

    const roof = new THREE.Mesh(p.boxGeo, p.roofMats[(v + 1) % p.roofMats.length]);
    roof.scale.set(w + 0.5, 0.22, d + 0.5);
    roof.position.y = h + 0.1;
    g.add(roof);

    // Colorful shop/tea-stall awning facing the road (+Z)
    const awning = new THREE.Mesh(p.boxGeo, p.awningMats[v % p.awningMats.length]);
    awning.scale.set(w + 0.4, 0.14, 1.75);
    awning.position.set(0, 2.25, d / 2 + 0.78);
    awning.rotation.x = 0.22;
    g.add(awning);

    // Awning support bamboo poles
    [-w * 0.46, w * 0.46].forEach((px) => {
      const pole = new THREE.Mesh(p.boxGeo, p.doorMat);
      pole.scale.set(0.1, 2.05, 0.1);
      pole.position.set(px, 1.02, d / 2 + 1.5);
      g.add(pole);
    });

    // Lit shopfront window/counter opening + wooden tea-stall bench
    const front = new THREE.Mesh(p.boxGeo, p.windowMat);
    front.scale.set(w * 0.74, 1.35, 0.1);
    front.position.set(0, 1.42, d / 2 + 0.04);
    g.add(front);

    const counter = new THREE.Mesh(p.boxGeo, p.doorMat);
    counter.scale.set(w * 0.8, 0.75, 0.45);
    counter.position.set(0, 0.38, d / 2 + 0.25);
    g.add(counter);

    const bench = new THREE.Mesh(p.boxGeo, p.brickMat);
    bench.scale.set(w * 0.68, 0.36, 0.45);
    bench.position.set(0, 0.18, d / 2 + 1.12);
    g.add(bench);

    return { group: g, radius: Math.max(w, d + 1.8) * 0.56 };
  }

  function createUrbanBuilding(variant) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const v = Math.abs(variant);
    const floors = 2 + (v % 4);
    const w = 6.8 + (v % 3) * 1.4;
    const d = 5.8 + ((v >> 1) % 2) * 1.2;
    const floorH = 3.0;
    const h = floors * floorH;

    const body = new THREE.Mesh(p.boxGeo, p.urbanMats[v % p.urbanMats.length]);
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    g.add(body);

    // Ground-floor colorful shop fascia band
    const fascia = new THREE.Mesh(p.boxGeo, p.awningMats[v % p.awningMats.length]);
    fascia.scale.set(w + 0.18, 0.65, d + 0.18);
    fascia.position.y = 2.68;
    g.add(fascia);

    // Floor ledges / balconies + lit window bands on every floor
    for (let f = 0; f < floors; f++) {
      const fy = f * floorH;
      const ledge = new THREE.Mesh(p.boxGeo, p.ledgeMat);
      ledge.scale.set(w + 0.36, 0.22, d + 0.36);
      ledge.position.y = fy + floorH;
      g.add(ledge);

      if (f > 0) {
        // Front projecting balcony slab
        const balc = new THREE.Mesh(p.boxGeo, p.ledgeMat);
        balc.scale.set(w * 0.48, 0.65, 0.55);
        balc.position.set(0, fy + 0.42, d / 2 + 0.25);
        g.add(balc);
      }

      const winFront = new THREE.Mesh(p.boxGeo, p.windowMat);
      winFront.scale.set(w * 0.78, 1.15, d + 0.08);
      winFront.position.y = fy + 1.65;
      g.add(winFront);

      const winSide = new THREE.Mesh(p.boxGeo, p.windowMat);
      winSide.scale.set(w + 0.08, 1.15, d * 0.7);
      winSide.position.y = fy + 1.65;
      g.add(winSide);
    }

    // Rooftop parapet & Bangladeshi blue rooftop water tank
    const roofRim = new THREE.Mesh(p.boxGeo, p.ledgeMat);
    roofRim.scale.set(w + 0.12, 0.58, d + 0.12);
    roofRim.position.y = h + 0.29;
    g.add(roofRim);

    const tank = new THREE.Mesh(p.tankGeo, p.tankMat);
    tank.position.set(w * 0.22, h + 1.0, -d * 0.2);
    g.add(tank);

    return { group: g, radius: Math.max(w, d) * 0.6 };
  }

  function createVillagePond(variant) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const w = 13 + (variant % 3) * 3;
    const d = 10 + (variant % 2) * 2.5;

    // Raised grassy-earthen pond bank (পুকুর পাড়)
    const bank = new THREE.Mesh(p.boxGeo, p.embankmentMat);
    bank.scale.set(w + 2.2, 0.26, d + 2.2);
    bank.position.y = 0.05;
    g.add(bank);

    // Shimmering pond water
    const water = new THREE.Mesh(p.boxGeo, p.pondWaterMat);
    water.scale.set(w, 0.12, d);
    water.position.y = 0.14;
    g.add(water);

    // Concrete pond ghat steps on one side
    const ghat = new THREE.Mesh(p.boxGeo, p.plinthMat);
    ghat.scale.set(2.4, 0.34, 1.6);
    ghat.position.set(0, 0.18, d * 0.48);
    g.add(ghat);
    return g;
  }

  function createBrickKiln() {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    // Elliptical kiln base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 8.4, 3.2, 10), p.brickMat);
    base.position.y = 1.6;
    g.add(base);
    // Tall tapered brick chimney rising above Bangladesh countryside
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.85, 21, 10), p.brickMat);
    chimney.position.y = 10.5;
    g.add(chimney);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.75, 10), p.whitePostMat);
    band.position.y = 18.2;
    g.add(band);
    return g;
  }

  function createKilometerPost(kmText) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const stem = new THREE.Mesh(p.boxGeo, p.whitePostMat);
    stem.scale.set(0.48, 0.88, 0.22);
    stem.position.y = 0.44;
    const cap = new THREE.Mesh(p.boxGeo, p.yellowPostMat);
    cap.scale.set(0.52, 0.24, 0.24);
    cap.position.y = 0.98;
    g.add(stem, cap);
    if (kmText) {
      const tex = global.BDTextures.createSignTexture('#ffffff', '#065f46', '#065f46', kmText, '');
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      face.position.set(0, 0.56, 0.12);
      g.add(face);
    }
    return g;
  }

  function createUtilityPole() {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const post = new THREE.Mesh(p.boxGeo, p.poleMat);
    post.scale.set(0.22, 8.2, 0.22);
    post.position.y = 4.1;
    const crossArm = new THREE.Mesh(p.boxGeo, p.ledgeMat);
    crossArm.scale.set(1.75, 0.14, 0.14);
    crossArm.position.y = 7.7;
    g.add(post, crossArm);
    return g;
  }

  function createPaddyFieldPatch(variant) {
    const p = getBuildingPalette();
    const g = new THREE.Group();
    const w = 15 + (variant % 3) * 4;
    const d = 12 + (variant % 2) * 3;
    const cropMat = variant % 4 === 0 ? p.mustardMat : p.paddyMat;
    const bund = new THREE.Mesh(p.boxGeo, p.embankmentMat);
    bund.scale.set(w + 1.0, 0.18, d + 1.0);
    bund.position.y = 0.04;
    const crop = new THREE.Mesh(p.boxGeo, cropMat);
    crop.scale.set(w, 0.28, d);
    crop.position.y = 0.12;
    g.add(bund, crop);
    return g;
  }

  function createLandmarkBuilding(kind, labelBn) {
    const g = new THREE.Group();
    if (kind === 'mosque') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(9, 4.8, 8),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
      );
      base.position.y = 2.4;
      g.add(base);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.35 })
      );
      dome.position.y = 5.4;
      g.add(dome);
      const minaret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.6, 9.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
      );
      minaret.position.set(3.8, 4.75, 3.2);
      g.add(minaret);
      return { group: g, radius: 6.2 };
    }

    if (kind === 'hospital') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(11, 5.8, 7.5),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 })
      );
      base.position.y = 2.9;
      g.add(base);
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.2), crossMat);
      c1.position.set(0, 4.5, 3.85);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.2), crossMat);
      c2.position.set(0, 4.5, 3.85);
      g.add(c1, c2);
      const signTex = global.BDTextures.createSignTexture('#ffffff', '#dc2626', '#991b1b', labelBn || 'স্বাস্থ্য কমপ্লেক্স', 'HOSPITAL 24H');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.2), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 6.4, 3.8);
      g.add(sign);
      return { group: g, radius: 6.8 };
    }

    if (kind === 'school') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(12, 4.2, 6),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.75 })
      );
      base.position.y = 2.1;
      g.add(base);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(12.6, 0.4, 6.6),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c })
      );
      roof.position.y = 4.35;
      g.add(roof);
      const signTex = global.BDTextures.createSignTexture('#1e3a8a', '#ffffff', '#ffffff', labelBn || 'উচ্চ বিদ্যালয়', 'SCHOOL ZONE');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.2), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 5.2, 3.1);
      g.add(sign);
      return { group: g, radius: 6.5 };
    }

    // Market / Bazaar
    const roofColors = [0xdc2626, 0x2563eb, 0x16a34a, 0xd97706];
    for (let i = 0; i < 3; i++) {
      const stall = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 2.5, 3.6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
      );
      stall.position.set(-4.4 + i * 4.4, 1.25, 0);
      g.add(stall);
      const tarp = new THREE.Mesh(
        new THREE.BoxGeometry(4.1, 0.2, 4.6),
        new THREE.MeshStandardMaterial({ color: roofColors[i % roofColors.length] })
      );
      tarp.position.set(-4.4 + i * 4.4, 2.7, 0.3);
      g.add(tarp);
    }
    const mTex = global.BDTextures.createSignTexture('#065f46', '#fbbf24', '#ffffff', labelBn || 'কাঁচা বাজার', 'LOCAL MARKET');
    const mSign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.3), new THREE.MeshBasicMaterial({ map: mTex }));
    mSign.position.set(0, 3.9, 2.0);
    g.add(mSign);
    return { group: g, radius: 7.5 };
  }

  // Bespoke 3D Reference Landmarks (visually inspired reference geometry)
  function createIconicLandmark(type, loc) {
    const g = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });

    if (type === 'kamalapur') {
      // Iconic arched umbrella concrete vaults inspired by Kamalapur Railway Station
      const hall = new THREE.Mesh(new THREE.BoxGeometry(24, 6.2, 12), concreteMat);
      hall.position.y = 3.1;
      g.add(hall);
      for (let i = -2; i <= 2; i++) {
        const vault = new THREE.Mesh(
          new THREE.ConeGeometry(3.2, 3.6, 6),
          new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.6 })
        );
        vault.position.set(i * 4.6, 8.2, 0);
        g.add(vault);
      }
      const signTex = global.BDTextures.createSignTexture('#065f46', '#fef08a', '#ffffff', 'কমলাপুর রেলওয়ে স্টেশন', 'KAMALAPUR STATION • REF MODEL');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.0), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 5.2, 6.2);
      g.add(sign);
      return { group: g, radius: 13 };
    }

    if (type === 'sangsad') {
      // Cylindrical/octagonal brutalist concrete silhouette inspired by Jatiya Sangsad
      const core = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.2, 14, 8), concreteMat);
      core.position.y = 7.0;
      g.add(core);
      const moat = new THREE.Mesh(
        new THREE.RingGeometry(10.5, 15.5, 16),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.45, side: THREE.DoubleSide })
      );
      moat.rotation.x = -Math.PI / 2;
      moat.position.y = 0.08;
      g.add(moat);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 7.5, 5.5), concreteMat);
      wing.position.y = 3.75;
      g.add(wing);
      const signTex = global.BDTextures.createSignTexture('#0f172a', '#e2e8f0', '#ffffff', 'জাতীয় সংসদ ভবন', 'JATIYA SANGSAD • REF MODEL');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 9.0, 8.8);
      g.add(sign);
      return { group: g, radius: 13.5 };
    }

    if (type === 'sadarghat') {
      // River launch terminal jetty & 2-deck white passenger launches
      const jetty = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, 8), darkMat);
      jetty.position.y = 0.7;
      g.add(jetty);
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(16, 5.2, 5.2),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
      );
      bldg.position.set(0, 3.8, -1.2);
      g.add(bldg);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(17.5, 0.5, 6.2),
        new THREE.MeshStandardMaterial({ color: 0x047857 })
      );
      roof.position.set(0, 6.6, -1.0);
      g.add(roof);
      const signTex = global.BDTextures.createSignTexture('#064e3b', '#34d399', '#ffffff', 'সদরঘাট লঞ্চ টার্মিনাল', 'SADARGHAT PORT • REF MODEL');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.9), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 5.4, 1.8);
      g.add(sign);
      return { group: g, radius: 12 };
    }

    if (type === 'ctg_port') {
      // Gantry cranes & colorful shipping container stacks
      const craneMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.55, roughness: 0.35 });
      const contCols = [0x2563eb, 0xd97706, 0x059669, 0x991b1b];
      for (let c = 0; c < 4; c++) {
        const cont = new THREE.Mesh(
          new THREE.BoxGeometry(5.5, 2.5, 2.4),
          new THREE.MeshStandardMaterial({ color: contCols[c % contCols.length], roughness: 0.7 })
        );
        cont.position.set(-7 + c * 4.5, 1.25 + (c % 2) * 2.5, -2);
        g.add(cont);
      }
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 16, 1.4), craneMat);
      tower.position.set(0, 8, 2.5);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 14), craneMat);
      boom.position.set(0, 14.5, 5.5);
      g.add(tower, boom);
      const signTex = global.BDTextures.createSignTexture('#1e3a8a', '#f59e0b', '#ffffff', 'চট্টগ্রাম সমুদ্র বন্দর', 'CHATTOGRAM PORT • REF MODEL');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 6.2, 4.2);
      g.add(sign);
      return { group: g, radius: 11 };
    }

    if (type === 'tea_garden') {
      // Stepped emerald tea plantation terraces
      const teaMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 });
      for (let t = 0; t < 4; t++) {
        const terrace = new THREE.Mesh(new THREE.BoxGeometry(24 - t * 3.5, 1.6, 16 - t * 2.5), teaMat);
        terrace.position.set(0, 0.8 + t * 1.4, -t * 1.2);
        g.add(terrace);
      }
      const signTex = global.BDTextures.createSignTexture('#065f46', '#bef264', '#ffffff', loc.nameBn || 'সিলেট চা বাগান', 'TEA ESTATE TERRACES');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.7), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 4.2, 8.2);
      g.add(sign);
      return { group: g, radius: 13 };
    }

    if (type === 'beach') {
      // Golden sand pad + colorful beach umbrellas + watchtower
      const sand = new THREE.Mesh(
        new THREE.CylinderGeometry(16, 17, 0.35, 16),
        new THREE.MeshStandardMaterial({ color: 0xe6c88a, roughness: 0.92 })
      );
      sand.position.y = 0.08;
      g.add(sand);
      const umbCols = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981];
      for (let u = 0; u < 4; u++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), concreteMat);
        pole.position.set(-7 + u * 4.5, 1.2, 2);
        const top = new THREE.Mesh(
          new THREE.ConeGeometry(1.7, 0.65, 8),
          new THREE.MeshStandardMaterial({ color: umbCols[u] })
        );
        top.position.set(-7 + u * 4.5, 2.5, 2);
        g.add(pole, top);
      }
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6.2, 2.6), new THREE.MeshStandardMaterial({ color: 0xfef3c7 }));
      tower.position.set(7.5, 3.1, -4);
      g.add(tower);
      const signTex = global.BDTextures.createSignTexture('#0369a1', '#fde047', '#ffffff', loc.nameBn || 'সমুদ্র সৈকত', 'BAY OF BENGAL BEACH');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 4.2, 7.5);
      g.add(sign);
      return { group: g, radius: 11 };
    }

    if (type === 'mymensingh_station' || type === 'mohakhali' || type === 'hanif_flyover') {
      // Multi-story urban/heritage station facade
      const bColor = type === 'mymensingh_station' ? 0x991b1b : 0x475569;
      const body = new THREE.Mesh(new THREE.BoxGeometry(18, 6.8, 7.5), new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.72 }));
      body.position.y = 3.4;
      g.add(body);
      if (type === 'hanif_flyover') {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.85, 6.0), concreteMat);
        deck.position.set(0, 6.2, -5.5);
        g.add(deck);
      }
      const signTex = global.BDTextures.createSignTexture('#064e3b', '#fde68a', '#ffffff', loc.nameBn, `${loc.nameEn.toUpperCase()} • REF MODEL`);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
      sign.position.set(0, 6.2, 4.0);
      g.add(sign);
      return { group: g, radius: 10.5 };
    }

    // Default urban high-rise cluster for districts
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(7.5, 9.5, 6.5), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7 }));
    h1.position.set(-3.5, 4.75, 0);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(6.5, 12.5, 6.0), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65 }));
    h2.position.set(4.0, 6.25, -1);
    g.add(h1, h2);
    return { group: g, radius: 8.5 };
  }

  function createBusTerminalMesh(nameBn, nameEn, isMajorTerminal) {
    const g = new THREE.Group();
    const w = isMajorTerminal ? 14 : 9;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.35, 4.2),
      new THREE.MeshStandardMaterial({ color: isMajorTerminal ? 0x065f46 : 0x047857, roughness: 0.45 })
    );
    roof.position.set(0, 4.1, 0);
    g.add(roof);

    const cols = isMajorTerminal ? [-6, -2, 2, 6] : [-3.8, 0, 3.8];
    cols.forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 4.1, 6),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.5 })
      );
      post.position.set(px, 2.05, -1.5);
      g.add(post);
    });

    if (isMajorTerminal) {
      const booth = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 2.8, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9 })
      );
      booth.position.set(-3.8, 1.4, -1.2);
      g.add(booth);
    }

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(isMajorTerminal ? 6.5 : 5.0, 0.45, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b })
    );
    bench.position.set(isMajorTerminal ? 2.4 : 0, 0.45, -1.0);
    g.add(bench);

    const signTex = global.BDTextures.createSignTexture('#064e3b', '#34d399', '#ffffff', nameBn, nameEn);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.78, 1.25), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 4.85, 0.2);
    g.add(sign);

    return g;
  }

  function createTollPlaza(bridgeName) {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.85, 5.2),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.45 })
    );
    roof.position.y = 5.4;
    g.add(roof);

    [-8.2, 0, 8.2].forEach((px) => {
      const booth = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 5.0, 3.6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
      );
      booth.position.set(px, 2.5, 0);
      g.add(booth);
    });

    const armPivot = new THREE.Group();
    armPivot.position.set(-7.3, 1.25, 1.6);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.14, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    arm.position.x = 3.25;
    armPivot.add(arm);
    g.add(armPivot);

    const signTex = global.BDTextures.createSignTexture('#1e3a8a', '#fbbf24', '#ffffff', `${bridgeName}`, 'টোল প্লাজা • TOLL GATE');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.6), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 6.2, 2.65);
    g.add(sign);
    const signB = sign.clone();
    signB.rotation.y = Math.PI;
    signB.position.z = -2.65;
    g.add(signB);

    return { group: g, armPivot };
  }

  function createTrafficPoliceBox(titleBn) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.9, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
    );
    base.position.y = 1.25;
    g.add(base);

    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.78, 1.78, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 })
    );
    stripe.position.y = 1.1;
    g.add(stripe);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.15, 0.95, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 })
    );
    roof.position.y = 2.95;
    g.add(roof);

    const signTex = global.BDTextures.createSignTexture('#1e3a8a', '#facc15', '#ffffff', 'ট্রাফিক পুলিশ বক্স', titleBn || 'HIGHWAY MOR');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.72), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
    sign.position.set(0, 3.65, 0);
    g.add(sign);

    return { group: g, radius: 2.4 };
  }

  function createBridgeArchSign(titleBn, subEn, accentColor) {
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: accentColor || 0x1d4ed8, metalness: 0.45, roughness: 0.4 });
    [-7.8, 7.8].forEach((px) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.55), pillarMat);
      post.position.set(px, 3.1, 0);
      g.add(post);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.65, 0.65), pillarMat);
    beam.position.set(0, 6.0, 0);
    g.add(beam);

    const signTex = global.BDTextures.createSignTexture('#064e3b', '#fbbf24', '#ffffff', titleBn, subEn || 'BANGLADESH HIGHWAY BRIDGE');
    const signF = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 1.55), new THREE.MeshBasicMaterial({ map: signTex }));
    signF.position.set(0, 6.1, 0.36);
    const signB = signF.clone();
    signB.rotation.y = Math.PI;
    signB.position.z = -0.36;
    g.add(signF, signB);
    return g;
  }

  function createRiverBoat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 1.1, 9.5),
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.8 })
    );
    hull.position.y = 0.45;
    g.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.3, 4.6),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc })
    );
    cabin.position.set(0, 1.4, 0);
    g.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.18, 5.0),
      new THREE.MeshStandardMaterial({ color: 0x059669 })
    );
    roof.position.set(0, 2.1, 0);
    g.add(roof);
    return g;
  }

  function createRiverFerry() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 1.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.3 })
    );
    hull.position.y = 0.7;
    g.add(hull);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.22, 18.8),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 })
    );
    deck.position.y = 1.55;
    g.add(deck);
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 2.1, 11.2),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 })
    );
    upper.position.set(0, 2.65, -0.5);
    g.add(upper);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(5.35, 0.45, 11.35),
      new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.4 })
    );
    stripe.position.set(0, 2.95, -0.5);
    g.add(stripe);
    const bridgeHouse = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.3, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    );
    bridgeHouse.position.set(0, 4.3, -2.5);
    g.add(bridgeHouse);
    return g;
  }

  function createReedCluster() {
    const g = new THREE.Group();
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.85 });
    for (let i = 0; i < 6; i++) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.8 + (i % 3) * 0.45, 4), reedMat);
      stalk.position.set(((i % 3) - 1) * 0.38, 0.9, (Math.floor(i / 3) - 0.5) * 0.42);
      stalk.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.14;
      g.add(stalk);
    }
    return g;
  }

  function createStreetLightPoolTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 250, 230, 1.0)');
    grad.addColorStop(0.28, 'rgba(254, 226, 150, 0.72)');
    grad.addColorStop(0.62, 'rgba(245, 180, 65, 0.26)');
    grad.addColorStop(1.0, 'rgba(245, 158, 11, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function createLampHaloTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(255, 255, 245, 1.0)');
    grad.addColorStop(0.32, 'rgba(254, 240, 138, 0.78)');
    grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.24)');
    grad.addColorStop(1.0, 'rgba(245, 158, 11, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function createStreetLightPole(bulbMat, poolMat, haloMat, coneMat) {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.35 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 6.4, 6), poleMat);
    post.position.y = 3.2;
    g.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.11, 0.11), poleMat);
    arm.position.set(0.85, 6.28, 0);
    arm.rotation.z = 0.08;
    g.add(arm);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.36), poleMat);
    hood.position.set(1.56, 6.36, 0);
    g.add(hood);

    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.28), bulbMat);
    bulb.position.set(1.56, 6.25, 0);
    g.add(bulb);

    if (haloMat) {
      const halo = new THREE.Sprite(haloMat);
      halo.position.set(1.56, 6.18, 0);
      halo.scale.set(2.8, 2.8, 1);
      g.add(halo);
    }

    if (coneMat) {
      const coneGeo = new THREE.ConeGeometry(3.8, 6.1, 10, 1, true);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(1.56, 3.12, 0);
      g.add(cone);
    }

    const pool = new THREE.Mesh(new THREE.CircleGeometry(7.6, 14), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(1.65, 0.075, 0);
    g.add(pool);

    return g;
  }

  function createTrafficLightPole() {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6.2, 6), poleMat);
    post.position.y = 3.1;
    g.add(post);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.18), poleMat);
    arm.position.set(2.1, 5.9, 0);
    g.add(arm);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 1.55, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    box.position.set(3.1, 5.2, 0);
    g.add(box);

    const redMat = new THREE.MeshBasicMaterial({ color: 0x450a0a });
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x052e16 });

    const rLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), redMat);
    rLamp.position.set(3.1, 5.65, 0.24);
    const yLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), yellowMat);
    yLamp.position.set(3.1, 5.2, 0.24);
    const gLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), greenMat);
    gLamp.position.set(3.1, 4.75, 0.24);

    const rLampB = rLamp.clone(); rLampB.position.z = -0.24;
    const yLampB = yLamp.clone(); yLampB.position.z = -0.24;
    const gLampB = gLamp.clone(); gLampB.position.z = -0.24;

    g.add(rLamp, yLamp, gLamp, rLampB, yLampB, gLampB);

    return {
      group: g,
      setState(state) {
        redMat.color.setHex(state === 'red' ? 0xff1e38 : 0x3b0712);
        yellowMat.color.setHex(state === 'yellow' ? 0xfbbf24 : 0x451a03);
        greenMat.color.setHex(state === 'green' ? 0x22c55e : 0x052e16);
      }
    };
  }

  class BangladeshWorld {
    constructor(scene) {
      this.scene = scene;
      this.root = new THREE.Group();
      this.scene.add(this.root);

      this.roadEdges = [];
      this.roadSamples = [];
      this.sampleGrid = new Map();
      this.locationGrid = new Map();
      this.colliderGrid = new Map();
      this.gridCellSize = 260;

      this.streamChunks = [];
      this.colliders = [];
      this.busStops = [];
      this.trafficLights = [];
      this.fuelStations = [];
      this.restStops = [];
      this.garages = [];
      this.washStations = [];
      this.speedBumps = [];
      this.brokenZones = [];
      this.tollGates = [];
      this.bridgeZones = [];
      this.constructionZones = [];
      this.riverBoats = [];
      this.waterMeshes = [];
      this.riverMaterials = [];
      this.riverCenters = [];
      this.wettableRoadMats = [];
      this.anisotropyTextures = [];
      this.nightLampMats = [];
      this.nightLightPools = [];
      this.streetLights = [];
      this.streetLightGrid = new Map();
      this.nightLightFactor = 0;

      const poolTex = createStreetLightPoolTexture();
      const haloTex = createLampHaloTexture();

      this.streetLampBulbMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.3
      });
      this.streetLampPoolMat = new THREE.MeshBasicMaterial({
        map: poolTex,
        color: 0xffd27d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      });
      this.streetLampHaloMat = new THREE.SpriteMaterial({
        map: haloTex,
        color: 0xffebb3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      this.streetLampConeMat = new THREE.MeshBasicMaterial({
        color: 0xfde68a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });

      this.nightLampMats.push(this.streetLampBulbMat);
      this.nightLightPools.push(this.streetLampPoolMat);

      this.streetPointLights = [];
      for (let i = 0; i < 5; i++) {
        const pl = new THREE.PointLight(0xffcf7a, 0, 56, 1.25);
        pl.visible = false;
        this.scene.add(pl);
        this.streetPointLights.push(pl);
      }

      this.treeGroups = [];
      this.plazaZones = [];
      this.groundMesh = null;

      getBuildingPalette();
      this.buildOpenWorld();
      this.buildRainSystem();
    }

    addStreetLight(parentGroup, x, y, z, rotY, boost = 0) {
      const lamp = createStreetLightPole(
        this.streetLampBulbMat,
        this.streetLampPoolMat,
        this.streetLampHaloMat,
        this.streetLampConeMat
      );
      lamp.position.set(x, y, z);
      lamp.rotation.y = rotY;
      parentGroup.add(lamp);

      const armOffX = Math.cos(rotY) * 1.56;
      const armOffZ = -Math.sin(rotY) * 1.56;
      const entry = { x: x + armOffX, y, z: z + armOffZ, boost };
      this.streetLights.push(entry);
      this.insertToGrid(this.streetLightGrid, entry.x, entry.z, entry);
      return lamp;
    }

    cellKey(x, z) {
      const cx = Math.floor(x / this.gridCellSize);
      const cz = Math.floor(z / this.gridCellSize);
      return `${cx},${cz}`;
    }

    insertToGrid(grid, x, z, item) {
      const k = this.cellKey(x, z);
      let arr = grid.get(k);
      if (!arr) {
        arr = [];
        grid.set(k, arr);
      }
      arr.push(item);
    }

    queryGrid3x3(grid, x, z) {
      const cx = Math.floor(x / this.gridCellSize);
      const cz = Math.floor(z / this.gridCellSize);
      const out = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(`${cx + dx},${cz + dz}`);
          if (arr) {
            for (let i = 0; i < arr.length; i++) out.push(arr[i]);
          }
        }
      }
      return out;
    }

    addCollider(c) {
      this.colliders.push(c);
      this.insertToGrid(this.colliderGrid, c.x, c.z, c);
    }

    getCollidersNear(x, z) {
      return this.queryGrid3x3(this.colliderGrid, x, z);
    }

    registerChunk(cx, cz, group) {
      this.root.add(group);
      this.streamChunks.push({ cx, cz, group });
    }

    buildOpenWorld() {
      const grassTex = global.BDTextures.createGrassTexture();
      this.groundTex = grassTex;
      // Moving infinite ground plane follows player smoothly across all 64 districts
      this.groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3600, 3600),
        new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 })
      );
      this.groundMesh.rotation.x = -Math.PI / 2;
      this.groundMesh.position.set(0, -0.09, 0);
      this.groundMesh.receiveShadow = true;
      this.root.add(this.groundMesh);

      // Coastal Sea (Bay of Bengal spanning south of Khulna, Barishal, Kuakata & Cox's Bazar Marine Drive)
      const waterTex = global.BDTextures.createWaterTexture();
      const seaMat = new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.14, metalness: 0.45 });
      this.riverMaterials.push(seaMat, getBuildingPalette().pondWaterMat);

      const bayCoords = [
        { lat: 21.30, lon: 91.65, w: 7200, h: 5200 }, // Cox's Bazar & Chattogram Coast
        { lat: 21.35, lon: 89.95, w: 6800, h: 4200 }  // Kuakata & Sundarbans South Bay
      ];
      bayCoords.forEach((b) => {
        const pos = Geo.latLonToWorld ? Geo.latLonToWorld(b.lat, b.lon) : { x: 1450, z: 1380 };
        const bay = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), seaMat);
        bay.rotation.x = -Math.PI / 2;
        bay.position.set(pos.x, -0.045, pos.z);
        this.root.add(bay);
        this.waterMeshes.push(bay);
        this.riverCenters.push({ x: pos.x, z: pos.z, r: b.w * 0.45 });
      });

      // Real Georeferenced Bangladesh River Polylines
      if (Geo.REAL_RIVERS && Geo.latLonToWorld) {
        Geo.REAL_RIVERS.forEach((rv) => {
          const worldPts = rv.points.map(([lat, lon]) => Geo.latLonToWorld(lat, lon));
          const builtRiver = buildRiverRibbonMesh(worldPts, rv.widthWorld, seaMat);
          if (builtRiver) {
            this.root.add(builtRiver.mesh);
            this.waterMeshes.push(builtRiver.mesh);
            // Register midpoint + endpoints for river audio & ambient shimmer
            const mid = builtRiver.points[Math.floor(builtRiver.points.length / 2)];
            this.riverCenters.push({ x: mid.x, z: mid.z, r: 220, name: rv.name });
          }
        });
      }

      // PBR Road materials with procedural puddle roughness maps
      const asphaltRoughTex = global.BDTextures.createAsphaltRoughnessTexture();
      const hwyTex = global.BDTextures.createHighwayTexture();
      const vilTex = global.BDTextures.createVillageRoadTexture();
      const ctyTex = global.BDTextures.createCityRoadTexture();
      const highwayMat = new THREE.MeshStandardMaterial({
        map: hwyTex,
        roughnessMap: asphaltRoughTex,
        roughness: 0.88,
        metalness: 0.05
      });
      const villageMat = new THREE.MeshStandardMaterial({ map: vilTex, roughness: 0.94 });
      const cityMat = new THREE.MeshStandardMaterial({
        map: ctyTex,
        roughnessMap: asphaltRoughTex,
        roughness: 0.88,
        metalness: 0.05
      });
      this.wettableRoadMats.push(highwayMat, cityMat);
      this.villageRoadMat = villageMat;
      this.anisotropyTextures.push(hwyTex, vilTex, ctyTex, asphaltRoughTex, grassTex, waterTex);

      // 1. Build Connected National (N1–N8), Regional & Village Road Network
      ROAD_NETWORK_EDGES.forEach((edge) => {
        const p1 = BANGLADESH_LOCATIONS[edge.from];
        const p2 = BANGLADESH_LOCATIONS[edge.to];
        if (!p1 || !p2) return;
        const isVillage = edge.type === 'village';
        const isCity = edge.type === 'city';
        const halfW = isVillage ? 4.8 : isCity ? 6.8 : 7.6;
        const mat = isVillage ? villageMat : isCity ? cityMat : highwayMat;

        const built = buildRoadSegmentMesh(p1, p2, edge.waypoints, halfW, mat, edge.bridge, edge.ferry);
        built.mesh.receiveShadow = true;
        this.root.add(built.mesh);

        const edgeRecord = {
          ...edge,
          p1,
          p2,
          halfW,
          dist: built.dist,
          dir: built.dir,
          right: built.right,
          samples: built.samples
        };
        this.roadEdges.push(edgeRecord);

        for (let i = 0; i < built.samples.length; i++) {
          const s = built.samples[i];
          const rec = {
            ...s,
            edgeId: edge.id,
            surface: isVillage ? 'village' : 'asphalt',
            halfW: halfW + 0.8,
            speedLimit: edge.speedLimit,
            isBridge: !!edge.bridge && !edge.ferry
          };
          this.roadSamples.push(rec);
          this.insertToGrid(this.sampleGrid, rec.x, rec.z, rec);
        }
      });

      // Pre-register city plazas & rest stop clear zones so roadside houses never spawn inside terminals
      Object.values(BANGLADESH_LOCATIONS).forEach((loc) => {
        this.plazaZones.push({ x: loc.x, z: loc.z, r: loc.isTerminal ? 38 : 29 });
      });
      const restPreSpecs = [
        { edgeId: 'dhaka_gazipur', t: 0.52 },
        { edgeId: 'dhaka_cumilla', t: 0.55 },
        { edgeId: 'sirajganj_bogura', t: 0.50 },
        { edgeId: 'sayedabad_mawa', t: 0.52 },
        { edgeId: 'habiganj_moulvibazar', t: 0.50 },
        { edgeId: 'jashore_khulna', t: 0.48 }
      ];
      restPreSpecs.forEach((spec) => {
        const edge = this.roadEdges.find((e) => e.id === spec.edgeId);
        if (!edge || !edge.samples.length) return;
        const pt = edge.samples[Math.floor(edge.samples.length * spec.t)];
        this.plazaZones.push({ x: pt.x - pt.rx * 25, z: pt.z - pt.rz * 25, r: 34 });
      });

      // Now that all roadSamples are indexed in sampleGrid, build bridges, road events, cities & rest stops
      this.roadEdges.forEach((edgeRecord) => {
        if (edgeRecord.bridge) {
          this.buildBridgeOnEdge(edgeRecord, seaMat);
        }
        this.buildRoadEventsOnEdge(edgeRecord);
      });

      // 2. Build ALL 64 Districts, Dhaka Terminals & Real Iconic Landmarks
      Object.values(BANGLADESH_LOCATIONS).forEach((loc, idx) => {
        this.insertToGrid(this.locationGrid, loc.x, loc.z, loc);
        this.buildCityDistrict(loc, idx, cityMat);
      });

      // 3. Build Regional Highway Rest Stop Complexes across N1, N2, N3, N5, N7, N8
      this.buildHighwayRestStops(cityMat);
    }

    createFuelDispenserGroup(stationName) {
      const pumpGroup = new THREE.Group();
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(9.2, 0.36, 6.0),
        new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.45 })
      );
      canopy.position.y = 4.3;
      pumpGroup.add(canopy);

      [-3.8, 3.8].forEach((px) => {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 4.3, 0.45),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc })
        );
        col.position.set(px, 2.15, 0);
        pumpGroup.add(col);
      });

      const dieselPump = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
      dieselPump.position.set(-1.3, 0.92, 0);
      const petrolPump = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), new THREE.MeshStandardMaterial({ color: 0x059669 }));
      petrolPump.position.set(1.3, 0.92, 0);
      pumpGroup.add(dieselPump, petrolPump);

      const priceTex = global.BDTextures.createSignTexture('#0f172a', '#fbbf24', '#ffffff', `${stationName || 'পদ্মা ফিলিং স্টেশন'}`, 'DIESEL ৳105 | PETROL ৳125');
      const priceSign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.25), new THREE.MeshBasicMaterial({ map: priceTex, side: THREE.DoubleSide }));
      priceSign.position.set(0, 5.15, 0);
      pumpGroup.add(priceSign);

      const att = new THREE.Group();
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.68, 0.22), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      legs.position.y = 0.34;
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.26), new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
      shirt.position.y = 0.96;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8d5524 }));
      head.position.y = 1.4;
      att.add(legs, shirt, head);
      att.position.set(0, 0, 1.15);
      pumpGroup.add(att);

      return pumpGroup;
    }

    buildHighwayRestStops(padMat) {
      const restSpecs = [
        { edgeId: 'dhaka_gazipur', t: 0.52, name: 'Gazipur Highway Oasis', nameBn: 'গাজীপুর হাইওয়ে প্লাজা' },
        { edgeId: 'dhaka_cumilla', t: 0.55, name: 'Meghna Highway Food & Service', nameBn: 'মেঘনা হাইওয়ে রেস্তোরাঁ' },
        { edgeId: 'sirajganj_bogura', t: 0.50, name: 'Bogura Highway Complex', nameBn: 'বগুড়া সার্ভিস কমপ্লেক্স' },
        { edgeId: 'sayedabad_mawa', t: 0.52, name: 'Mawa Expressway Plaza', nameBn: 'মাওয়া হাইওয়ে প্লাজা' },
        { edgeId: 'habiganj_moulvibazar', t: 0.50, name: 'Sreemangal Tea Oasis', nameBn: 'শ্রীমঙ্গল টি-রিসোর্ট' },
        { edgeId: 'jashore_khulna', t: 0.48, name: 'Noapara Highway Station', nameBn: 'নওয়াপাড়া সার্ভিস কমপ্লেক্স' }
      ];

      restSpecs.forEach((spec) => {
        const edge = this.roadEdges.find((e) => e.id === spec.edgeId);
        if (!edge || !edge.samples.length) return;
        const pt = edge.samples[Math.floor(edge.samples.length * spec.t)];
        const yaw = Math.atan2(-pt.tx, -pt.tz);
        const cx = pt.x - pt.rx * 25;
        const cz = pt.z - pt.rz * 25;
        if (!this.isClearOfAllRoads(cx, cz, 12)) return;

        const chunk = new THREE.Group();
        const apronMat = padMat.clone();
        apronMat.polygonOffset = true;
        apronMat.polygonOffsetFactor = -2;
        apronMat.polygonOffsetUnits = -2;
        this.wettableRoadMats.push(apronMat);
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(24, 38), apronMat);
        apron.rotation.x = -Math.PI / 2;
        apron.rotation.z = -yaw;
        apron.position.set(cx, pt.y + 0.015, cz);
        apron.receiveShadow = true;
        chunk.add(apron);

        const toWorld = (localRight, localFwd) => ({
          x: cx + pt.rx * localRight + pt.tx * localFwd,
          z: cz + pt.rz * localRight + pt.tz * localFwd
        });

        const restPos = toWorld(-7.2, 0);
        if (this.isClearOfAllRoads(restPos.x, restPos.z, 5.5)) {
          const restBldg = new THREE.Group();
          const hotel = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.8, 12), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.75 }));
          hotel.position.y = 1.9;
          restBldg.add(hotel);
          const signTex = global.BDTextures.createSignTexture('#991b1b', '#fef08a', '#ffffff', spec.nameBn, 'RESTAURANT • TEA • TOILET • REST');
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.45), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
          sign.position.set(3.35, 3.3, 0);
          sign.rotation.y = Math.PI / 2;
          restBldg.add(sign);
          const teaAwning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 4.4), new THREE.MeshStandardMaterial({ color: 0x059669 }));
          teaAwning.position.set(4.5, 2.55, -3.2);
          restBldg.add(teaAwning);
          const bench = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 3.6), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
          bench.position.set(4.2, 0.25, 3.2);
          restBldg.add(bench);
          restBldg.position.set(restPos.x, pt.y, restPos.z);
          restBldg.rotation.y = yaw;
          chunk.add(restBldg);
          this.addCollider({ x: restPos.x, z: restPos.z, radius: 4.8 });
        }

        const restBay = toWorld(2.2, 0);
        const restRing = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 3.2, 20),
          new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
        );
        restRing.rotation.x = -Math.PI / 2;
        restRing.position.set(restBay.x, pt.y + 0.045, restBay.z);
        chunk.add(restRing);
        this.restStops.push({ x: restBay.x, z: restBay.z, name: spec.name });

        const fuelStruct = toWorld(-6.5, 13.5);
        if (this.isClearOfAllRoads(fuelStruct.x, fuelStruct.z, 4.2)) {
          const pump = this.createFuelDispenserGroup(spec.name);
          pump.position.set(fuelStruct.x, pt.y, fuelStruct.z);
          pump.rotation.y = yaw + Math.PI / 2;
          chunk.add(pump);
        }
        const fuelBay = toWorld(2.2, 13.5);
        const fuelRing = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 3.2, 20),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
        );
        fuelRing.rotation.x = -Math.PI / 2;
        fuelRing.position.set(fuelBay.x, pt.y + 0.045, fuelBay.z);
        chunk.add(fuelRing);
        this.fuelStations.push({ x: fuelBay.x, z: fuelBay.z, name: `${spec.name} Fuel Pump` });

        const garageStruct = toWorld(-7.2, -13.5);
        if (this.isClearOfAllRoads(garageStruct.x, garageStruct.z, 4.5)) {
          const gGroup = new THREE.Group();
          const shed = new THREE.Mesh(new THREE.BoxGeometry(6.2, 4.6, 9.2), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }));
          shed.position.y = 2.3;
          gGroup.add(shed);
          const gSignTex = global.BDTextures.createSignTexture('#1e3a8a', '#f59e0b', '#ffffff', 'অটো ওয়ার্কশপ', 'REPAIR GARAGE & TIRES');
          const gSign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.3), new THREE.MeshBasicMaterial({ map: gSignTex, side: THREE.DoubleSide }));
          gSign.position.set(3.2, 4.0, 0);
          gSign.rotation.y = Math.PI / 2;
          gGroup.add(gSign);
          gGroup.position.set(garageStruct.x, pt.y, garageStruct.z);
          gGroup.rotation.y = yaw;
          chunk.add(gGroup);
          this.addCollider({ x: garageStruct.x, z: garageStruct.z, radius: 4.5 });
        }
        const garageBay = toWorld(2.2, -12.0);
        const garageRing = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 3.2, 20),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
        );
        garageRing.rotation.x = -Math.PI / 2;
        garageRing.position.set(garageBay.x, pt.y + 0.045, garageBay.z);
        chunk.add(garageRing);
        this.garages.push({ x: garageBay.x, z: garageBay.z, name: `${spec.name} Repair Garage` });

        const washBay = toWorld(2.2, -16.8);
        const washGantry = new THREE.Group();
        const archMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35 });
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 0.45), archMat);
        postL.position.set(-2.5, 2.25, 0);
        const postR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 0.45), archMat);
        postR.position.set(2.5, 2.25, 0);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.55, 0.8), archMat);
        beam.position.set(0, 4.5, 0);
        const wSignTex = global.BDTextures.createSignTexture('#0369a1', '#bae6fd', '#ffffff', 'বাস ওয়াশ', 'FOAM & WATER WASH');
        const wSign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.85), new THREE.MeshBasicMaterial({ map: wSignTex, side: THREE.DoubleSide }));
        wSign.position.set(0, 4.5, 0.44);
        washGantry.add(postL, postR, beam, wSign);
        washGantry.position.set(washBay.x, pt.y, washBay.z);
        washGantry.rotation.y = yaw;
        chunk.add(washGantry);

        const washRing = new THREE.Mesh(
          new THREE.RingGeometry(2.4, 3.0, 20),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
        );
        washRing.rotation.x = -Math.PI / 2;
        washRing.position.set(washBay.x, pt.y + 0.045, washBay.z);
        chunk.add(washRing);
        this.washStations.push({ x: washBay.x, z: washBay.z, name: `${spec.name} Bus Wash` });

        this.registerChunk(cx, cz, chunk);
      });
    }

    buildBridgeOnEdge(edge, seaMat) {
      const sLen = edge.samples.length;
      const midPt = edge.samples[Math.floor(sLen * 0.5)];
      const yaw = Math.atan2(-midPt.tx, -midPt.tz);
      const chunk = new THREE.Group();

      const isJamuna = edge.bridge.indexOf('Jamuna') >= 0 || edge.bridge.indexOf('যমুনা') >= 0;
      const isPadma = edge.bridge.indexOf('Padma') >= 0 || edge.bridge.indexOf('পদ্মা') >= 0;
      const isMega = isJamuna || isPadma;

      // Local river highlight & animated boats / BIWTC Ferry
      const riverSpanAlong = isMega ? 240 : 140;
      const riverSpanAcross = isMega ? 860 : 540;
      const river = new THREE.Mesh(new THREE.PlaneGeometry(riverSpanAlong, riverSpanAcross), seaMat);
      river.rotation.x = -Math.PI / 2;
      river.rotation.z = yaw - Math.PI / 2;
      river.position.set(midPt.x, -0.03, midPt.z);
      chunk.add(river);
      this.waterMeshes.push(river);
      this.riverCenters.push({ x: midPt.x, z: midPt.z, r: isMega ? 260 : 175, name: edge.bridge });

      // Sandy river chars / banks (বালুচর) flanking major rivers
      if (!edge.ferry) {
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xd6c294, roughness: 0.94 });
        [-riverSpanAlong * 0.56, riverSpanAlong * 0.56].forEach((alongOff) => {
          const bank = new THREE.Mesh(new THREE.PlaneGeometry(24, riverSpanAcross * 0.85), sandMat);
          bank.rotation.x = -Math.PI / 2;
          bank.rotation.z = yaw - Math.PI / 2;
          bank.position.set(midPt.x + midPt.tx * alongOff, -0.04, midPt.z + midPt.tz * alongOff);
          chunk.add(bank);
        });
      }

      for (let b = 0; b < 2; b++) {
        const boat = createRiverBoat();
        const sideOffset = b === 0 ? -90 : 100;
        const alongOffset = b === 0 ? -35 : 35;
        boat.position.set(
          midPt.x + midPt.tx * alongOffset + midPt.rx * sideOffset,
          0,
          midPt.z + midPt.tz * alongOffset + midPt.rz * sideOffset
        );
        boat.rotation.y = yaw + Math.PI / 2;
        chunk.add(boat);
        this.riverBoats.push({
          mesh: boat,
          baseX: boat.position.x,
          baseZ: boat.position.z,
          rx: midPt.rx,
          rz: midPt.rz,
          phase: b * 3.1,
          speed: 0.45 + b * 0.2
        });
      }

      if (edge.ferry || isMega) {
        const ferry = createRiverFerry();
        ferry.position.set(
          midPt.x + midPt.tx * 12 + midPt.rx * 55,
          0,
          midPt.z + midPt.tz * 12 + midPt.rz * 55
        );
        ferry.rotation.y = yaw + Math.PI / 2;
        chunk.add(ferry);
        this.riverBoats.push({
          mesh: ferry,
          baseX: ferry.position.x,
          baseZ: ferry.position.z,
          rx: midPt.rx,
          rz: midPt.rz,
          phase: 1.4,
          speed: 0.32
        });
      }

      // Riverbank Reeds
      [-82, 82].forEach((alongOff) => {
        [-45, -95, 45, 95].forEach((sideOff) => {
          const rx = midPt.x + midPt.tx * alongOff + midPt.rx * sideOff;
          const rz = midPt.z + midPt.tz * alongOff + midPt.rz * sideOff;
          if (this.isClearOfAllRoads(rx, rz, 4.0)) {
            const reed = createReedCluster();
            reed.position.set(rx, 0, rz);
            chunk.add(reed);
          }
        });
      });

      // Bridge Truss, Box-Girder Deck, Streetlamps & Piers
      if (!edge.ferry) {
        const isKeane = edge.bridge.indexOf('Keane') >= 0;
        const steelMat = new THREE.MeshStandardMaterial({
          color: isKeane ? 0xb91c1c : isJamuna ? 0x1d4ed8 : 0x475569,
          metalness: 0.6,
          roughness: 0.35
        });
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
        const startIdx = Math.floor(sLen * (isMega ? 0.27 : 0.32));
        const endIdx = Math.floor(sLen * (isMega ? 0.73 : 0.68));

        for (let i = startIdx; i <= endIdx; i += 2) {
          const pt = edge.samples[i];
          const sYaw = Math.atan2(-pt.tx, -pt.tz);
          [-7.8, 7.8].forEach((sideOff) => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.35, 16), steelMat);
            rail.position.set(pt.x + pt.rx * sideOff, pt.y + 0.65, pt.z + pt.rz * sideOff);
            rail.rotation.y = sYaw;
            chunk.add(rail);
            this.addCollider({ x: rail.position.x, z: rail.position.z, radius: 1.4 });
          });

          // Jamuna/Padma box-girder underside & signature golden bridge lights
          if (isMega) {
            const girder = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.25, 16), concreteMat);
            girder.position.set(pt.x, pt.y - 0.68, pt.z);
            girder.rotation.y = sYaw;
            chunk.add(girder);
          }

          if (i % 4 === 0) {
            if (!isJamuna) {
              const arch = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.55, 0.75), steelMat);
              arch.position.set(pt.x, pt.y + 5.7, pt.z);
              arch.rotation.y = sYaw;
              chunk.add(arch);
            }
            if (isMega) {
              // Jamuna & Padma Bridges: twin highway lamp posts along both railings
              [-7.6, 7.6].forEach((sideOff) => {
                this.addStreetLight(
                  chunk,
                  pt.x + pt.rx * sideOff,
                  pt.y + 0.5,
                  pt.z + pt.rz * sideOff,
                  sYaw + (sideOff > 0 ? Math.PI : 0),
                  0.45
                );
              });
            } else {
              // Standard highway river bridges: alternating railing lamps
              const bSide = (i % 8 === 0) ? 7.6 : -7.6;
              this.addStreetLight(
                chunk,
                pt.x + pt.rx * bSide,
                pt.y + 0.5,
                pt.z + pt.rz * bSide,
                sYaw + (bSide > 0 ? Math.PI : 0),
                0.25
              );
            }

            [-7.4, 7.4].forEach((sideOff) => {
              const pierH = Math.max(4, pt.y + 3.2);
              const pier = new THREE.Mesh(new THREE.BoxGeometry(1.15, pierH, 1.35), concreteMat);
              pier.position.set(pt.x + pt.rx * sideOff, pt.y - pierH * 0.5 - 0.2, pt.z + pt.rz * sideOff);
              pier.rotation.y = sYaw;
              chunk.add(pier);
            });
          }
        }

        // Overhead Bengali Bridge Approach Sign Gantries
        const signFracs = isJamuna ? [0.29, 0.71] : [0.31];
        signFracs.forEach((sFrac) => {
          const gPt = edge.samples[Math.floor(sLen * sFrac)];
          const gYaw = Math.atan2(-gPt.tx, -gPt.tz);
          const gantry = createBridgeArchSign(
            edge.bridge,
            isJamuna ? 'বঙ্গবন্ধু যমুনা সেতু • ৪.৮ কি.মি. • JAMUNA BRIDGE' : 'নদীর উপর সেতু • HIGHWAY RIVER BRIDGE',
            isJamuna ? 0x1d4ed8 : 0x047857
          );
          gantry.position.set(gPt.x, gPt.y, gPt.z);
          gantry.rotation.y = gYaw;
          chunk.add(gantry);
        });
      } else {
        // Ferry Ghat Pontoon Signboard
        const ghatTex = global.BDTextures.createSignTexture('#0369a1', '#fbbf24', '#ffffff', 'বিআইডব্লিউটিসি ফেরি ঘাট', `${edge.bridge}`);
        const ghatSign = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.8), new THREE.MeshBasicMaterial({ map: ghatTex, side: THREE.DoubleSide }));
        ghatSign.position.set(midPt.x - midPt.rx * 9.5, midPt.y + 3.2, midPt.z - midPt.rz * 9.5);
        ghatSign.rotation.y = yaw;
        chunk.add(ghatSign);
      }

      // Toll Gate(s) / Ghat Ticket Plaza (East & West Toll Plazas for Jamuna Bridge)
      const tollSpecs = edge.doubleToll
        ? [
            { t: 0.21, idSuffix: 'toll', label: `${edge.bridge} (পূর্ব টোল)` },
            { t: 0.79, idSuffix: 'toll_west', label: `${edge.bridge} (পশ্চিম টোল)` }
          ]
        : [{ t: 0.24, idSuffix: 'toll', label: edge.bridge }];

      tollSpecs.forEach((ts) => {
        const tollIdx = Math.floor(sLen * ts.t);
        const tollPt = edge.samples[tollIdx];
        const tollYaw = Math.atan2(-tollPt.tx, -tollPt.tz);
        const toll = createTollPlaza(ts.label);
        toll.group.position.set(tollPt.x, tollPt.y, tollPt.z);
        toll.group.rotation.y = tollYaw;
        chunk.add(toll.group);
        this.tollGates.push({
          id: `${edge.id}_${ts.idSuffix}`,
          bridgeName: ts.label,
          fee: edge.toll || 220,
          x: tollPt.x,
          z: tollPt.z,
          armPivot: toll.armPivot,
          cooldown: 0,
          armAngle: 0
        });

        const tollPool = new THREE.Mesh(new THREE.CircleGeometry(10.5, 16), this.streetLampPoolMat);
        tollPool.rotation.x = -Math.PI / 2;
        tollPool.position.set(tollPt.x, tollPt.y + 0.08, tollPt.z);
        chunk.add(tollPool);
        [-9.2, 9.2].forEach((sideOff) => {
          this.addStreetLight(
            chunk,
            tollPt.x + tollPt.rx * sideOff,
            tollPt.y,
            tollPt.z + tollPt.rz * sideOff,
            tollYaw + (sideOff > 0 ? Math.PI : 0),
            0.55
          );
        });
      });

      this.bridgeZones.push({ x: midPt.x, z: midPt.z, radius: isMega ? 185 : 140, name: edge.bridge });
      this.registerChunk(midPt.x, midPt.z, chunk);
    }

    buildRoadEventsOnEdge(edge) {
      const sLen = edge.samples.length;
      if (sLen < 4) return;
      const midPt = edge.samples[Math.floor(sLen * 0.5)];
      const chunk = new THREE.Group();

      // Speed Breakers (2 per road)
      [0.18, 0.82].forEach((tFrac) => {
        const pt = edge.samples[Math.floor(sLen * tFrac)];
        const yaw = Math.atan2(-pt.tx, -pt.tz);
        const bump = new THREE.Mesh(
          new THREE.BoxGeometry(edge.halfW * 1.9, 0.16, 0.85),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7 })
        );
        bump.position.set(pt.x, pt.y + 0.05, pt.z);
        bump.rotation.y = yaw;
        chunk.add(bump);
        this.speedBumps.push({ x: pt.x, z: pt.z });
      });

      // Highway Construction Zone on major trunk highways
      if (!edge.bridge && edge.type === 'highway' && sLen > 24) {
        const cPt = edge.samples[Math.floor(sLen * 0.36)];
        const cYaw = Math.atan2(-cPt.tx, -cPt.tz);
        const hazardMat = new THREE.MeshBasicMaterial({ map: global.BDTextures.createHazardStripeTexture() });
        const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
        for (let k = -2; k <= 2; k++) {
          const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.45), hazardMat);
          barrier.position.set(
            cPt.x + cPt.rx * 3.8 + cPt.tx * k * 4.5,
            cPt.y + 0.5,
            cPt.z + cPt.rz * 3.8 + cPt.tz * k * 4.5
          );
          barrier.rotation.y = cYaw;
          chunk.add(barrier);
          this.addCollider({ x: barrier.position.x, z: barrier.position.z, radius: 1.3 });

          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 6), coneMat);
          cone.position.set(
            cPt.x + cPt.rx * 1.8 + cPt.tx * k * 4.5,
            cPt.y + 0.38,
            cPt.z + cPt.rz * 1.8 + cPt.tz * k * 4.5
          );
          chunk.add(cone);
        }
        this.constructionZones.push({ x: cPt.x, z: cPt.z, radius: 22 });
      }

      // Broken Road Patch on selected roads
      if (edge.type === 'village' || edge.type === 'regional') {
        const bPt = edge.samples[Math.floor(sLen * 0.64)];
        const bYaw = Math.atan2(-bPt.tx, -bPt.tz);
        const brokenMat = new THREE.MeshStandardMaterial({
          color: 0x57412d,
          roughness: 0.98,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        });
        const brokenPatch = new THREE.Mesh(new THREE.PlaneGeometry(edge.halfW * 1.75, 18), brokenMat);
        brokenPatch.rotation.x = -Math.PI / 2;
        brokenPatch.rotation.z = -bYaw;
        brokenPatch.position.set(bPt.x, bPt.y + 0.03, bPt.z);
        chunk.add(brokenPatch);
        this.brokenZones.push({ x: bPt.x, z: bPt.z, radius: 11 });
      }

      // Highway Route Signboard showing real Highway Code (N1..N8)
      if (edge.highwayCode && sLen > 8) {
        const sPt = edge.samples[Math.floor(sLen * 0.14)];
        const sYaw = Math.atan2(-sPt.tx, -sPt.tz);
        const rx = sPt.x - sPt.rx * (edge.halfW + 3.2);
        const rz = sPt.z - sPt.rz * (edge.halfW + 3.2);
        if (this.isClearOfAllRoads(rx, rz, 1.5)) {
          const signTex = global.BDTextures.createSignTexture('#065f46', '#ffffff', '#fde68a', `${edge.highwayCode} • ${BANGLADESH_LOCATIONS[edge.to].nameBn}`, `${edge.name}`);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.8), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
          sign.position.set(rx, sPt.y + 3.2, rz);
          sign.rotation.y = sYaw;
          chunk.add(sign);
        }
      }

      // Register road events chunk at midpoint
      this.registerChunk(midPt.x, midPt.z, chunk);

      // Sub-chunked Trees, Village Houses, Roadside Shops & Urban Buildings along BOTH sides of the road
      // Using 240-unit sub-chunks ensures roadside houses & trees stay visible along long highways!
      const subChunks = new Map();
      const getSubChunk = (idx) => {
        const approxDist = (idx / Math.max(1, sLen - 1)) * edge.dist;
        const bucket = Math.floor(approxDist / 240);
        let entry = subChunks.get(bucket);
        if (!entry) {
          const cIdx = Math.min(sLen - 1, Math.max(0, Math.floor(((bucket + 0.5) * 240 / Math.max(1, edge.dist)) * (sLen - 1))));
          const cPt = edge.samples[cIdx];
          entry = { cx: cPt.x, cz: cPt.z, group: new THREE.Group() };
          subChunks.set(bucket, entry);
        }
        return entry.group;
      };

      const sampleSpacing = edge.dist / Math.max(1, sLen - 1);
      const step = Math.max(1, Math.round(30 / Math.max(6, sampleSpacing)));
      const p1Biome = edge.p1.biome || 'delta_plains';
      const p2Biome = edge.p2.biome || 'delta_plains';
      const isHillyCorridor = p1Biome === 'haor_hills_sylhet'
        || p2Biome === 'haor_hills_sylhet'
        || p1Biome === 'port_hills_ctg'
        || p2Biome === 'port_hills_ctg'
        || edge.from === 'cumilla'
        || edge.to === 'cumilla';
      const treeTypes = p1Biome === 'mangrove_delta'
        ? ['mangrove', 'palm', 'mangrove', 'bamboo']
        : p1Biome === 'coast_beach'
          ? ['palm', 'palm', 'banana', 'krishnachura']
          : ['palm', 'banyan', 'bamboo', 'banana', 'krishnachura'];

      const advisorySigns = [
        ['ধীরে চলুন', 'সামনে জনবসতি ও বাজার'],
        ['বাম দিক ঘেঁষে চলুন', 'KEEP LEFT • SAFE DRIVE'],
        ['দুর্ঘটনাপ্রবণ এলাকা', 'সতর্কতার সাথে বাস চালান'],
        ['সেতু ও বাঁক সাবধান', 'REDUCE SPEED AHEAD']
      ];

      const pal = getBuildingPalette();

      for (let i = 1, iter = 0; i < sLen - 1; i += step, iter++) {
        const pt = edge.samples[i];
        if (edge.bridge && i > sLen * 0.26 && i < sLen * 0.74) continue;
        const subGroup = getSubChunk(i);
        const yaw = Math.atan2(-pt.tx, -pt.tz);
        const distFromStart = (i / Math.max(1, sLen - 1)) * edge.dist;
        const distFromEnd = edge.dist - distFromStart;
        const nearTown = edge.type === 'city'
          || (distFromStart < 210 && (edge.p1.isDistrict || edge.p1.isTerminal))
          || (distFromEnd < 210 && (edge.p2.isDistrict || edge.p2.isTerminal));

        // Trees on both sides (diverse palms, banyans, bamboo groves, krishnachura, banana)
        const treeSide = iter % 2 === 0 ? 1 : -1;
        const treeOff = edge.halfW + 5.8 + ((iter * 5) % 8);
        const tx = pt.x + pt.rx * treeSide * treeOff;
        const tz = pt.z + pt.rz * treeSide * treeOff;
        if (this.isClearOfAllRoads(tx, tz, 2.2) && this.isClearOfPlazas(tx, tz, 4)) {
          const tree = createTree(treeTypes[iter % treeTypes.length]);
          tree.position.set(tx, pt.y - 0.04, tz);
          tree.rotation.y = (iter * 1.1) % (Math.PI * 2);
          subGroup.add(tree);
          this.treeGroups.push(tree);
        }

        // Secondary tree on opposite side in lush rural areas
        if (!nearTown && iter % 2 === 0) {
          const oppSide = -treeSide;
          const ox = pt.x + pt.rx * oppSide * (edge.halfW + 6.5 + (iter % 5));
          const oz = pt.z + pt.rz * oppSide * (edge.halfW + 6.5 + (iter % 5));
          if (this.isClearOfAllRoads(ox, oz, 2.2) && this.isClearOfPlazas(ox, oz, 4)) {
            const tree2 = createTree(treeTypes[(iter + 2) % treeTypes.length]);
            tree2.position.set(ox, pt.y - 0.04, oz);
            tree2.rotation.y = (iter * 2.3) % (Math.PI * 2);
            subGroup.add(tree2);
            this.treeGroups.push(tree2);
          }
        }

        // Roadside Houses, Tea Stalls & Urban Buildings on both sides
        [-1, 1].forEach((side, sIdx) => {
          if (!nearTown && ((iter + sIdx) % 3 === 1)) return;
          const bOff = edge.halfW + 11.2 + ((iter * 7 + sIdx * 5) % 9);
          const hx = pt.x + pt.rx * side * bOff;
          const hz = pt.z + pt.rz * side * bOff;
          if (!this.isClearOfAllRoads(hx, hz, 5.2) || !this.isClearOfPlazas(hx, hz, 6) || !this.isClearOfColliders(hx, hz, 4.6)) {
            return;
          }

          const seed = iter * 3 + (side > 0 ? 1 : 0);
          let built;
          if (nearTown) {
            built = seed % 3 === 0 ? createRoadsideShop(seed) : createUrbanBuilding(seed);
          } else if (seed % 5 === 0) {
            built = createRoadsideShop(seed);
          } else if (edge.type === 'highway' && seed % 7 === 0) {
            built = createUrbanBuilding(seed);
          } else {
            built = createVillageHouse(seed);
          }

          built.group.position.set(hx, pt.y - 0.04, hz);
          built.group.rotation.y = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          subGroup.add(built.group);
          this.addCollider({ x: hx, z: hz, radius: built.radius });

          // Second row homestead house or village pond (পুকুর) behind roadside houses
          if (!nearTown && seed % 2 === 0) {
            const hx2 = pt.x + pt.rx * side * (bOff + 12.0);
            const hz2 = pt.z + pt.rz * side * (bOff + 12.0);
            if (this.isClearOfAllRoads(hx2, hz2, 5.2) && this.isClearOfPlazas(hx2, hz2, 6) && this.isClearOfColliders(hx2, hz2, 5.2)) {
              if (seed % 6 === 0) {
                const pond = createVillagePond(seed);
                pond.position.set(hx2, pt.y - 0.08, hz2);
                pond.rotation.y = yaw;
                subGroup.add(pond);
              } else {
                const backHouse = createVillageHouse(seed + 2);
                backHouse.group.position.set(hx2, pt.y - 0.04, hz2);
                backHouse.group.rotation.y = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
                subGroup.add(backHouse.group);
                this.addCollider({ x: hx2, z: hz2, radius: backHouse.radius });
              }
            }
          }
        });

        // Roadside Paddy / Mustard Field Patches (ধানক্ষেত ও সরিষা ক্ষেত) in rural areas
        if (!nearTown && iter % 2 === 0) {
          const fSide = iter % 4 === 0 ? -1 : 1;
          const fx = pt.x + pt.rx * fSide * (edge.halfW + 24);
          const fz = pt.z + pt.rz * fSide * (edge.halfW + 24);
          if (this.isClearOfAllRoads(fx, fz, 8.5) && this.isClearOfPlazas(fx, fz, 10) && this.isClearOfColliders(fx, fz, 7.5)) {
            const paddy = createPaddyFieldPatch(iter);
            paddy.position.set(fx, pt.y - 0.09, fz);
            paddy.rotation.y = yaw;
            subGroup.add(paddy);
          }
        }

        // Brick Kiln Chimney (ইটভাটার চিমনি) occasionally visible over rural highway fields
        if (!nearTown && edge.type === 'highway' && iter % 9 === 4) {
          const kSide = iter % 2 === 0 ? 1 : -1;
          const kx = pt.x + pt.rx * kSide * (edge.halfW + 44);
          const kz = pt.z + pt.rz * kSide * (edge.halfW + 44);
          if (this.isClearOfAllRoads(kx, kz, 14) && this.isClearOfPlazas(kx, kz, 16) && this.isClearOfColliders(kx, kz, 10)) {
            const kiln = createBrickKiln();
            kiln.position.set(kx, pt.y - 0.06, kz);
            subGroup.add(kiln);
          }
        }

        // Rolling Green Hills in Sylhet / Chattogram / Cumilla regions
        if (isHillyCorridor && iter % 4 === 0) {
          const hSide = iter % 8 === 0 ? 1 : -1;
          const hillX = pt.x + pt.rx * hSide * (edge.halfW + 64);
          const hillZ = pt.z + pt.rz * hSide * (edge.halfW + 64);
          if (this.isClearOfAllRoads(hillX, hillZ, 24) && this.isClearOfPlazas(hillX, hillZ, 24)) {
            const hr = 24 + (iter % 3) * 8;
            const hh = 11 + (iter % 4) * 3.5;
            const hill = new THREE.Mesh(
              new THREE.ConeGeometry(hr, hh, 7),
              iter % 2 === 0 ? pal.hillMat : pal.hillLightMat
            );
            hill.position.set(hillX, pt.y + hh * 0.38 - 1.2, hillZ);
            hill.rotation.y = iter * 0.7;
            subGroup.add(hill);
          }
        }

        // Kilometer Milestone Posts & Bengali Road Advisory Signboards on highways
        if (edge.type === 'highway' && iter % 4 === 0) {
          const kmSide = -1;
          const kx = pt.x + pt.rx * kmSide * (edge.halfW + 1.5);
          const kz = pt.z + pt.rz * kmSide * (edge.halfW + 1.5);
          if (this.isClearOfAllRoads(kx, kz, 0.5)) {
            const kmLeft = Math.max(1, Math.round(distFromEnd / 40));
            const kmPost = createKilometerPost(`${kmLeft} km`);
            kmPost.position.set(kx, pt.y, kz);
            kmPost.rotation.y = yaw;
            subGroup.add(kmPost);
          }

          if (iter % 8 === 0) {
            const adv = advisorySigns[(iter / 8) % advisorySigns.length];
            const ax = pt.x - pt.rx * (edge.halfW + 2.8);
            const az = pt.z - pt.rz * (edge.halfW + 2.8);
            if (this.isClearOfAllRoads(ax, az, 1.0)) {
              const advTex = global.BDTextures.createSignTexture('#065f46', '#fbbf24', '#ffffff', adv[0], adv[1]);
              const advBoard = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.35), new THREE.MeshBasicMaterial({ map: advTex, side: THREE.DoubleSide }));
              advBoard.position.set(ax, pt.y + 2.8, az);
              advBoard.rotation.y = yaw;
              subGroup.add(advBoard);
            }
          }
        }

        // Roadside Concrete Electric Utility Poles (বিদ্যুতের খুঁটি)
        if (iter % 2 === 0) {
          const uSide = iter % 4 === 0 ? -1 : 1;
          const ux = pt.x + pt.rx * uSide * (edge.halfW + 2.4);
          const uz = pt.z + pt.rz * uSide * (edge.halfW + 2.4);
          if (this.isClearOfAllRoads(ux, uz, 0.8)) {
            const pole = createUtilityPole();
            pole.position.set(ux, pt.y - 0.03, uz);
            pole.rotation.y = yaw;
            subGroup.add(pole);
          }
        }

        // Streetlight poles along city streets, national highways & regional corridors
        const lampStep = edge.type === 'city' ? 1 : edge.type === 'highway' ? 2 : 3;
        if (iter % lampStep === (lampStep === 1 ? 0 : 1)) {
          const lSide = (Math.floor(iter / lampStep) % 2 === 0) ? 1 : -1;
          const lx = pt.x + pt.rx * lSide * (edge.halfW + 1.65);
          const lz = pt.z + pt.rz * lSide * (edge.halfW + 1.65);
          if (this.isClearOfAllRoads(lx, lz, 0.7)) {
            this.addStreetLight(
              subGroup,
              lx,
              pt.y,
              lz,
              yaw + (lSide > 0 ? Math.PI : 0),
              edge.type === 'city' ? 0.45 : edge.type === 'highway' ? 0.35 : 0.15
            );
          }
        }
      }

      subChunks.forEach((entry) => {
        this.registerChunk(entry.cx, entry.cz, entry.group);
      });
    }

    isClearOfAllRoads(x, z, clearance) {
      const nearby = this.queryGrid3x3(this.sampleGrid, x, z);
      for (let i = 0; i < nearby.length; i++) {
        const s = nearby[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const minD = s.halfW + clearance;
        if (dx * dx + dz * dz < minD * minD) return false;
      }
      return true;
    }

    isClearOfPlazas(x, z, extra) {
      for (let i = 0; i < this.plazaZones.length; i++) {
        const pz = this.plazaZones[i];
        const minD = pz.r + (extra || 0);
        const dx = x - pz.x;
        const dz = z - pz.z;
        if (dx * dx + dz * dz < minD * minD) return false;
      }
      return true;
    }

    isClearOfColliders(x, z, extra) {
      const nearby = this.queryGrid3x3(this.colliderGrid, x, z);
      for (let i = 0; i < nearby.length; i++) {
        const c = nearby[i];
        const minD = c.radius + (extra || 2.5);
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < minD * minD) return false;
      }
      return true;
    }

    findClearSpotAround(cx, cz, radius, clearance, startAngle = 0) {
      for (let step = 0; step < 24; step++) {
        const ang = startAngle + (step * Math.PI * 2) / 24;
        const x = cx + Math.cos(ang) * radius;
        const z = cz + Math.sin(ang) * radius;
        if (this.isClearOfAllRoads(x, z, clearance)) {
          return { x, z, ang };
        }
      }
      return {
        x: cx + Math.cos(startAngle) * (radius + 14),
        z: cz + Math.sin(startAngle) * (radius + 14),
        ang: startAngle
      };
    }

    buildCityDistrict(loc, idx, cityMat) {
      const chunk = new THREE.Group();
      const baseElev = computeElevationAtWorld(loc.x, loc.z, false, 0, 0) - 0.04;

      // Biome ground accent pad (beach sand, tea green, dense Dhaka urban concrete)
      if (loc.biome === 'coast_beach' && global.BDMapTiles) {
        const beachMat = new THREE.MeshStandardMaterial({ color: 0xe6c88a, roughness: 0.92 });
        const beachPad = new THREE.Mesh(new THREE.CircleGeometry(140, 20), beachMat);
        beachPad.rotation.x = -Math.PI / 2;
        beachPad.position.set(loc.x, baseElev - 0.01, loc.z);
        chunk.add(beachPad);
      } else if (loc.biome === 'haor_hills_sylhet' || loc.biome === 'port_hills_ctg') {
        const hillMat = new THREE.MeshStandardMaterial({ color: 0x1e5631, roughness: 0.92 });
        const hill = new THREE.Mesh(new THREE.ConeGeometry(48, 16, 7), hillMat);
        hill.position.set(loc.x + 85, baseElev + 6, loc.z - 85);
        chunk.add(hill);
      }

      const isHub = loc.category === 'junction' || loc.category === 'market';

      // City Plaza Asphalt Pad
      const padSize = loc.isTerminal ? 58 : isHub ? 50 : 42;
      const plazaMat = cityMat.clone();
      plazaMat.polygonOffset = true;
      plazaMat.polygonOffsetFactor = -2;
      plazaMat.polygonOffsetUnits = -2;
      this.wettableRoadMats.push(plazaMat);
      const plaza = new THREE.Mesh(new THREE.PlaneGeometry(padSize, padSize), plazaMat);
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.set(loc.x, baseElev + 0.055, loc.z);
      plaza.receiveShadow = true;
      chunk.add(plaza);

      // Painted Golchottor / Mor intersection markings (flat, zero collision so buses drive smoothly)
      if (isHub) {
        const outerMark = new THREE.Mesh(
          new THREE.RingGeometry(6.2, 7.6, 24),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
        );
        outerMark.rotation.x = -Math.PI / 2;
        outerMark.position.set(loc.x, baseElev + 0.072, loc.z);
        chunk.add(outerMark);

        const innerMark = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 3.6, 20),
          new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
        );
        innerMark.rotation.x = -Math.PI / 2;
        innerMark.position.set(loc.x, baseElev + 0.074, loc.z);
        chunk.add(innerMark);

        const pbSpot = this.findClearSpotAround(loc.x, loc.z, 17, 3.6, 0.9);
        const policeBox = createTrafficPoliceBox(loc.nameBn);
        policeBox.group.position.set(pbSpot.x, baseElev, pbSpot.z);
        policeBox.group.rotation.y = Math.atan2(loc.x - pbSpot.x, loc.z - pbSpot.z);
        chunk.add(policeBox.group);
        this.addCollider({ x: pbSpot.x, z: pbSpot.z, radius: policeBox.radius });
      }

      // Bus Terminal / Regional Stop Shelter
      const termSpot = this.findClearSpotAround(loc.x, loc.z, 21, 5.8, Math.PI * 0.75);
      const termMesh = createBusTerminalMesh(
        loc.nameBn,
        `${loc.nameEn} ${loc.isTerminal ? 'Bus Terminal' : 'Bus Stop'}`,
        loc.isTerminal
      );
      termMesh.position.set(termSpot.x, baseElev, termSpot.z);
      termMesh.rotation.y = Math.atan2(loc.x - termSpot.x, loc.z - termSpot.z);
      chunk.add(termMesh);
      this.addCollider({ x: termSpot.x, z: termSpot.z, radius: 5.2 });

      const dirToCenterX = (loc.x - termSpot.x) / Math.max(1, Math.hypot(loc.x - termSpot.x, loc.z - termSpot.z));
      const dirToCenterZ = (loc.z - termSpot.z) / Math.max(1, Math.hypot(loc.x - termSpot.x, loc.z - termSpot.z));
      const bayX = termSpot.x + dirToCenterX * 9.5;
      const bayZ = termSpot.z + dirToCenterZ * 9.5;
      const bayRing = new THREE.Mesh(
        new THREE.RingGeometry(3.6, 4.3, 28),
        new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
      );
      bayRing.rotation.x = -Math.PI / 2;
      bayRing.position.set(bayX, baseElev + 0.085, bayZ);
      chunk.add(bayRing);

      this.busStops.push({
        id: loc.id,
        nameEn: loc.nameEn,
        nameBn: loc.nameBn,
        division: loc.division,
        isTerminal: loc.isTerminal,
        isDistrict: loc.isDistrict,
        x: bayX,
        z: bayZ,
        y: baseElev,
        shelterX: termSpot.x,
        shelterZ: termSpot.z,
        ringMesh: bayRing
      });

      // Iconic Regional / Dhaka Landmark Reference Model
      if (loc.landmarkType || loc.isDistrict) {
        const lSpot = this.findClearSpotAround(loc.x, loc.z, 44, 9.5, 1.15);
        const lm = createIconicLandmark(loc.landmarkType || 'district_tower', loc);
        lm.group.position.set(lSpot.x, baseElev, lSpot.z);
        lm.group.rotation.y = Math.atan2(loc.x - lSpot.x, loc.z - lSpot.z);
        chunk.add(lm.group);
        this.addCollider({ x: lSpot.x, z: lSpot.z, radius: lm.radius });
      }

      if (loc.hasMarket) {
        const spot = this.findClearSpotAround(loc.x, loc.z, 31, 7.6, -0.5);
        const mkt = createLandmarkBuilding('market', `${loc.nameEn} বাজার`);
        mkt.group.position.set(spot.x, baseElev, spot.z);
        mkt.group.rotation.y = Math.atan2(loc.x - spot.x, loc.z - spot.z);
        chunk.add(mkt.group);
        this.addCollider({ x: spot.x, z: spot.z, radius: mkt.radius });
      }
      if (loc.hasMosque) {
        const spot = this.findClearSpotAround(loc.x, loc.z, 33, 6.6, 0.7);
        const msq = createLandmarkBuilding('mosque', `${loc.nameEn} জামে মসজিদ`);
        msq.group.position.set(spot.x, baseElev, spot.z);
        msq.group.rotation.y = Math.atan2(loc.x - spot.x, loc.z - spot.z);
        chunk.add(msq.group);
        this.addCollider({ x: spot.x, z: spot.z, radius: msq.radius });
      }
      if (loc.hasHospital) {
        const spot = this.findClearSpotAround(loc.x, loc.z, 35, 7.0, 2.1);
        const hsp = createLandmarkBuilding('hospital', `${loc.nameEn} হাসপাতাল`);
        hsp.group.position.set(spot.x, baseElev, spot.z);
        hsp.group.rotation.y = Math.atan2(loc.x - spot.x, loc.z - spot.z);
        chunk.add(hsp.group);
        this.addCollider({ x: spot.x, z: spot.z, radius: hsp.radius });
      }
      if (loc.hasSchool) {
        const spot = this.findClearSpotAround(loc.x, loc.z, 34, 6.8, -2.1);
        const sch = createLandmarkBuilding('school', `${loc.nameEn} স্কুল`);
        sch.group.position.set(spot.x, baseElev, spot.z);
        sch.group.rotation.y = Math.atan2(loc.x - spot.x, loc.z - spot.z);
        chunk.add(sch.group);
        this.addCollider({ x: spot.x, z: spot.z, radius: sch.radius });
      }

      // City Bengali Signboard with real division & lat/lon
      const signSpot = this.findClearSpotAround(loc.x, loc.z, 17, 2.2, 0.15);
      const coordTxt = loc.lat ? `${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E` : 'BANGLADESH';
      const signTex = global.BDTextures.createSignTexture('#065f46', '#ffffff', '#ffffff', loc.nameBn, `${loc.nameEn.toUpperCase()} • ${coordTxt}`);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2.2), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
      sign.position.set(signSpot.x, baseElev + 4.0, signSpot.z);
      chunk.add(sign);

      // Fuel Pump & Service Garage at major terminals and every 3rd district
      if (loc.isTerminal || idx % 3 === 0) {
        const fSpot = this.findClearSpotAround(loc.x, loc.z, 22, 4.8, -1.2);
        const pumpGroup = this.createFuelDispenserGroup(`${loc.nameEn} পাম্প`);
        pumpGroup.position.set(fSpot.x, baseElev, fSpot.z);
        chunk.add(pumpGroup);

        const zoneRing = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 3.2, 20),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
        );
        zoneRing.rotation.x = -Math.PI / 2;
        zoneRing.position.set(fSpot.x, baseElev + 0.085, fSpot.z + 4);
        chunk.add(zoneRing);
        this.fuelStations.push({ x: fSpot.x, z: fSpot.z + 4, name: `${loc.nameEn} Fuel Pump` });

        if (loc.isTerminal || idx % 6 === 0) {
          const gSpot = this.findClearSpotAround(loc.x, loc.z, 26, 4.5, 1.7);
          const garRing = new THREE.Mesh(
            new THREE.RingGeometry(2.5, 3.1, 20),
            new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
          );
          garRing.rotation.x = -Math.PI / 2;
          garRing.position.set(gSpot.x, baseElev + 0.085, gSpot.z);
          chunk.add(garRing);
          this.garages.push({ x: gSpot.x, z: gSpot.z, name: `${loc.nameEn} City Garage` });
        }
      }

      if (loc.isTerminal || idx % 3 === 0) {
        const tl = createTrafficLightPole();
        tl.group.position.set(loc.x - 9, baseElev, loc.z + 11);
        chunk.add(tl.group);
        this.trafficLights.push({
          x: loc.x,
          z: loc.z + 11,
          phaseOffset: idx * 3.5,
          state: 'green',
          controller: tl
        });
      }

      // Dense city plaza & urban avenue streetlights
      const cityLampCount = (loc.isTerminal || loc.isDistrict || isHub) ? 8 : 6;
      for (let lIdx = 0; lIdx < cityLampCount; lIdx++) {
        const ang = (lIdx * Math.PI * 2) / cityLampCount + 0.35;
        const rad = loc.isTerminal ? 23 : 19;
        const lSpot = this.findClearSpotAround(loc.x, loc.z, rad, 1.1, ang);
        this.addStreetLight(
          chunk,
          lSpot.x,
          baseElev,
          lSpot.z,
          Math.atan2(loc.x - lSpot.x, loc.z - lSpot.z) - Math.PI / 2,
          0.55
        );
      }
      if (loc.isTerminal || loc.isDistrict) {
        [0.45, 2.02, 3.59, 5.16].forEach((ang) => {
          const oSpot = this.findClearSpotAround(loc.x, loc.z, 34, 1.2, ang);
          this.addStreetLight(
            chunk,
            oSpot.x,
            baseElev,
            oSpot.z,
            Math.atan2(loc.x - oSpot.x, loc.z - oSpot.z) - Math.PI / 2,
            0.4
          );
        });
      }

      // Surrounding City Buildings, Bazaar Shops & Houses for authentic Bangladeshi town & mor skyline
      const ringCount = (loc.isTerminal || loc.isDistrict || isHub) ? 14 : 6;
      for (let b = 0; b < ringCount; b++) {
        const ang = (b * Math.PI * 2) / ringCount + (idx % 5) * 0.25;
        const rad = isHub
          ? (b % 2 === 0 ? 38 + (b % 3) * 6 : 58 + (b % 3) * 7)
          : (b % 2 === 0 ? 52 + (b % 3) * 8 : 74 + (b % 3) * 8);
        const bx = loc.x + Math.cos(ang) * rad;
        const bz = loc.z + Math.sin(ang) * rad;
        if (this.isClearOfAllRoads(bx, bz, 6.0) && this.isClearOfColliders(bx, bz, 5.2)) {
          const bldg = (isHub ? b % 2 === 0 : b % 4 === 0)
            ? createRoadsideShop(idx + b)
            : (loc.isTerminal || loc.isDistrict || b % 3 === 0)
              ? createUrbanBuilding(idx + b)
              : createVillageHouse(idx + b);
          bldg.group.position.set(bx, baseElev, bz);
          bldg.group.rotation.y = Math.atan2(loc.x - bx, loc.z - bz);
          chunk.add(bldg.group);
          this.addCollider({ x: bx, z: bz, radius: bldg.radius });
        }
      }

      this.registerChunk(loc.x, loc.z, chunk);
    }

    buildRainSystem() {
      this.rainPoints = { visible: false };
    }

    setTextureQuality(texQuality, maxAniso) {
      const targetAniso = texQuality === 'low' ? 1 : texQuality === 'medium' ? Math.min(2, maxAniso || 2) : Math.min(8, maxAniso || 4);
      for (let i = 0; i < this.anisotropyTextures.length; i++) {
        const t = this.anisotropyTextures[i];
        if (t) {
          t.anisotropy = targetAniso;
          t.needsUpdate = true;
        }
      }
    }

    setNightLights(levelOrBool) {
      const level = typeof levelOrBool === 'number'
        ? Math.max(0, Math.min(1, levelOrBool))
        : (levelOrBool ? 1 : 0);
      this.nightLightFactor = level;
      const lit = level > 0.04;

      if (this.streetLampBulbMat.emissive) {
        this.streetLampBulbMat.color.setHex(lit ? 0xfff3c4 : 0x64748b);
        this.streetLampBulbMat.emissive.setHex(lit ? 0xffcf70 : 0x000000);
        this.streetLampBulbMat.emissiveIntensity = level * 1.45;
      } else {
        this.streetLampBulbMat.color.setHex(lit ? 0xfef08a : 0x64748b);
      }

      this.streetLampPoolMat.opacity = level * 0.42;
      if (this.streetLampHaloMat) this.streetLampHaloMat.opacity = level * 0.72;
      if (this.streetLampConeMat) this.streetLampConeMat.opacity = level * 0.085;

      const p = getBuildingPalette();
      if (p.windowMat) {
        p.windowMat.emissive.setHex(lit ? 0xfbbf24 : 0x000000);
        p.windowMat.emissiveIntensity = level * 0.88;
      }

      if (level <= 0.02 && this.streetPointLights) {
        for (let i = 0; i < this.streetPointLights.length; i++) {
          this.streetPointLights[i].visible = false;
          this.streetPointLights[i].intensity = 0;
        }
      }
    }

    isNearRiver(x, z) {
      for (let i = 0; i < this.riverCenters.length; i++) {
        const rc = this.riverCenters[i];
        const dx = x - rc.x;
        const dz = z - rc.z;
        if (dx * dx + dz * dz <= rc.r * rc.r) return true;
      }
      return false;
    }

    setQuality(qualityPreset) {
      this.streamRadius = qualityPreset.streamRadius || 620;
      const ratio = qualityPreset.treeDensity || 1.0;
      for (let i = 0; i < this.treeGroups.length; i++) {
        this.treeGroups[i].visible = (i / this.treeGroups.length) <= ratio;
      }
    }

    updateStreaming(px, pz) {
      // Snap infinite ground plane subtly under player so grass repeats seamlessly everywhere
      if (this.groundMesh) {
        const snap = 400;
        const gx = Math.round(px / snap) * snap;
        const gz = Math.round(pz / snap) * snap;
        this.groundMesh.position.x = gx;
        this.groundMesh.position.z = gz;
      }

      const rSq = (this.streamRadius || 620) ** 2;
      for (let i = 0; i < this.streamChunks.length; i++) {
        const ch = this.streamChunks[i];
        const dx = px - ch.cx;
        const dz = pz - ch.cz;
        ch.group.visible = dx * dx + dz * dz <= rSq;
      }
    }

    update(elapsed, dt, playerX, playerZ) {
      this.updateStreaming(playerX, playerZ);

      // Snap dynamic 5-PointLight pool to nearest active streetlights at dusk/night/storm
      if (this.streetPointLights && this.streetPointLights.length) {
        const factor = this.nightLightFactor || 0;
        if (factor > 0.02) {
          const candidates = this.queryGrid3x3(this.streetLightGrid, playerX, playerZ);
          const count = this.streetPointLights.length;
          const bestD2 = [7225, 7225, 7225, 7225, 7225]; // max 85m range
          const bestLights = [null, null, null, null, null];

          for (let i = 0; i < candidates.length; i++) {
            const sl = candidates[i];
            const dx = sl.x - playerX;
            const dz = sl.z - playerZ;
            const d2 = dx * dx + dz * dz;
            if (d2 >= bestD2[count - 1]) continue;
            let slot = count - 1;
            while (slot > 0 && d2 < bestD2[slot - 1]) {
              bestD2[slot] = bestD2[slot - 1];
              bestLights[slot] = bestLights[slot - 1];
              slot--;
            }
            bestD2[slot] = d2;
            bestLights[slot] = sl;
          }

          for (let i = 0; i < count; i++) {
            const pl = this.streetPointLights[i];
            const sl = bestLights[i];
            if (sl) {
              pl.visible = true;
              pl.position.set(sl.x, sl.y + 5.8, sl.z);
              pl.intensity = (1.65 + (sl.boost || 0)) * factor;
            } else {
              pl.visible = false;
              pl.intensity = 0;
            }
          }
        } else {
          for (let i = 0; i < this.streetPointLights.length; i++) {
            this.streetPointLights[i].visible = false;
            this.streetPointLights[i].intensity = 0;
          }
        }
      }

      const rVisSq = 700 * 700;
      for (let i = 0; i < this.trafficLights.length; i++) {
        const tl = this.trafficLights[i];
        if ((tl.x - playerX) ** 2 + (tl.z - playerZ) ** 2 > rVisSq) continue;
        const cycle = (elapsed + tl.phaseOffset) % 16;
        const nextState = cycle < 7 ? 'green' : cycle < 9 ? 'yellow' : 'red';
        if (nextState !== tl.state) {
          tl.state = nextState;
          tl.controller.setState(nextState);
        }
      }

      for (let i = 0; i < this.waterMeshes.length; i++) {
        const w = this.waterMeshes[i];
        if (w.material.map) {
          w.material.map.offset.y = (elapsed * 0.03) % 1;
        }
      }
      for (let i = 0; i < this.riverBoats.length; i++) {
        const b = this.riverBoats[i];
        if ((b.baseX - playerX) ** 2 + (b.baseZ - playerZ) ** 2 > 950 * 950) continue;
        const drift = Math.sin(elapsed * b.speed * 0.25 + b.phase) * 75;
        b.mesh.position.x = b.baseX + b.rx * drift;
        b.mesh.position.z = b.baseZ + b.rz * drift;
      }

      for (let i = 0; i < this.tollGates.length; i++) {
        const tg = this.tollGates[i];
        if (tg.cooldown > 0) tg.cooldown -= dt;
        const dx = playerX - tg.x;
        const dz = playerZ - tg.z;
        if (dx * dx + dz * dz > 250 * 250) continue;
        const near = dx * dx + dz * dz < 225;
        const targetAngle = near ? Math.PI * 0.42 : 0;
        tg.armAngle += (targetAngle - tg.armAngle) * Math.min(1, 6 * dt);
        tg.armPivot.rotation.z = tg.armAngle;
      }
    }

    getSurfaceAt(x, z) {
      const candidates = this.queryGrid3x3(this.sampleGrid, x, z);
      let bestDistSq = Infinity;
      let bestSample = candidates[0] || this.roadSamples[0];

      for (let i = 0; i < candidates.length; i++) {
        const s = candidates[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestSample = s;
        }
      }

      const dist = Math.sqrt(bestDistSq);
      let surface = 'grass';
      let elevation = bestSample ? bestSample.y - 0.04 : 0;
      let speedLimit = 80;
      let isBridge = false;

      // Fast spatial check for nearby city plazas
      let inCity = false;
      const nearLocs = this.queryGrid3x3(this.locationGrid, x, z);
      for (let i = 0; i < nearLocs.length; i++) {
        const l = nearLocs[i];
        if (Math.abs(x - l.x) < 28 && Math.abs(z - l.z) < 28) {
          inCity = true;
          surface = 'asphalt';
          elevation = computeElevationAtWorld(l.x, l.z, false, 0, 0) - 0.04;
          speedLimit = 50;
          break;
        }
      }

      if (!inCity && bestSample && dist <= bestSample.halfW) {
        surface = bestSample.surface;
        elevation = bestSample.y;
        speedLimit = bestSample.speedLimit;
        isBridge = bestSample.isBridge;
      }

      let onSpeedBump = false;
      for (let i = 0; i < this.speedBumps.length; i++) {
        const sb = this.speedBumps[i];
        const dx = x - sb.x;
        const dz = z - sb.z;
        if (dx * dx + dz * dz < 16) {
          onSpeedBump = true;
          break;
        }
      }

      let isBrokenRoad = false;
      for (let i = 0; i < this.brokenZones.length; i++) {
        const bz = this.brokenZones[i];
        const dx = x - bz.x;
        const dz = z - bz.z;
        if (dx * dx + dz * dz < bz.radius * bz.radius) {
          isBrokenRoad = true;
          break;
        }
      }

      let inConstruction = false;
      for (let i = 0; i < this.constructionZones.length; i++) {
        const cz = this.constructionZones[i];
        const dx = x - cz.x;
        const dz = z - cz.z;
        if (dx * dx + dz * dz < cz.radius * cz.radius) {
          inConstruction = true;
          speedLimit = Math.min(speedLimit, 40);
          break;
        }
      }

      const lateralOffset = bestSample
        ? (x - bestSample.x) * bestSample.rx + (z - bestSample.z) * bestSample.rz
        : 0;

      return {
        surface,
        elevation,
        onSpeedBump,
        isBrokenRoad,
        inConstruction,
        isBridge,
        speedLimit,
        lateralOffset,
        nearestSample: bestSample,
        roadDist: dist
      };
    }

    getTrafficLightNear(x, z) {
      for (let i = 0; i < this.trafficLights.length; i++) {
        const tl = this.trafficLights[i];
        const dx = x - tl.x;
        const dz = z - tl.z;
        if (dx * dx + dz * dz < 169) return tl;
      }
      return null;
    }

    isAtFuelStation(x, z) {
      for (let i = 0; i < this.fuelStations.length; i++) {
        const fs = this.fuelStations[i];
        const dx = x - fs.x;
        const dz = z - fs.z;
        if (dx * dx + dz * dz < 42) return true;
      }
      return false;
    }

    getServiceZoneNear(x, z) {
      const checkList = (arr, kind) => {
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          const dx = x - item.x;
          const dz = z - item.z;
          if (dx * dx + dz * dz < 42) {
            return { kind, name: item.name || kind.toUpperCase(), x: item.x, z: item.z };
          }
        }
        return null;
      };
      return checkList(this.fuelStations, 'fuel')
        || checkList(this.garages, 'garage')
        || checkList(this.washStations, 'wash')
        || checkList(this.restStops, 'rest');
    }

    getNearestServiceStation(x, z, kind) {
      const map = {
        fuel: this.fuelStations,
        garage: this.garages,
        wash: this.washStations,
        rest: this.restStops
      };
      const list = kind ? (map[kind] || this.fuelStations) : [
        ...this.fuelStations.map((s) => ({ ...s, kind: 'fuel' })),
        ...this.garages.map((s) => ({ ...s, kind: 'garage' })),
        ...this.washStations.map((s) => ({ ...s, kind: 'wash' })),
        ...this.restStops.map((s) => ({ ...s, kind: 'rest' }))
      ];
      let best = null;
      let bestDistSq = Infinity;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const dSq = (x - s.x) ** 2 + (z - s.z) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = { ...s, kind: s.kind || kind, dist: Math.sqrt(dSq) };
        }
      }
      return best;
    }

    checkTollCrossing(x, z) {
      for (let i = 0; i < this.tollGates.length; i++) {
        const tg = this.tollGates[i];
        if (tg.cooldown <= 0) {
          const dx = x - tg.x;
          const dz = z - tg.z;
          if (dx * dx + dz * dz < 64) {
            tg.cooldown = 18;
            return tg;
          }
        }
      }
      return null;
    }

    getEdgeWaypoints(fromId, toId) {
      const edge = this.roadEdges.find(
        (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
      );
      return edge || null;
    }
  }

  global.BDBangladeshWorld = BangladeshWorld;
})(typeof window !== 'undefined' ? window : globalThis);
