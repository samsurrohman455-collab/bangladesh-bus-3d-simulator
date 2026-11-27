(function (global) {
  'use strict';

  function createWheel(radius, width) {
    const group = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 18);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.1 });
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    group.add(tire);

    const rimGeo = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.35, metalness: 0.75 });
    group.add(new THREE.Mesh(rimGeo, rimMat));

    const spokeGeo = new THREE.BoxGeometry(width + 0.04, radius * 0.85, 0.08);
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.7, roughness: 0.4 });
    group.add(new THREE.Mesh(spokeGeo, spokeMat));
    const spoke2 = new THREE.Mesh(spokeGeo, spokeMat);
    spoke2.rotation.x = Math.PI / 2;
    group.add(spoke2);

    return group;
  }

  function createSeatedPassenger(shirtHex) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.48, 0.24),
      new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.85 })
    );
    torso.position.y = 0.28;
    g.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.8 })
    );
    head.position.y = 0.65;
    g.add(head);
    g.visible = false;
    return g;
  }

  function createCrackedGlassTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    const rays = [[70, 50, 12, 10], [70, 50, 140, 18], [70, 50, 115, 118], [70, 50, 20, 112], [190, 74, 248, 22], [190, 74, 150, 116], [190, 74, 240, 120]];
    rays.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo((x1 + x2) * 0.5 + 8, (y1 + y2) * 0.5 - 5);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
    return new THREE.CanvasTexture(c);
  }

  function createBusMesh(busSpec, customPrimaryHex) {
    const root = new THREE.Group();
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const primaryHex = customPrimaryHex || busSpec.primaryColor;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(primaryHex), roughness: 0.22, metalness: 0.42 });
    const secondaryMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(busSpec.secondaryColor), roughness: 0.28, metalness: 0.3 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(busSpec.stripeColor), roughness: 0.32, metalness: 0.32 });
    const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.28 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.18, depthWrite: false });
    const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.8 });

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.54, 1.15, 10.9), bodyMat);
    lowerBody.position.set(0, 1.28, 0);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    chassisGroup.add(lowerBody);

    const sideStripe1 = new THREE.Mesh(new THREE.BoxGeometry(2.57, 0.24, 9.6), secondaryMat);
    sideStripe1.position.set(0, 1.52, 0.2);
    chassisGroup.add(sideStripe1);

    const sideStripe2 = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.12, 9.2), stripeMat);
    sideStripe2.position.set(0, 1.26, 0.2);
    chassisGroup.add(sideStripe2);

    // Dirt / Mud Overlay skirt (scales opacity as cleanliness drops!)
    const dirtMat = new THREE.MeshBasicMaterial({ color: 0x5c4028, transparent: true, opacity: 0, depthWrite: false });
    const dirtSkirt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 10.95), dirtMat);
    dirtSkirt.position.set(0, 1.05, 0);
    chassisGroup.add(dirtSkirt);

    // Scratches & Dents visual strips
    const scratchMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0, depthWrite: false });
    const scratchBarL = new THREE.Mesh(new THREE.BoxGeometry(2.61, 0.12, 6.2), scratchMat);
    scratchBarL.position.set(0, 1.4, 0);
    chassisGroup.add(scratchBarL);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.1, 10.4), interiorMat);
    floor.position.set(0, 0.95, 0);
    chassisGroup.add(floor);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.22, 10.8), secondaryMat);
    roof.position.set(0, busSpec.isDoubleDecker ? 4.82 : 3.45, 0);
    roof.castShadow = true;
    chassisGroup.add(roof);

    if (busSpec.isDoubleDecker) {
      const upperDeckLower = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.34, 10.6), bodyMat);
      upperDeckLower.position.set(0, 3.62, 0);
      chassisGroup.add(upperDeckLower);
      const upperGlassL = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 0.95), glassMat);
      upperGlassL.rotation.y = -Math.PI / 2;
      upperGlassL.position.set(-1.26, 4.26, 0.2);
      chassisGroup.add(upperGlassL);
      const upperGlassR = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 0.95), glassMat);
      upperGlassR.rotation.y = Math.PI / 2;
      upperGlassR.position.set(1.26, 4.26, 0.2);
      chassisGroup.add(upperGlassR);
      const upperFrontGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 0.95), glassMat);
      upperFrontGlass.rotation.y = Math.PI;
      upperFrontGlass.position.set(0, 4.26, -5.36);
      chassisGroup.add(upperFrontGlass);
      const upperRear = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.15, 0.18), bodyMat);
      upperRear.position.set(0, 4.22, 5.34);
      chassisGroup.add(upperRear);
    }

    const acPod = new THREE.Mesh(new THREE.BoxGeometry(1.55, busSpec.isElectric ? 0.34 : 0.26, busSpec.isElectric ? 5.2 : 3.8), busSpec.isElectric ? stripeMat : secondaryMat);
    acPod.position.set(0, busSpec.isDoubleDecker ? 5.02 : 3.67, 0.3);
    chassisGroup.add(acPod);

    const acVent = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 2.2), darkTrimMat);
    acVent.position.set(0, busSpec.isDoubleDecker ? 5.04 : 3.67, 0.3);
    chassisGroup.add(acVent);

    for (let z = -3.0; z <= 4.6; z += 1.46) {
      const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.56, 0.14), darkTrimMat);
      pillarL.position.set(-1.23, 2.6, z);
      chassisGroup.add(pillarL);
    }
    for (let z = -4.2; z <= 4.6; z += 1.46) {
      const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.56, 0.14), darkTrimMat);
      pillarR.position.set(1.23, 2.6, z);
      chassisGroup.add(pillarR);
    }

    const aPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 0.16), bodyMat);
    aPillarL.position.set(-1.2, 2.62, -5.32);
    chassisGroup.add(aPillarL);
    const aPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 0.16), bodyMat);
    aPillarR.position.set(1.2, 2.62, -5.32);
    chassisGroup.add(aPillarR);

    const rearUpper = new THREE.Mesh(new THREE.BoxGeometry(2.52, 1.62, 0.18), bodyMat);
    rearUpper.position.set(0, 2.62, 5.36);
    chassisGroup.add(rearUpper);

    const sideGlassL = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.44), glassMat);
    sideGlassL.rotation.y = -Math.PI / 2;
    sideGlassL.position.set(-1.26, 2.62, 0.8);
    chassisGroup.add(sideGlassL);

    const sideGlassR = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.44), glassMat);
    sideGlassR.rotation.y = Math.PI / 2;
    sideGlassR.position.set(1.26, 2.62, 0.1);
    chassisGroup.add(sideGlassR);

    const frontGlassMat = glassMat.clone();
    frontGlassMat.side = THREE.DoubleSide;
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.42), frontGlassMat);
    frontGlass.rotation.y = Math.PI;
    frontGlass.position.set(0, 2.52, -5.38);
    chassisGroup.add(frontGlass);

    // Cracked Windshield Overlay (visible when windshield damaged)
    const crackMat = new THREE.MeshBasicMaterial({
      map: createCrackedGlassTexture(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const crackOverlay = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 1.38), crackMat);
    crackOverlay.rotation.y = Math.PI;
    crackOverlay.position.set(0, 2.52, -5.4);
    chassisGroup.add(crackOverlay);

    // Phase 4: Windshield Raindrop Overlay
    const raindropMat = new THREE.MeshBasicMaterial({
      map: global.BDTextures.createRaindropTexture(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const raindropOverlay = new THREE.Mesh(new THREE.PlaneGeometry(2.24, 1.36), raindropMat);
    raindropOverlay.rotation.y = Math.PI;
    raindropOverlay.position.set(0, 2.52, -5.41);
    chassisGroup.add(raindropOverlay);

    // Animated Passenger Door + Illuminated Step Strip
    const doorGroup = new THREE.Group();
    doorGroup.position.set(-1.27, 2.05, -4.3);
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 1.1), secondaryMat);
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.82), glassMat);
    doorGlass.position.y = 0.42;
    doorGroup.add(doorPanel, doorGlass);
    chassisGroup.add(doorGroup);

    const doorStepMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.25
    });
    const doorStepStrip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 1.12), doorStepMat);
    doorStepStrip.position.set(-1.32, 0.94, -4.3);
    chassisGroup.add(doorStepStrip);

    // Wipers
    const wiperL = new THREE.Group();
    wiperL.position.set(-0.55, 1.84, -5.42);
    const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.04), darkTrimMat);
    bladeL.position.y = 0.34;
    wiperL.add(bladeL);
    chassisGroup.add(wiperL);

    const wiperR = new THREE.Group();
    wiperR.position.set(0.55, 1.84, -5.42);
    wiperR.add(bladeL.clone());
    chassisGroup.add(wiperR);

    // Header + LED Board
    const frontHeader = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.44, 0.25), bodyMat);
    frontHeader.position.set(0, 3.24, -5.35);
    chassisGroup.add(frontHeader);

    const ledMat = new THREE.MeshBasicMaterial({
      map: global.BDTextures.createDestinationLedTexture(busSpec.routeBn, busSpec.name)
    });
    const ledBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.32), ledMat);
    ledBoard.rotation.y = Math.PI;
    ledBoard.position.set(0, 3.24, -5.49);
    chassisGroup.add(ledBoard);

    // Front & Rear Bumpers (can tilt visibly when damaged!)
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.34, 0.24), darkTrimMat);
    bumperF.position.set(0, 0.68, -5.46);
    chassisGroup.add(bumperF);

    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.3, 0.22), darkTrimMat);
    bumperR.position.set(0, 0.68, 5.46);
    chassisGroup.add(bumperR);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.42, 0.08), darkTrimMat);
    grille.position.set(0, 1.12, -5.46);
    chassisGroup.add(grille);

    const plateTex = global.BDTextures.createPlateTexture(busSpec.plateBn);
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
    const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.17), plateMat);
    frontPlate.rotation.y = Math.PI;
    frontPlate.position.set(0, 0.68, -5.59);
    chassisGroup.add(frontPlate);

    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.17), plateMat);
    rearPlate.position.set(0, 0.72, 5.58);
    chassisGroup.add(rearPlate);

    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.08), darkTrimMat);
      arm.position.set(side * 1.38, 2.7, -5.25);
      chassisGroup.add(arm);
      const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.18), bodyMat);
      mirrorHead.position.set(side * 1.52, 2.55, -5.32);
      chassisGroup.add(mirrorHead);
    });

    // Cockpit
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.58, 0.72), darkTrimMat);
    dash.position.set(0, 1.52, -4.96);
    chassisGroup.add(dash);

    const dashClusterMat = new THREE.MeshBasicMaterial({ map: global.BDTextures.createDashboardTexture() });
    const dashCluster = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.22), dashClusterMat);
    dashCluster.rotation.x = -0.35;
    dashCluster.position.set(0.68, 1.83, -4.85);
    chassisGroup.add(dashCluster);

    const steeringPivot = new THREE.Group();
    steeringPivot.position.set(0.68, 1.86, -4.55);
    steeringPivot.rotation.x = 0.52;
    chassisGroup.add(steeringPivot);

    const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.45, 10), darkTrimMat);
    colShaft.rotation.x = Math.PI / 2;
    colShaft.position.z = -0.22;
    steeringPivot.add(colShaft);

    const steeringWheel = new THREE.Group();
    steeringPivot.add(steeringWheel);
    steeringWheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.026, 10, 24), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })));
    const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), darkTrimMat);
    wheelHub.rotation.x = Math.PI / 2;
    steeringWheel.add(wheelHub);
    steeringWheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.025), darkTrimMat));
    const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.025), darkTrimMat);
    spokeB.position.y = -0.11;
    steeringWheel.add(spokeB);

    const driverSeatBase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.5), seatMat);
    driverSeatBase.position.set(0.68, 1.28, -3.95);
    chassisGroup.add(driverSeatBase);
    const driverSeatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.14), seatMat);
    driverSeatBack.position.set(0.68, 1.82, -3.72);
    chassisGroup.add(driverSeatBack);

    const shirtPalette = [0xe11d48, 0x2563eb, 0x10b981, 0xf59e0b, 0x7c3aed, 0x0d9488, 0xf97316];
    const seatedPassengers = [];
    let seatIdx = 0;
    for (let row = 0; row < 7; row++) {
      const z = -2.6 + row * 1.05;
      [-0.78, -0.32, 0.38, 0.84].forEach((sx) => {
        const sBase = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.42), seatMat);
        sBase.position.set(sx, 1.24, z);
        chassisGroup.add(sBase);
        const sBack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.65, 0.1), seatMat);
        sBack.position.set(sx, 1.65, z + 0.16);
        chassisGroup.add(sBack);
        const paxMesh = createSeatedPassenger(shirtPalette[seatIdx % shirtPalette.length]);
        paxMesh.position.set(sx, 1.38, z - 0.02);
        chassisGroup.add(paxMesh);
        seatedPassengers.push(paxMesh);
        seatIdx++;
      });
    }

    const cabinLight = new THREE.PointLight(0xfef3c7, 0.55, 8);
    cabinLight.position.set(0, 3.15, -3.5);
    chassisGroup.add(cabinLight);

    // Engine Smoke Particles (pooled around rear engine bay)
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45, depthWrite: false });
    const smokePuffs = [];
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), smokeMat);
      puff.position.set((i % 2 === 0 ? -0.4 : 0.4), 1.4, 5.4);
      puff.visible = false;
      chassisGroup.add(puff);
      smokePuffs.push({ mesh: puff, phase: i * 0.8 });
    }

    // Wash Spray & Foam Particles (pooled around bus exterior)
    const sprayMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.65, depthWrite: false });
    const washSprays = [];
    for (let i = 0; i < 12; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 5), sprayMat);
      drop.visible = false;
      root.add(drop);
      washSprays.push(drop);
    }

    // Lights
    const headlightMatL = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
    const headlightMatR = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
    const headMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.06), headlightMatL);
    headMeshL.position.set(-0.92, 1.02, -5.47);
    chassisGroup.add(headMeshL);
    const headMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.06), headlightMatR);
    headMeshR.position.set(0.92, 1.02, -5.47);
    chassisGroup.add(headMeshR);

    const headSpot = new THREE.SpotLight(0xfffbeb, 0, 95, Math.PI / 4.0, 0.45, 1.1);
    headSpot.position.set(0, 1.15, -5.55);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.2, -36);
    chassisGroup.add(spotTarget);
    headSpot.target = spotTarget;
    chassisGroup.add(headSpot);

    // Ground volumetric headlight projection cones for nighttime road visibility on all GPUs
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: 0xfef9c3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const beamConeGeo = new THREE.ConeGeometry(4.2, 26, 12, 1, true);
    beamConeGeo.rotateX(-Math.PI / 2);
    const beamCone = new THREE.Mesh(beamConeGeo, beamConeMat);
    beamCone.position.set(0, 0.75, -18.5);
    chassisGroup.add(beamCone);

    const indMatLeft = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const indMatRight = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const indFL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.07), indMatLeft);
    indFL.position.set(-1.18, 1.02, -5.47);
    chassisGroup.add(indFL);
    const indRL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.07), indMatLeft);
    indRL.position.set(-1.12, 1.24, 5.47);
    chassisGroup.add(indRL);
    const indFR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.07), indMatRight);
    indFR.position.set(1.18, 1.02, -5.47);
    chassisGroup.add(indFR);
    const indRR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.07), indMatRight);
    indRR.position.set(1.12, 1.24, 5.47);
    chassisGroup.add(indRR);

    const brakeMat = new THREE.MeshBasicMaterial({ color: 0x7f1d1d });
    const brakeL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.07), brakeMat);
    brakeL.position.set(-0.82, 1.24, 5.47);
    chassisGroup.add(brakeL);
    const brakeR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.07), brakeMat);
    brakeR.position.set(0.82, 1.24, 5.47);
    chassisGroup.add(brakeR);

    const reverseMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    const revL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.07), reverseMat);
    revL.position.set(-0.82, 1.04, 5.47);
    chassisGroup.add(revL);
    const revR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.07), reverseMat);
    revR.position.set(0.82, 1.04, 5.47);
    chassisGroup.add(revR);

    const shadowBlob = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 11.6),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadowBlob.rotation.x = -Math.PI / 2;
    shadowBlob.position.y = 0.03;
    root.add(shadowBlob);

    const wheelRadius = 0.56;
    const wheelFLPivot = new THREE.Group();
    wheelFLPivot.position.set(-1.14, wheelRadius, -3.35);
    const wheelFL = createWheel(wheelRadius, 0.34);
    wheelFLPivot.add(wheelFL);
    root.add(wheelFLPivot);

    const wheelFRPivot = new THREE.Group();
    wheelFRPivot.position.set(1.14, wheelRadius, -3.35);
    const wheelFR = createWheel(wheelRadius, 0.34);
    wheelFRPivot.add(wheelFR);
    root.add(wheelFRPivot);

    const wheelRL = createWheel(wheelRadius, 0.42);
    wheelRL.position.set(-1.12, wheelRadius, 3.05);
    root.add(wheelRL);

    const wheelRR = createWheel(wheelRadius, 0.42);
    wheelRR.position.set(1.12, wheelRadius, 3.05);
    root.add(wheelRR);

    let doorAnim = 0;

    return {
      root,
      chassisGroup,
      bodyMat,
      steeringWheel,
      wheelFLPivot,
      wheelFRPivot,
      wheels: [wheelFL, wheelFR, wheelRL, wheelRR],
      seatedPassengers,
      doorGroup,
      headSpot,
      shadowBlob,
      setPaintColor(hex) {
        bodyMat.color.set(hex);
      },
      setDestinationBoard(routeBn, companyName) {
        if (ledMat.map) ledMat.map.dispose();
        ledMat.map = global.BDTextures.createDestinationLedTexture(routeBn, companyName);
        ledMat.needsUpdate = true;
      },
      setSeatedCount(count) {
        const clamped = Math.max(0, Math.min(seatedPassengers.length, count));
        for (let i = 0; i < seatedPassengers.length; i++) {
          seatedPassengers[i].visible = i < clamped;
        }
      },
      getDoorWorldPosition() {
        const v = new THREE.Vector3(-1.45, 0.6, -4.3);
        root.localToWorld(v);
        return v;
      },
      setReflectionQuality(quality) {
        if (quality === 'low') {
          bodyMat.roughness = 0.52;
          bodyMat.metalness = 0.14;
        } else if (quality === 'high' || quality === 'ultra') {
          bodyMat.roughness = 0.16;
          bodyMat.metalness = 0.52;
        } else {
          bodyMat.roughness = 0.24;
          bodyMat.metalness = 0.38;
        }
      },
      updateVisuals(state, blinkOn, elapsed, rainInput, damageInfo, isDark, onWiperSweep) {
        wheelFLPivot.rotation.y = state.steerAngle * 0.68;
        wheelFRPivot.rotation.y = state.steerAngle * 0.68;
        steeringWheel.rotation.z = -state.steerAngle * 6.5;

        const wheelDelta = (state.speedMs * state.lastDt) / wheelRadius;
        for (let i = 0; i < 4; i++) {
          this.wheels[i].rotation.x -= wheelDelta;
        }

        chassisGroup.position.y = state.suspBounce;
        chassisGroup.rotation.x = state.suspPitch;
        chassisGroup.rotation.z = state.suspRoll;

        const targetDoor = state.doorOpen ? 1 : 0;
        doorAnim += (targetDoor - doorAnim) * Math.min(1, 8 * state.lastDt);
        doorGroup.position.x = -1.27 - doorAnim * 0.24;
        doorGroup.position.z = -4.3 + doorAnim * 0.95;
        doorStepMat.emissiveIntensity = doorAnim * 1.4;
        doorStepMat.opacity = 0.15 + doorAnim * 0.75;

        const rainIntensity = typeof rainInput === 'number' ? rainInput : (rainInput ? 0.85 : 0);
        if (rainIntensity > 0.08) {
          const prevSin = Math.sin((elapsed - state.lastDt) * (3.2 + rainIntensity * 3.0));
          const sweepSin = Math.sin(elapsed * (3.2 + rainIntensity * 3.0));
          wiperL.rotation.z = sweepSin * 0.74;
          wiperR.rotation.z = sweepSin * 0.74;
          if ((prevSin < 0 && sweepSin >= 0) || (prevSin > 0 && sweepSin <= 0)) {
            if (onWiperSweep) onWiperSweep();
          }
          // Raindrops collect and briefly clear as wipers pass center
          const wipeClear = 1 - Math.exp(-Math.abs(sweepSin) * 2.2) * 0.55;
          raindropMat.opacity = Math.min(0.75, rainIntensity * 0.72 * wipeClear);
        } else {
          wiperL.rotation.z += (0.8 - wiperL.rotation.z) * 0.15;
          wiperR.rotation.z += (0.8 - wiperR.rotation.z) * 0.15;
          raindropMat.opacity += (0 - raindropMat.opacity) * 0.12;
        }

        // Interior cabin & dashboard night illumination
        cabinLight.intensity = isDark ? 1.05 : 0.35;

        // Phase 3 Visual Damage, Dirt, Smoke & Washing Effects
        let headOk = true;
        let headRightOk = true;
        let tailOk = true;
        if (damageInfo) {
          const { parts, mechanics, cleanliness, washingActive } = damageInfo;
          crackMat.opacity = parts.windshield < 75 ? Math.min(0.85, (75 - parts.windshield) / 60) : 0;
          scratchMat.opacity = parts.bodyPanels < 80 ? Math.min(0.7, (80 - parts.bodyPanels) / 70) : 0;
          dirtMat.opacity = Math.max(0, Math.min(0.55, (100 - cleanliness) / 140));

          bumperF.rotation.z = parts.frontBumper < 65 ? (65 - parts.frontBumper) * 0.0025 : 0;
          bumperR.rotation.z = parts.rearBumper < 65 ? -(65 - parts.rearBumper) * 0.0025 : 0;
          wheelFL.scale.y = mechanics.punctured ? 0.8 : 1.0;

          const smoking = parts.engine < 60 || mechanics.engineTemp > 104 || parts.radiator < 50;
          for (let i = 0; i < smokePuffs.length; i++) {
            const sp = smokePuffs[i];
            sp.mesh.visible = smoking;
            if (smoking) {
              const cyc = (elapsed * 1.4 + sp.phase) % 2.4;
              sp.mesh.position.y = 1.2 + cyc * 1.3;
              sp.mesh.position.z = 5.4 + cyc * 0.7;
              const s = 0.6 + cyc * 0.55;
              sp.mesh.scale.set(s, s, s);
            }
          }

          for (let i = 0; i < washSprays.length; i++) {
            const ws = washSprays[i];
            ws.visible = !!washingActive;
            if (washingActive) {
              const side = i % 2 === 0 ? -1.6 : 1.6;
              ws.position.set(side, 1.2 + ((elapsed * 3 + i * 0.4) % 2.5), -3.5 + (i % 6) * 1.4);
            }
          }

          headOk = parts.headlights > 25;
          headRightOk = parts.headlights > 45;
          tailOk = parts.tailLights > 25;
        }

        // High Beam / Low Beam Headlights
        const beamMode = typeof state.beamMode === 'number' ? state.beamMode : (state.headlightsOn ? 1 : 0);
        const lightsLit = beamMode > 0 && headOk;
        const dmgScale = damageInfo && damageInfo.parts.headlights < 60 ? 0.55 : 1.0;
        if (lightsLit) {
          const isHigh = beamMode === 2;
          headSpot.intensity = (isHigh ? 6.8 : 4.2) * dmgScale;
          headSpot.distance = isHigh ? 175 : 105;
          headSpot.angle = isHigh ? Math.PI / 3.0 : Math.PI / 4.0;
          spotTarget.position.z = isHigh ? -62 : -38;
          beamCone.scale.set(isHigh ? 1.35 : 1.05, 1, isHigh ? 1.55 : 1.05);
          beamConeMat.opacity = isDark ? (isHigh ? 0.21 : 0.13) : 0.04;
        } else {
          headSpot.intensity = 0;
          beamConeMat.opacity = 0;
        }

        headlightMatL.color.setHex(lightsLit ? (beamMode === 2 ? 0xffffff : 0xfef9c3) : 0x475569);
        headlightMatR.color.setHex(lightsLit && headRightOk ? (beamMode === 2 ? 0xffffff : 0xfef9c3) : 0x475569);
        brakeMat.color.setHex((state.isBraking || state.handbrake) && tailOk ? 0xff1e42 : 0x5c1111);

        reverseMat.color.setHex(state.gear === 'R' ? 0xf8fafc : 0x334155);
        const leftActive = (state.indLeft || state.hazardOn) && blinkOn;
        const rightActive = (state.indRight || state.hazardOn) && blinkOn;
        indMatLeft.color.setHex(leftActive ? 0xfbbf24 : 0x451a03);
        indMatRight.color.setHex(rightActive ? 0xfbbf24 : 0x451a03);
      },
      dispose() {
        root.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          }
        });
      }
    };
  }

  function createNameTagSprite(label, subLabel, accentHex, isLeader) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(6, 22, 16, 0.86)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 488, 104, 24);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = isLeader ? '#fbbf24' : (accentHex || '#34d399');
    ctx.stroke();
    ctx.fillStyle = isLeader ? '#fde68a' : '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((isLeader ? '👑 ' : '🚌 ') + (label || 'Player').slice(0, 22), 256, 56);
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 22px sans-serif';
    ctx.fillText((subLabel || 'BD Transport').slice(0, 28), 256, 92);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.4, 1.6, 1);
    return { sprite, tex, mat };
  }

  function createRemotePlayerBusMesh(busSpec, companyColorHex, displayName, companyName, isLeader) {
    const root = new THREE.Group();
    const color = companyColorHex || (busSpec && busSpec.primaryColor) || '#10b981';
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.28, metalness: 0.36 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.45, roughness: 0.1 });

    const height = busSpec && busSpec.isDoubleDecker ? 3.8 : 2.55;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.52, height, 10.7), bodyMat);
    hull.position.set(0, height * 0.5 + 0.65, 0);
    hull.castShadow = true;
    root.add(hull);

    const glassBand = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.1, 9.5), glassMat);
    glassBand.position.set(0, 2.45, -0.1);
    root.add(glassBand);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.22, 10.3), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }));
    roof.position.set(0, height + 0.72, 0);
    root.add(roof);

    const headMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    hl.position.set(-0.85, 1.05, -5.36);
    const hr = hl.clone();
    hr.position.x = 0.85;
    root.add(hl, hr);

    const indLMat = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const indRMat = new THREE.MeshBasicMaterial({ color: 0x451a03 });
    const indL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), indLMat);
    indL.position.set(-1.12, 1.05, -5.36);
    const indR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), indRMat);
    indR.position.set(1.12, 1.05, -5.36);
    root.add(indL, indR);

    [-1.12, 1.12].forEach((wx) => {
      [-3.3, 3.1].forEach((wz) => {
        const w = createWheel(0.55, 0.34);
        w.position.set(wx, 0.55, wz);
        root.add(w);
      });
    });

    const tag = createNameTagSprite(displayName, companyName, color, isLeader);
    tag.sprite.position.set(0, height + 2.2, 0);
    root.add(tag.sprite);

    return {
      root,
      updateVisual(data, blinkOn) {
        headMat.color.setHex(data.beamMode > 0 ? 0xfef9c3 : 0x475569);
        indLMat.color.setHex(data.indLeft && blinkOn ? 0xfbbf24 : 0x451a03);
        indRMat.color.setHex(data.indRight && blinkOn ? 0xfbbf24 : 0x451a03);
      },
      dispose() {
        root.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        });
      }
    };
  }

  global.BDBusModel = { createBusMesh, createRemotePlayerBusMesh };
})(typeof window !== 'undefined' ? window : globalThis);
