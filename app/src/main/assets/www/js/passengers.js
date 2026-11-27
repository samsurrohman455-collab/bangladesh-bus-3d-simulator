(function (global) {
  'use strict';

  const SKIN_TONES = [0x8d5524, 0xa5694f, 0x6f4225, 0x9c6644];

  function createWalkingPedestrianMesh(shirtHex, index) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: index % 3 === 0 ? 0x0f172a : 0x1e293b, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_TONES[index % SKIN_TONES.length], roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.8 });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), legMat);
    legL.position.set(-0.1, 0.26, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), legMat);
    legR.position.set(0.1, 0.26, 0);
    g.add(legL, legR);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.22), shirtMat);
    torso.position.y = 0.8;
    g.add(torso);

    // Arms (pivot from shoulder height y = 1.02)
    const armL = new THREE.Group();
    armL.position.set(-0.25, 1.02, 0);
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.12), shirtMat);
    armLMesh.position.y = -0.2;
    armL.add(armLMesh);
    g.add(armL);

    const armR = new THREE.Group();
    armR.position.set(0.25, 1.02, 0);
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.12), shirtMat);
    armRMesh.position.y = -0.2;
    armR.add(armRMesh);
    g.add(armR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skinMat);
    head.position.y = 1.24;
    g.add(head);

    // Some intercity travelers carry a backpack / travel bag
    if (index % 2 === 0) {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.34, 0.14),
        new THREE.MeshStandardMaterial({ color: index % 4 === 0 ? 0x065f46 : 0x7c2d12, roughness: 0.85 })
      );
      bag.position.set(0, 0.82, -0.17);
      g.add(bag);
    }

    g.userData = { legL, legR, armL, armR, torso };
    g.visible = false;
    return g;
  }

  function pickReachableFreeDriveDests(stopId, allStopIds) {
    const Geo = global.BDGeoData;
    if (!Geo || !Geo.ROAD_NETWORK_EDGES) return allStopIds;
    const adj = new Map();
    for (let i = 0; i < Geo.ROAD_NETWORK_EDGES.length; i++) {
      const e = Geo.ROAD_NETWORK_EDGES[i];
      if (!adj.has(e.from)) adj.set(e.from, []);
      if (!adj.has(e.to)) adj.set(e.to, []);
      adj.get(e.from).push(e.to);
      adj.get(e.to).push(e.from);
    }
    const visited = new Set([stopId]);
    const queue = [{ id: stopId, depth: 0 }];
    const nearbyIds = [];
    while (queue.length > 0 && nearbyIds.length < 12) {
      const cur = queue.shift();
      const neighbors = adj.get(cur.id) || [];
      for (let i = 0; i < neighbors.length; i++) {
        const nb = neighbors[i];
        if (visited.has(nb)) continue;
        visited.add(nb);
        if (cur.depth + 1 >= 1 && cur.depth + 1 <= 4) {
          nearbyIds.push(nb);
          queue.push({ id: nb, depth: cur.depth + 1 });
        }
      }
    }
    return nearbyIds.length > 0 ? nearbyIds : allStopIds;
  }

  class PassengerManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.capacity = 28;
      this.onboard = []; // Array of { destId, fare }
      this.ticketIncome = 0;
      this.totalBoarded = 0;
      this.totalDropped = 0;

      // Object Pool of 64 pedestrian 3D meshes so crowded corridors never exhaust actors
      const colors = [0xe11d48, 0x2563eb, 0x10b981, 0xf59e0b, 0x7c3aed, 0x0d9488, 0xf97316, 0xdb2777];
      this.pool = [];
      for (let i = 0; i < 64; i++) {
        const mesh = createWalkingPedestrianMesh(colors[i % colors.length], i);
        this.scene.add(mesh);
        this.pool.push({
          mesh,
          inUse: false,
          stopId: null,
          state: 'idle', // 'waiting' | 'boarding' | 'alighting'
          x: 0,
          y: 0,
          z: 0,
          targetX: 0,
          targetZ: 0,
          walkPhase: Math.random() * 6,
          destId: null,
          _queueItem: null
        });
      }

      this.stopStates = new Map();
      this.boardCooldown = 0;
      this.alightCooldown = 0;
      this.populateAllStops(null);
    }

    resetSession(routeStops) {
      this.onboard = [];
      this.ticketIncome = 0;
      this.totalBoarded = 0;
      this.totalDropped = 0;
      this.boardCooldown = 0;
      this.alightCooldown = 0;
      this.populateAllStops(routeStops);
    }

    populateAllStops(routeStops) {
      for (let i = 0; i < this.pool.length; i++) {
        this.pool[i].inUse = false;
        this.pool[i]._queueItem = null;
        this.pool[i].mesh.visible = false;
      }
      this.stopStates.clear();

      const allStopIds = this.world.busStops.map((s) => s.id);
      this.world.busStops.forEach((stop, sIdx) => {
        // Final stop of a route shouldn't spawn passengers trying to go further unless Free Drive
        let isFinalRouteStop = false;
        if (routeStops && routeStops.length >= 2) {
          isFinalRouteStop = routeStops[routeStops.length - 1] === stop.id;
        }
        const waitingCount = isFinalRouteStop
          ? 0
          : stop.isTerminal
            ? 6
            : (stop.isDistrict ? 4 : 5);
        const waitingQueue = [];
        const freeDests = !routeStops ? pickReachableFreeDriveDests(stop.id, allStopIds) : null;

        for (let k = 0; k < waitingCount; k++) {
          let destId = allStopIds[(sIdx + 1 + (k % 3)) % allStopIds.length];
          if (routeStops && routeStops.length >= 2) {
            const idxInRoute = routeStops.indexOf(stop.id);
            if (idxInRoute >= 0 && idxInRoute < routeStops.length - 1) {
              const remaining = routeStops.slice(idxInRoute + 1);
              destId = remaining[k % remaining.length];
            } else {
              destId = routeStops[routeStops.length - 1];
            }
          } else if (freeDests && freeDests.length > 0) {
            destId = freeDests[k % freeDests.length];
          }
          waitingQueue.push({
            destId,
            slotIndex: k,
            actor: null
          });
        }
        this.stopStates.set(stop.id, { waiting: waitingQueue });
      });

      this.hydrateNearbyStops(0, 0);
    }

    hydrateNearbyStops(px, pz) {
      const rangeSq = 380 * 380;
      // Release waiting actors for far stops back to pool
      for (let i = 0; i < this.pool.length; i++) {
        const actor = this.pool[i];
        if (!actor.inUse || actor.state !== 'waiting') continue;
        const dx = actor.x - px;
        const dz = actor.z - pz;
        if (dx * dx + dz * dz > rangeSq) {
          if (actor._queueItem) actor._queueItem.actor = null;
          actor._queueItem = null;
          actor.inUse = false;
          actor.mesh.visible = false;
        }
      }

      // Bind actors to nearby stops that have unhydrated waiting passengers
      for (let s = 0; s < this.world.busStops.length; s++) {
        const stop = this.world.busStops[s];
        const dx = stop.x - px;
        const dz = stop.z - pz;
        if (dx * dx + dz * dz > rangeSq) continue;
        const st = this.stopStates.get(stop.id);
        if (!st) continue;
        const baseY = stop.y || 0;
        const dirToBayX = stop.x - stop.shelterX;
        const dirToBayZ = stop.z - stop.shelterZ;
        const bayYaw = Math.atan2(dirToBayX, dirToBayZ);

        for (let w = 0; w < st.waiting.length; w++) {
          const item = st.waiting[w];
          if (item.actor) continue;
          const freeActor = this.pool.find((p) => !p.inUse);
          if (!freeActor) break;
          const col = item.slotIndex % 4;
          const row = Math.floor(item.slotIndex / 4);
          freeActor.inUse = true;
          freeActor.stopId = stop.id;
          freeActor.state = 'waiting';
          freeActor.x = stop.shelterX - 2.4 + col * 1.45;
          freeActor.y = baseY;
          freeActor.z = stop.shelterZ + 1.1 + row * 1.05;
          freeActor.destId = item.destId;
          freeActor._queueItem = item;
          freeActor.mesh.position.set(freeActor.x, baseY, freeActor.z);
          freeActor.mesh.rotation.y = bayYaw;
          freeActor.mesh.userData.legL.rotation.x = 0;
          freeActor.mesh.userData.legR.rotation.x = 0;
          freeActor.mesh.userData.armL.rotation.x = 0;
          freeActor.mesh.userData.armR.rotation.x = 0;
          freeActor.mesh.visible = true;
          item.actor = freeActor;
        }
      }
    }

    spawnAlightingWalker(doorPos, stop) {
      const actor = this.pool.find((p) => !p.inUse);
      if (!actor) return;
      actor.inUse = true;
      actor._queueItem = null;
      actor.state = 'alighting';
      actor.stopId = stop.id;
      actor.x = doorPos.x;
      actor.y = stop.y || 0;
      actor.z = doorPos.z;
      actor.targetX = stop.shelterX + (Math.random() - 0.5) * 5.2;
      actor.targetZ = stop.shelterZ + 1.2 + Math.random() * 1.5;
      actor.mesh.position.set(actor.x, actor.y, actor.z);
      actor.mesh.visible = true;
    }

    getEstimatedFare(stopId, destId, activeRoute) {
      if (activeRoute && activeRoute.ticketPrice) {
        const sCount = Math.max(2, activeRoute.stops ? activeRoute.stops.length - 1 : 3);
        return Math.max(80, Math.round(activeRoute.ticketPrice / Math.max(1, sCount * 0.55)));
      }
      const Geo = global.BDGeoData;
      if (Geo && Geo.BANGLADESH_LOCATIONS && Geo.haversineKm) {
        const a = Geo.BANGLADESH_LOCATIONS[stopId];
        const b = Geo.BANGLADESH_LOCATIONS[destId];
        if (a && b) {
          const km = Geo.haversineKm(a.lat, a.lon, b.lat, b.lon);
          return Math.max(60, Math.min(950, Math.round(km * 3.2)));
        }
      }
      return 180;
    }

    update(dt, busPhysics, busRig, activeRoute, sound, onEvent) {
      const clampedDt = Math.min(dt, 0.05);
      if (this.boardCooldown > 0) this.boardCooldown -= clampedDt;
      if (this.alightCooldown > 0) this.alightCooldown -= clampedDt;

      this.hydrateNearbyStops(busPhysics.x, busPhysics.z);

      // Find nearest bus stop
      let nearestStop = null;
      let nearestDist = Infinity;
      for (let i = 0; i < this.world.busStops.length; i++) {
        const s = this.world.busStops[i];
        const dx = busPhysics.x - s.x;
        const dz = busPhysics.z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < nearestDist) {
          nearestDist = d;
          nearestStop = s;
        }
      }

      const speedKmh = Math.abs(busPhysics.speedMs) * 3.6;
      const nearStop = !!(nearestStop && nearestDist < 48);
      const atStopBay = !!(nearestStop && nearestDist < 18.0 && speedKmh <= 6.5);
      const doorPos = busRig.getDoorWorldPosition();

      const stopData = nearestStop ? this.stopStates.get(nearestStop.id) : null;
      const waitingList = stopData ? stopData.waiting : [];
      const alightingCount = nearestStop
        ? this.onboard.filter((p) => p.destId === nearestStop.id).length
        : 0;

      // Auto-open bus door when arriving cleanly at a stop bay with passengers to drop or pick up
      if (atStopBay && !busPhysics.doorOpen && speedKmh < 1.8) {
        const hasPickup = waitingList.length > 0 && this.onboard.length < this.capacity;
        if (alightingCount > 0 || hasPickup) {
          busPhysics.doorOpen = true;
          if (sound && sound.playDoorPneumatic) sound.playDoorPneumatic();
        }
      }

      // Count active walkers right now
      let alightingActive = 0;
      let boardingActive = 0;
      for (let i = 0; i < this.pool.length; i++) {
        const act = this.pool[i];
        if (!act.inUse) continue;
        if (act.state === 'alighting' && nearestStop && act.stopId === nearestStop.id) alightingActive++;
        if (act.state === 'boarding' && nearestStop && act.stopId === nearestStop.id) boardingActive++;
      }

      let statusText = '';
      if (atStopBay && busPhysics.doorOpen) {
        // 1. Alight passengers whose destination is this stop FIRST
        const dropIdx = this.onboard.findIndex((p) => p.destId === nearestStop.id);
        if (dropIdx >= 0 && this.alightCooldown <= 0) {
          this.onboard.splice(dropIdx, 1);
          this.totalDropped += 1;
          this.alightCooldown = 0.44;
          this.boardCooldown = Math.max(this.boardCooldown, 0.35); // Wait briefly for alighting passenger to clear doorway
          this.spawnAlightingWalker(doorPos, nearestStop);
          busRig.setSeatedCount(this.onboard.length);
          sound.playTick(false);
          if (onEvent) onEvent('alight', nearestStop, 0);
        }

        // 2. Call waiting passengers to walk toward bus door (yield slightly while alighting happens)
        if (dropIdx < 0 && waitingList.length > 0 && this.onboard.length < this.capacity) {
          let walkingNow = boardingActive;
          if (walkingNow < 3) {
            for (let w = 0; w < waitingList.length && walkingNow < 3; w++) {
              const act = waitingList[w].actor;
              if (act && act.state === 'waiting') {
                act.state = 'boarding';
                walkingNow++;
                boardingActive++;
              }
            }
          }
          statusText = `${nearestStop.nameBn || nearestStop.nameEn}: যাত্রী উঠছে (${waitingList.length} জন বাকি)`;
        } else if (dropIdx >= 0 || alightingActive > 0) {
          statusText = `${nearestStop.nameBn || nearestStop.nameEn}: যাত্রী নামছে (${alightingCount} জন)`;
        } else if (waitingList.length === 0 && alightingCount === 0) {
          statusText = `${nearestStop.nameBn || nearestStop.nameEn}: সব যাত্রী ওঠা-নামা শেষ`;
        }
      } else if (atStopBay && !busPhysics.doorOpen && (waitingList.length > 0 || alightingCount > 0)) {
        statusText = `দরজা খুলুন (🚪) • অপেক্ষমাণ ${waitingList.length} জন`;
      }

      // Animate all active walking & waving pedestrians in pool
      for (let i = 0; i < this.pool.length; i++) {
        const actor = this.pool[i];
        if (!actor.inUse) continue;

        const pdx = actor.x - busPhysics.x;
        const pdz = actor.z - busPhysics.z;
        const visibleRange = pdx * pdx + pdz * pdz < 360 * 360;
        actor.mesh.visible = visibleRange;

        if (actor.state === 'waiting') {
          if (visibleRange && nearestStop && actor.stopId === nearestStop.id && nearestDist < 42) {
            // Look toward the approaching bus and wave!
            actor.mesh.rotation.y = Math.atan2(busPhysics.x - actor.x, busPhysics.z - actor.z);
            actor.walkPhase += clampedDt * 7.5;
            actor.mesh.userData.armR.rotation.x = -2.4 + Math.sin(actor.walkPhase) * 0.45;
            actor.mesh.userData.armL.rotation.x = 0;
          } else {
            actor.mesh.userData.armR.rotation.x = 0;
            actor.mesh.userData.armL.rotation.x = 0;
          }
          continue;
        }

        if (actor.state === 'boarding') {
          if (!atStopBay || !busPhysics.doorOpen) {
            actor.state = 'waiting';
            actor.mesh.userData.legL.rotation.x = 0;
            actor.mesh.userData.legR.rotation.x = 0;
            actor.mesh.userData.armL.rotation.x = 0;
            actor.mesh.userData.armR.rotation.x = 0;
            continue;
          }
          const tx = doorPos.x - actor.x;
          const tz = doorPos.z - actor.z;
          const dist = Math.sqrt(tx * tx + tz * tz);
          if (dist < 1.35 && this.boardCooldown <= 0 && this.onboard.length < this.capacity) {
            // Board the bus!
            const stData = this.stopStates.get(actor.stopId);
            if (stData && actor._queueItem) {
              const idx = stData.waiting.indexOf(actor._queueItem);
              if (idx >= 0) stData.waiting.splice(idx, 1);
            }
            if (actor._queueItem) actor._queueItem.actor = null;
            actor._queueItem = null;
            actor.inUse = false;
            actor.mesh.visible = false;
            this.boardCooldown = 0.28;

            const fare = this.getEstimatedFare(actor.stopId, actor.destId, activeRoute);
            this.onboard.push({ destId: actor.destId, fare });
            this.ticketIncome += fare;
            this.totalBoarded += 1;
            busRig.setSeatedCount(this.onboard.length);
            sound.playChime();
            if (onEvent) onEvent('board', nearestStop, fare, actor.destId);
          } else if (dist >= 1.35) {
            const step = 4.4 * clampedDt;
            actor.x += (tx / dist) * step;
            actor.z += (tz / dist) * step;
            actor.mesh.position.set(actor.x, actor.y || 0, actor.z);
            actor.mesh.rotation.y = Math.atan2(tx, tz);
            actor.walkPhase += clampedDt * 13;
            const swing = Math.sin(actor.walkPhase) * 0.55;
            actor.mesh.userData.legL.rotation.x = swing;
            actor.mesh.userData.legR.rotation.x = -swing;
            actor.mesh.userData.armL.rotation.x = -swing * 0.8;
            actor.mesh.userData.armR.rotation.x = swing * 0.8;
          }
        } else if (actor.state === 'alighting') {
          const tx = actor.targetX - actor.x;
          const tz = actor.targetZ - actor.z;
          const dist = Math.sqrt(tx * tx + tz * tz);
          if (dist < 0.75) {
            actor.state = 'idle';
            actor.mesh.userData.legL.rotation.x = 0;
            actor.mesh.userData.legR.rotation.x = 0;
            actor.mesh.userData.armL.rotation.x = 0;
            actor.mesh.userData.armR.rotation.x = 0;
            actor.inUse = false;
            actor.mesh.visible = false;
          } else {
            const step = 3.1 * clampedDt;
            actor.x += (tx / dist) * step;
            actor.z += (tz / dist) * step;
            actor.mesh.position.set(actor.x, actor.y || 0, actor.z);
            actor.mesh.rotation.y = Math.atan2(tx, tz);
            actor.walkPhase += clampedDt * 11;
            const swing = Math.sin(actor.walkPhase) * 0.5;
            actor.mesh.userData.legL.rotation.x = swing;
            actor.mesh.userData.legR.rotation.x = -swing;
            actor.mesh.userData.armL.rotation.x = -swing * 0.75;
            actor.mesh.userData.armR.rotation.x = swing * 0.75;
          }
        }
      }

      // Summarize next sample fare for HUD
      const sampleWaiting = waitingList[0];
      const nextFare = sampleWaiting && nearestStop
        ? this.getEstimatedFare(nearestStop.id, sampleWaiting.destId, activeRoute)
        : (activeRoute ? activeRoute.ticketPrice : 180);

      return {
        onboardCount: this.onboard.length,
        capacity: this.capacity,
        ticketIncome: this.ticketIncome,
        totalBoarded: this.totalBoarded,
        totalDropped: this.totalDropped,
        nearStop,
        atStopBay,
        nearestStop,
        nearestDist,
        waitingCount: waitingList.length,
        alightingCount,
        alightingActive,
        boardingActive,
        nextFare,
        statusText
      };
    }
  }

  global.BDPassengerManager = PassengerManager;
})(typeof window !== 'undefined' ? window : globalThis);
