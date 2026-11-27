(function (global) {
  'use strict';

  const {
    BUS_CATALOG,
    BANGLADESH_LOCATIONS,
    ROAD_NETWORK_EDGES,
    ROUTES_CATALOG,
    PAINT_PALETTE,
    UPGRADE_DEFINITIONS,
    REPAIR_SERVICES,
    FUEL_PRICES,
    QUALITY_PRESETS,
    TIME_PRESETS,
    WEATHER_PRESETS,
    computeRouteStats,
    buildCustomBangladeshMission,
    loadSave,
    persistSave
  } = global.BDGameConfig;

  const CAMERA_MODES = [
    { id: 'CHASE', label: 'CHASE', nameBn: 'পিছনের ভিউ', icon: '🎥', type: 'orbit' },
    { id: 'COCKPIT', label: 'COCKPIT', nameBn: 'ড্রাইভার সিট', icon: '🪪', type: 'interior' },
    { id: 'FOLLOW', label: 'FOLLOW', nameBn: 'দূরের ভিউ', icon: '🛣️', type: 'orbit' },
    { id: 'BUMPER', label: 'BUMPER', nameBn: 'সামনের বাম্পার', icon: '⚡', type: 'interior' },
    { id: 'CABIN', label: 'CABIN', nameBn: 'যাত্রী কেবিন', icon: '💺', type: 'interior' },
    { id: 'WHEEL', label: 'DOOR', nameBn: 'দরজা ও চাকা', icon: '🚪', type: 'side' },
    { id: 'ROOF', label: 'ROOF', nameBn: 'ছাদের ভিউ', icon: '🌤️', type: 'interior' },
    { id: 'REAR', label: 'REAR', nameBn: 'রিভার্স ভিউ', icon: '🪞', type: 'rear' },
    { id: 'ORBIT', label: '360°', nameBn: '৩৬০° ড্রোন ভিউ', icon: '🔄', type: 'orbit' }
  ];
  const NAV_MODES = [null, 'fuel', 'garage', 'wash', 'rest'];

  class BusSimulatorGame {
    constructor() {
      this.save = loadSave();
      this.mode = 'menu'; // 'menu' | 'career' | 'freedrive'
      this.paused = false;
      this.cameraModeIndex = 0;
      this.camLookYaw = 0;
      this.camLookPitch = 0;
      this.camOrbitDist = 12.0;
      this.camTrayOpen = false;
      this._camDrag = { active: false, pointerId: null, lastX: 0, lastY: 0, moved: 0, lastTapMs: 0 };
      this.elapsed = 0;
      this.showroomAngle = 0.55;
      this.blinkTimer = 0;
      this.blinkOn = false;
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      this.currentFps = 60;
      this.toastTimer = null;

      // Phase 2 & 3 Route, Mechanics & Economy Tracking
      this.activeRoute = ROUTES_CATALOG[0];
      this.routeStopIndex = 0;
      this.visitedStops = new Set();
      this.sessionFuelCost = 0;
      this.sessionTollCost = 0;
      this.sessionFines = 0;
      this.missionCompletedFlag = false;
      this.selectedFuelType = 'diesel';
      this.repairUseInsurance = true;
      this.navServiceIndex = 0;
      this.washingAnimTimer = 0;
      this.refueledThisMission = false;
      this.activeServiceZone = null;
      this.wasDark = false;
      this.wasStreetLightsOn = false;
      this.envState = null;
      this.prevBumpFlag = false;
      this.weatherOrder = Object.keys(WEATHER_PRESETS);
      this.gpsNavRoute = null;
      this.gpsNavIndex = 1;
      this.routeRegionFilter = 'all';
      this._routeModalInitialized = false;

      this.input = { left: false, right: false, gas: false, brake: false, horn: false };
      this._holdResetters = [];
      this._driveBlockHintTime = 0;

      this.sound = new global.BDSoundEngine();
      this.physics = new global.BDBusPhysics();
      this.mechanics = new global.BDBusMechanics(this.save);
      this.company = new global.BDCompanyManager(this.save, this.mechanics);

      this.initThree();
      this.world = new global.BDBangladeshWorld(this.scene);
      this.env = new global.BDEnvironmentManager(this.scene, this.world, this.skyMat, this.hemiLight, this.sunLight);
      this.env.clockHours = this.save.settings.clockHours ?? 14.0;
      this.env.setWeatherPreset(this.save.settings.weather);

      this.passengers = new global.BDPassengerManager(this.scene, this.world);
      this.traffic = new global.BDTrafficManager(this.scene, this.world);
      this.police = new global.BDPoliceManager(this.scene, this.world);
      this.events = new global.BDHighwayEvents(this.scene, this.world);
      this.multiplayer = new global.BDMultiplayerManager(
        this.scene,
        this.save,
        this.company,
        (msg) => this.showToast(msg),
        () => {
          this.refreshMenuStats();
          if (!document.getElementById('online-modal').classList.contains('hidden')) {
            this.phase5ui.renderOnlineModal(false);
          }
        }
      );

      this.busRig = null;
      this.spawnPlayerBus();
      this.navChevrons = this.createNavChevrons();

      this.minimapCanvas = document.getElementById('gps-minimap');
      this.minimapCtx = this.minimapCanvas.getContext('2d');

      this.applyGraphicsQuality(this.save.settings.quality, true);
      this.applyTimeOfDay(this.save.settings.timeOfDay);
      this.updateWeatherButton();
      this.sound.setConfig(this.save.settings.soundOn, this.save.settings.volume);

      this.phase5ui = new global.BDPhase5UI(this);
      this.mapNavUI = global.BDMapNavigatorUI ? new global.BDMapNavigatorUI(this) : null;
      this.bindUI();
      this.bindKeyboard();
      this.bindCameraGestures();
      this.refreshMenuStats();
      this.checkOrientation();

      this.lastTime = performance.now();
      this.lastRenderTime = this.lastTime;
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    initThree() {
      const canvas = document.getElementById('game-canvas');
      this.canvas = canvas;
      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(
        62,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.35,
        750
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      if (THREE.ACESFilmicToneMapping) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
      }

      const skyGeo = new THREE.SphereGeometry(620, 20, 12);
      this.skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color('#2563eb') },
          bottomColor: { value: new THREE.Color('#bae6fd') }
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y;
            float factor = pow(max(h, 0.0), 0.55);
            gl_FragColor = vec4(mix(bottomColor, topColor, factor), 1.0);
          }
        `
      });
      this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
      this.scene.add(this.skyDome);

      this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x3b6633, 0.8);
      this.scene.add(this.hemiLight);

      this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
      this.sunLight.position.set(70, 120, 60);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 260;
      const d = 65;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.scene.add(this.sunLight);
      this.scene.add(this.sunLight.target);

      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.checkOrientation();
      });
    }

    getSelectedBusSpec() {
      return BUS_CATALOG.find((b) => b.id === this.save.selectedBusId) || BUS_CATALOG[0];
    }

    spawnPlayerBus() {
      if (this.busRig && this.busRig.root) {
        this.scene.remove(this.busRig.root);
        if (this.busRig.dispose) this.busRig.dispose();
      }
      const spec = this.getSelectedBusSpec();
      const customHex = this.save.customColors[spec.id] || spec.primaryColor;
      this.busRig = global.BDBusModel.createBusMesh(spec, customHex);
      if (this.busRig.setReflectionQuality) {
        this.busRig.setReflectionQuality(this.save.settings.reflectionQuality || 'medium');
      }
      this.scene.add(this.busRig.root);
      this.placeBusAtLocation('dhaka', 'gazipur');
    }

    createNavChevrons() {
      const chevrons = [];
      for (let i = 0; i < 4; i++) {
        const grp = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.45), mat);
        wingL.rotation.x = -Math.PI / 2;
        wingL.rotation.z = -0.62;
        wingL.position.set(-0.42, 0, 0.1);
        const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.45), mat);
        wingR.rotation.x = -Math.PI / 2;
        wingR.rotation.z = 0.62;
        wingR.position.set(0.42, 0, 0.1);
        grp.add(wingL, wingR);
        grp.visible = false;
        this.scene.add(grp);
        chevrons.push({ group: grp, mat });
      }
      return chevrons;
    }

    placeBusAtLocation(startId, nextId) {
      const startLoc = BANGLADESH_LOCATIONS[startId] || BANGLADESH_LOCATIONS.dhaka;
      // Prefer placing aligned on actual curved road edge if connected
      let edge = null;
      if (this.world && this.world.roadEdges) {
        edge =
          this.world.roadEdges.find((e) => (e.from === startId && e.to === nextId) || (e.to === startId && e.from === nextId)) ||
          this.world.roadEdges.find((e) => e.from === startId || e.to === startId);
      }

      if (edge && edge.samples && edge.samples.length >= 4) {
        const fromStart = edge.from === startId;
        const idx = fromStart ? 0 : edge.samples.length - 1;
        const s = edge.samples[idx];
        const tx = fromStart ? s.tx : -s.tx;
        const tz = fromStart ? s.tz : -s.tz;
        const rx = -tz;
        const rz = tx;
        const x = s.x - rx * 3.4;
        const z = s.z - rz * 3.4;
        const yaw = Math.atan2(-tx, -tz);
        this.physics.reset(x, (s.y || 0) + 0.05, z, yaw);
        this.cameraNeedsSnap = true;
        this.syncBusTransform();
        if (this.traffic && this.traffic.populateNear) {
          this.traffic.populateNear(x, z);
        }
        return;
      }

      const nextLoc = BANGLADESH_LOCATIONS[nextId] || BANGLADESH_LOCATIONS.gazipur;
      const dx = nextLoc.x - startLoc.x;
      const dz = nextLoc.z - startLoc.z;
      const len = Math.max(1, Math.sqrt(dx * dx + dz * dz));
      const tx = dx / len;
      const tz = dz / len;
      const rx = -tz;
      const rz = tx;

      const x = startLoc.x + tx * 24 - rx * 3.4;
      const z = startLoc.z + tz * 24 - rz * 3.4;
      const surf = this.world ? this.world.getSurfaceAt(x, z) : { groundY: 0 };
      const yaw = Math.atan2(-tx, -tz);
      this.physics.reset(x, (surf.groundY || 0) + 0.05, z, yaw);
      this.cameraNeedsSnap = true;
      this.syncBusTransform();
      if (this.traffic && this.traffic.populateNear) {
        this.traffic.populateNear(x, z);
      }
    }

    spawnAtRealLocation(locId) {
      const loc = BANGLADESH_LOCATIONS[locId];
      if (!loc) return;
      const edge = ROAD_NETWORK_EDGES.find((e) => e.from === locId || e.to === locId);
      const nextId = edge ? (edge.from === locId ? edge.to : edge.from) : 'dhaka';
      if (this.mode === 'menu') {
        this.gpsNavRoute = null;
        this.startFreeDrive(locId);
      } else {
        this.paused = false;
        this.gpsNavRoute = null;
        this.placeBusAtLocation(locId, nextId);
        if (this.passengers) this.passengers.hydrateNearbyStops(this.physics.x, this.physics.z);
        this.showToast(`🚌 Departed from ${loc.nameEn} (${loc.nameBn}) • ${loc.lat.toFixed(3)}°N, ${loc.lon.toFixed(3)}°E`);
      }
    }

    navigateByRoadTo(destLocId) {
      const Geo = global.BDGeoData;
      const destLoc = BANGLADESH_LOCATIONS[destLocId];
      if (!Geo || !destLoc) return;
      const nearest = Geo.findNearestLocation(this.physics.x, this.physics.z);
      const fromId = nearest && nearest.location ? nearest.location.id : 'dhaka';
      const path = Geo.findShortestRoadPath(fromId, destLocId);
      if (!path) {
        this.showToast(`No road connection found to ${destLoc.nameEn}.`);
        return;
      }
      const routePayload = {
        destId: destLocId,
        stops: path.stops,
        totalKm: path.totalKm
      };
      if (this.mode === 'menu') {
        this.startFreeDrive(fromId);
      }
      this.gpsNavRoute = routePayload;
      this.gpsNavIndex = path.stops.length > 1 ? 1 : 0;
      this.paused = false;
      this.showToast(`🧭 GPS Road Route to ${destLoc.nameEn}: ${path.totalKm} km (${path.stops.length} stops)`);
    }

    recordVisitedDistrict(locId) {
      const loc = BANGLADESH_LOCATIONS[locId];
      if (!loc || !loc.isDistrict) return false;
      if (!Array.isArray(this.save.visitedDistricts)) {
        this.save.visitedDistricts = [];
      }
      if (!this.save.visitedDistricts.includes(locId)) {
        this.save.visitedDistricts.push(locId);
        return true;
      }
      return false;
    }

    startMissionToLocation(destLocId) {
      const Geo = global.BDGeoData;
      const destLoc = BANGLADESH_LOCATIONS[destLocId];
      if (!Geo || !destLoc || !buildCustomBangladeshMission) return;
      const nearest = Geo.findNearestLocation(this.physics.x, this.physics.z);
      let fromId = nearest && nearest.location ? nearest.location.id : 'dhaka';
      if (fromId === destLocId) {
        fromId = destLocId === 'dhaka' ? 'chittagong' : 'dhaka';
      }
      const mission = buildCustomBangladeshMission(fromId, destLocId);
      if (!mission) {
        this.showToast(`No highway mission available to ${destLoc.nameEn}.`);
        return;
      }
      this.startRouteMission(mission);
    }

    syncBusTransform() {
      if (!this.busRig) return;
      this.busRig.root.position.set(this.physics.x, this.physics.y, this.physics.z);
      this.busRig.root.rotation.y = this.physics.yaw;
    }

    applyGraphicsQuality(qualityKey, preserveCustom) {
      const preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.medium;
      if (!preserveCustom) {
        this.save.settings.shadowQuality = preset.shadowQuality;
        this.save.settings.reflectionQuality = preset.reflectionQuality;
        this.save.settings.textureQuality = preset.textureQuality;
        this.save.settings.fpsLimit = preset.targetFps;
      }
      this.applyDetailedGraphics();
    }

    applyDetailedGraphics() {
      const s = this.save.settings;
      const preset = QUALITY_PRESETS[s.quality] || QUALITY_PRESETS.medium;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio));

      const shadowQ = s.shadowQuality || preset.shadowQuality;
      const shadowsOn = shadowQ !== 'off';
      const shadowSize = shadowQ === 'high' ? 2048 : shadowQ === 'medium' ? 1024 : 512;
      this.renderer.shadowMap.enabled = shadowsOn;
      this.sunLight.castShadow = shadowsOn;
      if (shadowsOn && this.sunLight.shadow.mapSize.width !== shadowSize) {
        this.sunLight.shadow.mapSize.set(shadowSize, shadowSize);
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
      }

      if (this.busRig && this.busRig.shadowBlob) {
        this.busRig.shadowBlob.visible = !shadowsOn;
      }
      if (this.busRig && this.busRig.setReflectionQuality) {
        this.busRig.setReflectionQuality(s.reflectionQuality || 'medium');
      }

      const maxAniso = this.renderer.capabilities && this.renderer.capabilities.getMaxAnisotropy
        ? this.renderer.capabilities.getMaxAnisotropy()
        : 4;
      this.world.setTextureQuality(s.textureQuality || 'medium', maxAniso);
      this.world.setQuality(preset);
      this.traffic.setDensity(preset.trafficCount);
      if (this.env) {
        this.env.setQuality(preset, s);
      }
      this.applyAtmosphere();
    }

    applyTimeOfDay(timeKey) {
      this.save.settings.timeOfDay = timeKey;
      if (this.env) {
        this.env.setTimePreset(timeKey);
      }
      const cfg = TIME_PRESETS[timeKey] || TIME_PRESETS.afternoon;
      if (this.world) {
        const hrs = cfg.clockHours ?? 14;
        const autoOn = hrs >= 17.6 || hrs <= 6.3 || !!cfg.isDark;
        this.world.setNightLights(autoOn ? 1 : 0);
        this.wasStreetLightsOn = autoOn;
      }
      if (cfg.isDark && this.physics.beamMode === 0) {
        this.physics.beamMode = 1;
        this.updateLightsButton();
      }
    }

    applyAtmosphere() {
      if (this.env) {
        this.env.setWeatherPreset(this.save.settings.weather);
        const s = this.save.settings;
        const preset = QUALITY_PRESETS[s.quality] || QUALITY_PRESETS.medium;
        this.env.setQuality(preset, s);
      }
    }

    startRouteMission(route) {
      this.sound.init();
      this.activeRoute = route;
      this.gpsNavRoute = null;
      this.save.selectedRouteId = route.id;
      this.mode = 'career';
      this.paused = false;
      this.missionCompletedFlag = false;
      this.routeStopIndex = 0;
      this.visitedStops = new Set();
      this.sessionFuelCost = 0;
      this.sessionTollCost = 0;
      this.sessionFines = 0;
      this.setCameraMode(0, true);
      this.toggleCameraTray(false);

      const startId = route.stops[0];
      const nextId = route.stops[1] || startId;
      this.placeBusAtLocation(startId, nextId);
      this.busRig.setDestinationBoard(route.nameBn, this.getSelectedBusSpec().name);
      this.busRig.setSeatedCount(0);
      this.passengers.resetSession(route.stops);
      this.police.resetSession();
      this.events.resetSession();

      this.clearInputs();
      this.ensureDrivableSpawnState(route.requiresRefuel ? 24 : null);
      persistSave(this.save);

      document.getElementById('route-modal').classList.add('hidden');
      document.getElementById('mission-complete-modal').classList.add('hidden');
      document.getElementById('main-menu').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('pause-modal').classList.add('hidden');
      document.getElementById('hud-mode-label').textContent = route.nameEn.toUpperCase();
      document.getElementById('hud-fps-wrap').classList.toggle('hidden', !this.save.settings.showFps);

      this.updateTransButtons();
      this.updatePowerModeButton();
      this.updateLightsButton();
      this.updateCamButton();
      this.updateDoorButton();
      this.updateHazardButton();
      this.updateHandbrakeButton();
      this.showToast(
        route.requiresRefuel
          ? `Refuel Mission: Board passengers, stop at a Fuel Pump to refuel & pay, then finish at ${BANGLADESH_LOCATIONS[route.stops[route.stops.length - 1]].nameEn}!`
          : `Mission: ${route.nameEn}. Pull into ${BANGLADESH_LOCATIONS[startId].nameEn} bay to board passengers!`
      );
    }

    startFreeDrive(startLocId) {
      const originId = startLocId && BANGLADESH_LOCATIONS[startLocId] ? startLocId : 'dhaka';
      const connEdge = ROAD_NETWORK_EDGES.find((e) => e.from === originId || e.to === originId);
      const nextId = connEdge ? (connEdge.from === originId ? connEdge.to : connEdge.from) : 'cumilla';
      const originLoc = BANGLADESH_LOCATIONS[originId];

      this.sound.init();
      this.activeRoute = null;
      this.gpsNavRoute = null;
      this.mode = 'freedrive';
      this.paused = false;
      this.missionCompletedFlag = false;
      this.sessionFuelCost = 0;
      this.sessionTollCost = 0;
      this.sessionFines = 0;
      this.setCameraMode(0, true);
      this.toggleCameraTray(false);

      this.placeBusAtLocation(originId, nextId);
      this.busRig.setDestinationBoard(this.getSelectedBusSpec().routeBn, this.getSelectedBusSpec().name);
      this.busRig.setSeatedCount(0);
      this.passengers.resetSession(null);
      this.passengers.hydrateNearbyStops(this.physics.x, this.physics.z);
      this.police.resetSession();
      this.events.resetSession();

      this.clearInputs();
      this.ensureDrivableSpawnState(null);
      persistSave(this.save);

      document.getElementById('main-menu').classList.add('hidden');
      document.getElementById('mission-complete-modal').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('pause-modal').classList.add('hidden');
      document.getElementById('hud-mode-label').textContent = `FREE DRIVE • ${originLoc.nameEn.toUpperCase()}`;
      document.getElementById('hud-fps-wrap').classList.toggle('hidden', !this.save.settings.showFps);

      this.updateTransButtons();
      this.updatePowerModeButton();
      this.updateLightsButton();
      this.updateCamButton();
      this.updateDoorButton();
      this.updateHazardButton();
      this.updateHandbrakeButton();
      this.showToast(`Free Drive (${originLoc.nameEn}): Explore 64 Districts, 8 Divisions, real rivers, bridges & highways!`);
    }

    ensureDrivableSpawnState(forcedFuelPct) {
      this.refueledThisMission = false;
      this.physics.handbrake = false;
      this.physics.doorOpen = false;
      if (typeof forcedFuelPct === 'number') {
        this.save.fuel = forcedFuelPct;
      } else if (this.save.fuel < 25) {
        this.save.fuel = 100;
      }
      const p = this.save.parts;
      const m = this.save.mechanics;
      if (this.save.health < 30) {
        this.mechanics.performRepair('full', false);
      } else if (p.engine <= 15 || m.engineTemp >= 115 || m.battery <= 10) {
        p.engine = Math.max(p.engine, 65);
        m.engineTemp = Math.min(m.engineTemp, 86);
        m.battery = Math.max(m.battery, 75);
        m.oilLevel = Math.max(m.oilLevel, 65);
        m.coolantLevel = Math.max(m.coolantLevel, 65);
        this.mechanics.syncOverallHealth();
      }
    }

    returnToMenu() {
      this.mode = 'menu';
      this.paused = false;
      this.toggleCameraTray(false);
      this.sound.stopHorn();
      this.sound.updateEngine(0, 0, false);
      this.clearInputs();
      this.placeBusAtLocation('dhaka', 'gazipur');
      document.getElementById('hud').classList.add('hidden');
      document.getElementById('pause-modal').classList.add('hidden');
      document.getElementById('mission-complete-modal').classList.add('hidden');
      document.getElementById('main-menu').classList.remove('hidden');
      this.refreshMenuStats();
      persistSave(this.save);
    }

    clearInputs() {
      this.input.left = false;
      this.input.right = false;
      this.input.gas = false;
      this.input.brake = false;
      this.input.horn = false;
      if (this._holdResetters) {
        this._holdResetters.forEach((fn) => fn());
      }
      document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
    }

    showToast(msg) {
      const el = document.getElementById('toast-banner');
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
    }

    vibrate(ms) {
      try {
        if (global.AndroidBridge && global.AndroidBridge.vibrate) {
          global.AndroidBridge.vibrate(ms);
        } else if (navigator.vibrate) {
          navigator.vibrate(ms);
        }
      } catch (_) {}
    }

    checkOrientation() {
      const overlay = document.getElementById('rotate-overlay');
      if (this.dismissedRotate) {
        overlay.classList.add('hidden');
        return;
      }
      const isPortrait = window.innerHeight > window.innerWidth * 1.05;
      overlay.classList.toggle('hidden', !isPortrait);
    }

    initRouteModalControls() {
      if (this._routeModalInitialized) return;
      this._routeModalInitialized = true;

      const fromSel = document.getElementById('custom-route-from');
      const toSel = document.getElementById('custom-route-to');
      const Geo = global.BDGeoData;
      if (fromSel && toSel && Geo && Array.isArray(Geo.BD_DIVISIONS)) {
        const buildOptions = (sel, defaultId) => {
          sel.innerHTML = '';
          Geo.BD_DIVISIONS.forEach((div) => {
            const grp = document.createElement('optgroup');
            grp.label = `${div.nameBn} (${div.nameEn})`;
            Object.values(BANGLADESH_LOCATIONS)
              .filter((l) => l.division === div.id)
              .forEach((loc) => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = `${loc.nameBn} — ${loc.nameEn}${loc.isDistrict ? '' : ' •'}`;
                if (loc.id === defaultId) opt.selected = true;
                grp.appendChild(opt);
              });
            sel.appendChild(grp);
          });
        };
        buildOptions(fromSel, 'dhaka');
        buildOptions(toSel, 'coxsbazar');

        fromSel.addEventListener('change', () => this.updateCustomMissionPreview());
        toSel.addEventListener('change', () => this.updateCustomMissionPreview());
      }

      const randBtn = document.getElementById('btn-random-bd-mission');
      if (randBtn && fromSel && toSel) {
        randBtn.addEventListener('click', () => {
          const allDistricts = Object.values(BANGLADESH_LOCATIONS).filter((l) => l.isDistrict);
          const unvisited = allDistricts.filter((l) => !(this.save.visitedDistricts || []).includes(l.id));
          const originPool = allDistricts;
          const destPool = unvisited.length ? unvisited : allDistricts;
          const a = originPool[Math.floor(Math.random() * originPool.length)];
          let b = destPool[Math.floor(Math.random() * destPool.length)];
          let guard = 0;
          while (b.id === a.id && guard < 10) {
            b = allDistricts[Math.floor(Math.random() * allDistricts.length)];
            guard += 1;
          }
          fromSel.value = a.id;
          toSel.value = b.id;
          this.updateCustomMissionPreview();
        });
      }

      const goBtn = document.getElementById('btn-launch-custom-mission');
      if (goBtn && fromSel && toSel) {
        goBtn.addEventListener('click', () => {
          const fromId = fromSel.value;
          const toId = toSel.value;
          if (!fromId || !toId || fromId === toId) {
            this.showToast('দয়া করে যাত্রা এবং গন্তব্যের জন্য ২টি আলাদা জেলা বেছে নিন!');
            return;
          }
          const mission = buildCustomBangladeshMission(fromId, toId);
          if (!mission) {
            this.showToast('এই ২টি জেলার মধ্যে রুট পাওয়া যায়নি।');
            return;
          }
          this.startRouteMission(mission);
        });
      }

      const filterStrip = document.getElementById('route-division-tabs');
      if (filterStrip) {
        filterStrip.querySelectorAll('.route-filter-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            this.routeRegionFilter = chip.getAttribute('data-region') || 'all';
            filterStrip.querySelectorAll('.route-filter-chip').forEach((c) => {
              c.classList.toggle('active', c === chip);
            });
            this.renderRouteModal();
          });
        });
      }
    }

    updateCustomMissionPreview() {
      const fromSel = document.getElementById('custom-route-from');
      const toSel = document.getElementById('custom-route-to');
      const prevEl = document.getElementById('custom-mission-preview');
      if (!fromSel || !toSel || !prevEl) return;
      if (fromSel.value === toSel.value) {
        prevEl.textContent = '⚠️ যাত্রা ও গন্তব্য আলাদা জেলা নির্বাচন করুন';
        return;
      }
      const m = buildCustomBangladeshMission(fromSel.value, toSel.value);
      if (!m) {
        prevEl.textContent = 'রুট প্রিভিউ লোড হচ্ছে না';
        return;
      }
      prevEl.textContent = `🛣️ ${m.distKm} km • ${m.stops.length} স্টপ • টোল ৳${m.totalToll} • ভাড়া ৳${m.ticketPrice} • বোনাস ৳${m.rewardTaka.toLocaleString()}`;
    }

    renderRouteModal() {
      this.initRouteModalControls();
      this.updateCustomMissionPreview();

      const visitedSet = new Set(Array.isArray(this.save.visitedDistricts) ? this.save.visitedDistricts : []);
      const completedSet = new Set(Array.isArray(this.save.completedRouteIds) ? this.save.completedRouteIds : []);
      const totalDistricts = Object.values(BANGLADESH_LOCATIONS).filter((l) => l.isDistrict).length || 64;
      const visitedDivs = new Set();
      visitedSet.forEach((id) => {
        const loc = BANGLADESH_LOCATIONS[id];
        if (loc && loc.division) visitedDivs.add(loc.division);
      });
      const pct = Math.min(100, Math.round((visitedSet.size / Math.max(1, totalDistricts)) * 100));
      const progLbl = document.getElementById('bd-progress-label');
      const progPct = document.getElementById('bd-progress-pct');
      const progFill = document.getElementById('bd-progress-fill');
      if (progLbl) {
        progLbl.innerHTML = `🇧🇩 সারা বাংলাদেশ ভ্রমণ: <b>${visitedSet.size} / ${totalDistricts} জেলা</b> • <b>${visitedDivs.size} / 8 বিভাগ</b> • <b>${completedSet.size} মিশন</b>`;
      }
      if (progPct) progPct.textContent = `${pct}%`;
      if (progFill) progFill.style.width = `${pct}%`;

      const regionLabels = {
        national: '⭐ জাতীয় এক্সপ্রেস',
        dhaka: 'ঢাকা',
        chattogram: 'চট্টগ্রাম',
        rajshahi: 'রাজশাহী',
        khulna: 'খুলনা',
        barishal: 'বরিশাল',
        sylhet: 'সিলেট',
        rangpur: 'রংপুর',
        mymensingh: 'ময়মনসিংহ',
        custom: 'কাস্টম'
      };

      const grid = document.getElementById('route-grid');
      grid.innerHTML = '';
      const filter = this.routeRegionFilter || 'all';
      const routes = this.company.getAllRoutes().filter((r) => {
        if (filter === 'all') return true;
        if (filter === 'uncompleted') return !completedSet.has(r.id);
        return (r.region || 'custom') === filter;
      });

      if (routes.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:18px;color:#cbd5e1;font-size:12px;">🎉 এই বিভাগের সব মিশন সম্পন্ন হয়েছে! উপরের "কাস্টম বাস্তব মিশন" দিয়ে যেকোনো জেলায় চালান।</div>';
        return;
      }

      routes.forEach((route) => {
        const stats = computeRouteStats ? computeRouteStats(route.stops) : { totalKm: route.distKm || 60, totalToll: 0, districtIds: [] };
        const distKm = route.distKm || stats.totalKm;
        const isDone = completedSet.has(route.id);
        const newDistCount = (stats.districtIds || []).filter((id) => !visitedSet.has(id)).length;
        const card = document.createElement('div');
        card.className = `route-card${isDone ? ' completed' : ''}`;
        const stopNames = route.stops.map((s) => (BANGLADESH_LOCATIONS[s] ? BANGLADESH_LOCATIONS[s].nameEn : s));
        const stopsTxt = stopNames.length <= 6
          ? stopNames.join(' → ')
          : `${stopNames.slice(0, 2).join(' → ')} → … (+${stopNames.length - 4} stops) → ${stopNames.slice(-2).join(' → ')}`;
        const regLabel = regionLabels[route.region || 'custom'] || 'বাংলাদেশ';
        const hwLabel = route.highway ? `${route.highway} • ` : '';

        card.innerHTML = `
          <div class="route-badges">
            <span class="route-badge">${regLabel}</span>
            <span class="route-badge hw">${hwLabel}${distKm} km • ${route.stops.length} stops</span>
            ${isDone ? '<span class="route-badge done">✔ সম্পন্ন</span>' : newDistCount > 0 ? `<span class="route-badge done">+${newDistCount} নতুন জেলা</span>` : ''}
          </div>
          <div class="route-bn">${route.nameBn}</div>
          <h3>${route.nameEn}</h3>
          <div class="route-desc">${route.desc}<br/><b style="color:#a7f3d0">Stops:</b> ${stopsTxt}</div>
          <div class="route-meta">
            <span>🎟️ ৳${route.ticketPrice} ${stats.totalToll > 0 ? `• 🛂 ৳${stats.totalToll}` : ''}</span>
            <span style="color:#34d399;font-weight:800">Bonus: ৳${route.rewardTaka.toLocaleString()}</span>
          </div>
        `;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.style.marginTop = '6px';
        btn.textContent = isDone ? 'PLAY AGAIN' : 'START ROUTE';
        btn.addEventListener('click', () => this.startRouteMission(route));
        card.appendChild(btn);
        grid.appendChild(card);
      });
    }

    completeRouteMission() {
      if (this.missionCompletedFlag || !this.activeRoute) return;
      this.missionCompletedFlag = true;
      this.paused = true;
      this.clearInputs();
      this.sound.stopHorn();
      this.sound.updateEngine(0, 0, false);
      this.sound.playChime();

      if (!Array.isArray(this.save.completedRouteIds)) {
        this.save.completedRouteIds = [];
      }
      if (!this.save.completedRouteIds.includes(this.activeRoute.id)) {
        this.save.completedRouteIds.push(this.activeRoute.id);
      }
      let newlyUnlockedDistricts = 0;
      (this.activeRoute.stops || []).forEach((sid) => {
        if (this.recordVisitedDistrict(sid)) newlyUnlockedDistricts += 1;
      });

      const ticketEarned = this.passengers.ticketIncome;
      const bonus = this.activeRoute.rewardTaka;
      this.save.taka += bonus;
      this.save.tripsCompleted += 1;
      this.save.company.revenueTotal = (this.save.company.revenueTotal || 0) + bonus + ticketEarned;
      this.company.awardXP(240 + newlyUnlockedDistricts * 35);
      this.company.checkAchievements();
      this.mechanics.logEconomy('income', `Route Bonus: ${this.activeRoute.nameEn}`, bonus);
      if (ticketEarned > 0) {
        this.mechanics.logEconomy('income', `Ticket Revenue (${this.passengers.totalBoarded} pax)`, ticketEarned);
      }
      persistSave(this.save);
      if (this.multiplayer && this.multiplayer.auth.signedIn) {
        this.multiplayer.syncProfileToCloud(false);
        this.multiplayer.submitCompetitions();
      }

      const netProfit = ticketEarned + bonus - this.sessionFuelCost - this.sessionTollCost - this.sessionFines;
      const totalVisited = (this.save.visitedDistricts || []).length;
      const districtNote = newlyUnlockedDistricts > 0
        ? ` • 🎉 +${newlyUnlockedDistricts} নতুন জেলা (${totalVisited}/64)`
        : ` • 🗺️ ${totalVisited}/64 জেলা`;

      document.getElementById('mc-title').textContent = 'ROUTE MISSION COMPLETED!';
      document.getElementById('mc-subtitle').textContent = `${this.activeRoute.nameEn} (${this.activeRoute.nameBn})${districtNote}`;
      document.getElementById('mc-pax').textContent = `${this.passengers.totalBoarded}`;
      document.getElementById('mc-tickets').textContent = `+৳ ${ticketEarned.toLocaleString()}`;
      document.getElementById('mc-reward').textContent = `+৳ ${bonus.toLocaleString()}`;
      document.getElementById('mc-fuel').textContent = `-৳ ${Math.round(this.sessionFuelCost).toLocaleString()}`;
      document.getElementById('mc-tolls').textContent = `-৳ ${Math.round(this.sessionTollCost).toLocaleString()}`;
      document.getElementById('mc-fines').textContent = `-৳ ${Math.round(this.sessionFines).toLocaleString()}`;
      document.getElementById('mc-net').textContent = `৳ ${Math.round(netProfit).toLocaleString()}`;

      document.getElementById('mission-complete-modal').classList.remove('hidden');
    }

    bindUI() {
      document.getElementById('btn-dismiss-rotate').addEventListener('click', () => {
        this.dismissedRotate = true;
        document.getElementById('rotate-overlay').classList.add('hidden');
      });

      document.getElementById('btn-start-game').addEventListener('click', () => {
        this.sound.init();
        this.renderRouteModal();
        document.getElementById('route-modal').classList.remove('hidden');
      });
      document.getElementById('btn-free-drive').addEventListener('click', () => this.startFreeDrive());
      const realMapBtn = document.getElementById('btn-real-map');
      if (realMapBtn && this.mapNavUI) {
        realMapBtn.addEventListener('click', () => {
          this.sound.init();
          this.mapNavUI.open('map');
        });
      }
      const hudMapWrap = document.getElementById('hud-minimap-btn');
      if (hudMapWrap && this.mapNavUI) {
        hudMapWrap.addEventListener('click', () => {
          this.paused = true;
          this.clearInputs();
          this.mapNavUI.open('map');
        });
      }
      document.getElementById('btn-company').addEventListener('click', () => {
        this.sound.init();
        this.company.syncActiveBusState();
        this.phase5ui.renderCompanyModal();
        document.getElementById('company-modal').classList.remove('hidden');
      });
      document.getElementById('btn-terminals').addEventListener('click', () => {
        this.sound.init();
        this.phase5ui.renderTerminalsModal();
        document.getElementById('terminals-modal').classList.remove('hidden');
      });
      document.getElementById('btn-economy').addEventListener('click', () => {
        this.sound.init();
        this.phase5ui.renderEconomyModal();
        document.getElementById('economy-modal').classList.remove('hidden');
      });
      document.getElementById('btn-online').addEventListener('click', () => {
        this.sound.init();
        this.phase5ui.renderOnlineModal(true);
        document.getElementById('online-modal').classList.remove('hidden');
      });
      document.getElementById('btn-hud-online').addEventListener('click', () => {
        this.paused = true;
        this.clearInputs();
        this.phase5ui.onlineTab = 'rooms';
        const strip = document.getElementById('online-tabs');
        strip.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === 'rooms'));
        this.phase5ui.renderOnlineModal(false);
        document.getElementById('online-modal').classList.remove('hidden');
      });
      document.getElementById('btn-select-bus').addEventListener('click', () => {
        this.sound.init();
        this.renderBusShop();
        document.getElementById('select-bus-modal').classList.remove('hidden');
      });
      document.getElementById('btn-garage').addEventListener('click', () => {
        this.sound.init();
        this.renderGarage();
        document.getElementById('garage-modal').classList.remove('hidden');
      });
      document.getElementById('btn-settings').addEventListener('click', () => {
        this.sound.init();
        this.syncSettingsUI();
        document.getElementById('settings-modal').classList.remove('hidden');
      });
      document.getElementById('btn-exit').addEventListener('click', () => {
        document.getElementById('exit-modal').classList.remove('hidden');
      });

      document.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-close');
          document.getElementById(targetId).classList.add('hidden');
          if ((targetId === 'online-modal' || targetId === 'bd-map-modal') && this.mode !== 'menu') {
            this.paused = false;
          }
          this.refreshMenuStats();
        });
      });

      // Mission Complete Modal buttons
      document.getElementById('mc-btn-freedrive').addEventListener('click', () => this.startFreeDrive());
      document.getElementById('mc-btn-menu').addEventListener('click', () => this.returnToMenu());
      document.getElementById('mc-btn-next').addEventListener('click', () => {
        const curIdx = ROUTES_CATALOG.findIndex((r) => r.id === (this.activeRoute && this.activeRoute.id));
        const completedSet = new Set(Array.isArray(this.save.completedRouteIds) ? this.save.completedRouteIds : []);
        let nextRoute = null;
        for (let offset = 1; offset <= ROUTES_CATALOG.length; offset++) {
          const candidate = ROUTES_CATALOG[(Math.max(0, curIdx) + offset) % ROUTES_CATALOG.length];
          if (!completedSet.has(candidate.id)) {
            nextRoute = candidate;
            break;
          }
        }
        if (!nextRoute) {
          nextRoute = ROUTES_CATALOG[(curIdx + 1) % ROUTES_CATALOG.length];
        }
        this.startRouteMission(nextRoute);
      });

      document.getElementById('btn-cancel-exit').addEventListener('click', () => {
        document.getElementById('exit-modal').classList.add('hidden');
      });
      document.getElementById('btn-confirm-exit').addEventListener('click', () => {
        persistSave(this.save);
        document.getElementById('exit-modal').classList.add('hidden');
        if (global.AndroidBridge && global.AndroidBridge.exitApp) {
          global.AndroidBridge.exitApp();
        } else {
          this.showToast('Progress saved! You may close this browser tab.');
        }
      });

      // Settings Bindings (Phase 4 Graphics, 24h Day/Night & Dynamic Weather)
      this.bindSegmented('set-quality', (val) => {
        this.save.settings.quality = val;
        this.applyGraphicsQuality(val, false);
        this.syncSettingsUI();
        persistSave(this.save);
      });
      document.getElementById('btn-auto-quality').addEventListener('click', () => {
        const rec = this.env.recommendQuality();
        this.save.settings.quality = rec;
        this.applyGraphicsQuality(rec, false);
        this.syncSettingsUI();
        persistSave(this.save);
        this.showToast(`⚡ Auto-Recommended Graphics: ${rec.toUpperCase()}`);
      });
      this.bindSegmented('set-shadow', (val) => {
        this.save.settings.shadowQuality = val;
        this.applyDetailedGraphics();
        persistSave(this.save);
      });
      this.bindSegmented('set-reflection', (val) => {
        this.save.settings.reflectionQuality = val;
        this.applyDetailedGraphics();
        persistSave(this.save);
      });
      this.bindSegmented('set-texture', (val) => {
        this.save.settings.textureQuality = val;
        this.applyDetailedGraphics();
        persistSave(this.save);
      });
      this.bindSegmented('set-weather-fx', (val) => {
        this.save.settings.weatherEffects = val === 'on';
        this.applyDetailedGraphics();
        persistSave(this.save);
      });
      const drawDistInput = document.getElementById('set-draw-dist');
      drawDistInput.addEventListener('input', () => {
        this.save.settings.drawDistance = parseFloat(drawDistInput.value);
        document.getElementById('draw-dist-val').textContent = drawDistInput.value;
        this.applyDetailedGraphics();
        persistSave(this.save);
      });
      this.bindSegmented('set-fps-limit', (val) => {
        this.save.settings.fpsLimit = parseInt(val, 10) || 60;
        persistSave(this.save);
      });
      this.bindSegmented('set-transmission', (val) => {
        this.save.settings.transmission = val;
        this.updateTransButtons();
        persistSave(this.save);
      });
      this.bindSegmented('set-day-mode', (val) => {
        this.save.settings.dayCycleMode = val;
        persistSave(this.save);
      });
      this.bindSegmented('set-time', (val) => {
        this.applyTimeOfDay(val);
        persistSave(this.save);
      });
      this.bindSegmented('set-weather-mode', (val) => {
        this.save.settings.weatherMode = val;
        persistSave(this.save);
      });
      this.bindSegmented('set-weather', (val) => {
        this.save.settings.weather = val;
        this.applyAtmosphere();
        this.updateWeatherButton();
        persistSave(this.save);
      });
      this.bindSegmented('set-sound', (val) => {
        this.save.settings.soundOn = val === 'on';
        this.sound.setConfig(this.save.settings.soundOn, this.save.settings.volume);
        persistSave(this.save);
      });
      this.bindSegmented('set-fps', (val) => {
        this.save.settings.showFps = val === 'on';
        document.getElementById('hud-fps-wrap').classList.toggle('hidden', !this.save.settings.showFps);
        persistSave(this.save);
      });
      this.bindSegmented('set-fatigue', (val) => {
        this.save.settings.fatigueOn = val === 'on';
        if (!this.save.settings.fatigueOn) this.save.fatigue = 0;
        persistSave(this.save);
      });
      this.bindSegmented('set-robbery', (val) => {
        this.save.settings.robberyOn = val === 'on';
        persistSave(this.save);
      });

      const sensInput = document.getElementById('set-sensitivity');
      sensInput.addEventListener('input', () => {
        this.save.settings.sensitivity = parseFloat(sensInput.value);
        document.getElementById('sens-val').textContent = sensInput.value;
        persistSave(this.save);
      });

      const volInput = document.getElementById('set-volume');
      volInput.addEventListener('input', () => {
        this.save.settings.volume = parseInt(volInput.value, 10);
        document.getElementById('vol-val').textContent = volInput.value;
        this.sound.setConfig(this.save.settings.soundOn, this.save.settings.volume);
        persistSave(this.save);
      });

      // Pause Modal
      document.getElementById('btn-pause').addEventListener('click', () => this.togglePause(true));
      document.getElementById('btn-resume').addEventListener('click', () => this.togglePause(false));
      document.getElementById('btn-restart').addEventListener('click', () => {
        this.recoverBusOnRoad();
        this.togglePause(false);
      });
      document.getElementById('btn-quick-service').addEventListener('click', () => {
        if (this.save.taka >= 500) {
          this.save.taka -= 500;
          this.sessionFuelCost += 500;
          this.save.fuel = 100;
          const p = this.save.parts;
          Object.keys(p).forEach((k) => { p[k] = 100; });
          Object.assign(this.save.mechanics, global.BDGameConfig.createDefaultMechanics());
          this.mechanics.syncOverallHealth();
          this.mechanics.logEconomy('expense', 'Quick Roadside Full Service', 500);
          persistSave(this.save);
          this.sound.playChime();
          this.showToast('Bus refueled & serviced to 100%!');
          this.togglePause(false);
        } else {
          this.showToast('Need ৳ 500 for roadside service!');
        }
      });
      document.getElementById('btn-pause-settings').addEventListener('click', () => {
        this.syncSettingsUI();
        document.getElementById('settings-modal').classList.remove('hidden');
      });
      document.getElementById('btn-to-menu').addEventListener('click', () => this.returnToMenu());

      // Main Menu Garage Service Buttons
      document.getElementById('btn-repair-bus').addEventListener('click', () => {
        const res = this.mechanics.performRepair('full', false);
        if (res.ok) this.sound.playChime();
        this.showToast(res.msg);
        this.renderGarage();
      });

      document.getElementById('btn-refuel-bus').addEventListener('click', () => {
        const res = this.mechanics.refuel(100, 'diesel');
        if (res.ok) this.sound.playChime();
        this.showToast(res.msg);
        this.renderGarage();
      });

      // Phase 3 HUD Action Buttons & Interactive Station Modals
      document.getElementById('btn-hazard').addEventListener('click', () => {
        this.sound.init();
        this.physics.hazardOn = !this.physics.hazardOn;
        this.updateHazardButton();
        this.sound.playTick(true);
      });

      document.getElementById('btn-nav-service').addEventListener('click', () => {
        this.navServiceIndex = (this.navServiceIndex + 1) % NAV_MODES.length;
        const mode = NAV_MODES[this.navServiceIndex];
        const btn = document.getElementById('btn-nav-service');
        if (!mode) {
          btn.textContent = '🧭 NAV';
          btn.classList.remove('active');
          this.showToast('Service GPS pin cleared.');
        } else {
          const st = this.world.getNearestServiceStation(this.physics.x, this.physics.z, mode);
          btn.textContent = `🧭 ${mode.toUpperCase()}`;
          btn.classList.add('active');
          this.showToast(st ? `GPS -> ${st.name} (${Math.round(st.dist)}m)` : `Searching ${mode}`);
        }
      });

      document.getElementById('btn-ledger').addEventListener('click', () => {
        this.paused = true;
        this.clearInputs();
        this.renderLedgerModal();
        document.getElementById('ledger-modal').classList.remove('hidden');
      });

      document.getElementById('btn-emergency').addEventListener('click', () => {
        this.paused = true;
        this.clearInputs();
        this.renderEmergencyModal();
        document.getElementById('emergency-modal').classList.remove('hidden');
      });

      document.getElementById('btn-enter-service').addEventListener('click', () => {
        if (!this.activeServiceZone) return;
        this.paused = true;
        this.clearInputs();
        const kind = this.activeServiceZone.kind;
        if (kind === 'fuel') {
          this.renderFuelModal(this.activeServiceZone.name);
          document.getElementById('fuel-modal').classList.remove('hidden');
        } else if (kind === 'garage') {
          this.renderServiceGarage(this.activeServiceZone.name);
          document.getElementById('service-garage-modal').classList.remove('hidden');
        } else if (kind === 'wash') {
          this.renderWashModal(this.activeServiceZone.name);
          document.getElementById('wash-modal').classList.remove('hidden');
        } else if (kind === 'rest') {
          this.renderRestModal(this.activeServiceZone.name);
          document.getElementById('rest-modal').classList.remove('hidden');
        }
      });

      // Resume automatically when closing Phase 3 service modals during driving
      ['fuel-modal', 'service-garage-modal', 'wash-modal', 'rest-modal', 'emergency-modal', 'ledger-modal'].forEach((id) => {
        const modal = document.getElementById(id);
        const closeBtn = modal.querySelector('[data-close]');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            if (this.mode !== 'menu') this.paused = false;
          });
        }
      });

      // Fuel Station Bindings
      this.bindSegmented('fuel-type-seg', (val) => {
        this.selectedFuelType = val;
        this.renderFuelModal();
      });
      const triggerRefuel = (amt) => {
        const wrap = document.getElementById('fuel-progress-wrap');
        const bar = document.getElementById('fuel-anim-bar');
        wrap.classList.remove('hidden');
        bar.style.width = '15%';
        setTimeout(() => { bar.style.width = '100%'; }, 80);
        setTimeout(() => {
          wrap.classList.add('hidden');
          bar.style.width = '0%';
          const res = this.mechanics.refuel(amt, this.selectedFuelType);
          if (res.ok) {
            this.sessionFuelCost += res.cost;
            this.refueledThisMission = true;
            this.sound.playChime();
          }
          this.showToast(res.msg);
          this.renderFuelModal();
        }, 420);
      };
      document.getElementById('btn-refuel-25').addEventListener('click', () => triggerRefuel(25));
      document.getElementById('btn-refuel-50').addEventListener('click', () => triggerRefuel(50));
      document.getElementById('btn-refuel-full').addEventListener('click', () => triggerRefuel(100));

      // Repair Garage Insurance Toggle
      this.bindSegmented('repair-use-insurance', (val) => {
        this.repairUseInsurance = val === 'yes';
        this.renderServiceGarage();
      });

      // Bus Wash Button
      document.getElementById('btn-start-wash').addEventListener('click', () => {
        const res = this.mechanics.washBus();
        if (!res.ok) return this.showToast(res.msg);
        this.washingAnimTimer = 2.6;
        const wrap = document.getElementById('wash-anim-wrap');
        const bar = document.getElementById('wash-anim-bar');
        wrap.classList.remove('hidden');
        bar.style.width = '10%';
        setTimeout(() => { bar.style.width = '100%'; }, 90);
        setTimeout(() => {
          wrap.classList.add('hidden');
          bar.style.width = '0%';
          this.sound.playChime();
          this.showToast(res.msg);
          this.renderWashModal();
        }, 650);
      });

      // Rest Stop Buttons
      ['tea', 'meal', 'sleep'].forEach((kind) => {
        document.getElementById(`btn-rest-${kind}`).addEventListener('click', () => {
          const res = this.mechanics.restDriver(kind);
          if (res.ok) this.sound.playChime();
          this.showToast(res.msg);
          this.renderRestModal();
        });
      });

      // Highway Robbery Decision Buttons
      const handleRobberyChoice = (action) => {
        const res = this.events.resolveEncounter(action);
        document.getElementById('robbery-modal').classList.add('hidden');
        this.paused = false;
        if (res.type === 'paid') {
          const paid = Math.min(this.save.taka, res.cost);
          this.save.taka -= paid;
          this.mechanics.logEconomy('expense', 'Highway Safe Passage Fee', paid);
        } else if (res.type === 'police') {
          this.save.taka += res.reward;
          this.mechanics.logEconomy('income', 'Police Assistance Reward', res.reward);
          this.sound.playChime();
        }
        persistSave(this.save);
        this.showToast(res.msg);
      };
      document.getElementById('btn-rob-police').addEventListener('click', () => handleRobberyChoice('police'));
      document.getElementById('btn-rob-bypass').addEventListener('click', () => handleRobberyChoice('bypass'));
      document.getElementById('btn-rob-escape').addEventListener('click', () => handleRobberyChoice('escape'));
      document.getElementById('btn-rob-pay').addEventListener('click', () => handleRobberyChoice('pay'));

      // Emergency Modal Buttons
      document.getElementById('btn-emg-hazard').addEventListener('click', () => {
        this.physics.hazardOn = !this.physics.hazardOn;
        this.updateHazardButton();
        this.sound.playTick(true);
        this.showToast(this.physics.hazardOn ? '⚠️ Hazard lights ON' : 'Hazard lights OFF');
      });
      document.getElementById('btn-emg-kit').addEventListener('click', () => {
        const res = this.mechanics.useEmergencyKit();
        if (res.ok) this.sound.playChime();
        this.showToast(res.msg);
        this.renderEmergencyModal();
      });
      document.getElementById('btn-emg-tow').addEventListener('click', () => {
        const res = this.mechanics.requestTowRecovery();
        if (!res.ok) return this.showToast(res.msg);
        const gar = this.world.getNearestServiceStation(this.physics.x, this.physics.z, 'garage');
        if (gar) {
          this.physics.reset(gar.x, 0.05, gar.z, this.physics.yaw);
          this.syncBusTransform();
        } else {
          this.recoverBusOnRoad();
        }
        this.sound.playChime();
        document.getElementById('emergency-modal').classList.add('hidden');
        this.paused = false;
        this.showToast(res.msg);
      });
      document.getElementById('btn-emg-evac').addEventListener('click', () => {
        this.physics.speedMs = 0;
        this.physics.handbrake = true;
        this.physics.doorOpen = true;
        this.physics.hazardOn = true;
        this.updateDoorButton();
        this.updateHazardButton();
        document.getElementById('btn-handbrake').classList.add('active');
        const evacuated = this.passengers.onboard.length;
        this.passengers.onboard = [];
        this.busRig.setSeatedCount(0);
        this.sound.playAirBrake();
        document.getElementById('emergency-modal').classList.add('hidden');
        this.paused = false;
        this.showToast(`🚨 Emergency Evacuation: ${evacuated} passengers safely disembarked!`);
      });

      // Insurance Toggle in Ledger
      document.getElementById('btn-toggle-insurance').addEventListener('click', () => {
        const res = this.mechanics.toggleInsurance();
        if (res.ok) this.sound.playChime();
        this.showToast(res.msg);
        this.renderLedgerModal();
      });

      // Touch Controls
      this.bindHoldControl('btn-steer-left', 'left');
      this.bindHoldControl('btn-steer-right', 'right');
      this.bindHoldControl('btn-gas', 'gas');
      this.bindHoldControl('btn-brake', 'brake');

      const hornBtn = document.getElementById('btn-horn');
      const hornPointers = new Set();
      this._holdResetters.push(() => {
        hornPointers.clear();
        this.input.horn = false;
        hornBtn.classList.remove('pressed');
      });
      const startHorn = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hornPointers.add(e.pointerId);
        try {
          if (hornBtn.setPointerCapture) hornBtn.setPointerCapture(e.pointerId);
        } catch (_) {}
        if (!this.input.horn) {
          this.input.horn = true;
          hornBtn.classList.add('pressed');
          this.sound.startHorn();
          this.vibrate(25);
        }
      };
      const stopHorn = (e) => {
        if (e && e.pointerId !== undefined) {
          if (!hornPointers.has(e.pointerId)) return;
          hornPointers.delete(e.pointerId);
          try {
            if (hornBtn.releasePointerCapture && hornBtn.hasPointerCapture && hornBtn.hasPointerCapture(e.pointerId)) {
              hornBtn.releasePointerCapture(e.pointerId);
            }
          } catch (_) {}
        } else {
          hornPointers.clear();
        }
        if (hornPointers.size === 0) {
          this.input.horn = false;
          hornBtn.classList.remove('pressed');
          this.sound.stopHorn();
        }
      };
      hornBtn.addEventListener('pointerdown', startHorn);
      hornBtn.addEventListener('pointerup', stopHorn);
      hornBtn.addEventListener('pointercancel', stopHorn);
      hornBtn.addEventListener('lostpointercapture', stopHorn);
      hornBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('pointerup', stopHorn);
      window.addEventListener('pointercancel', stopHorn);

      document.getElementById('btn-door').addEventListener('click', () => this.toggleDoor());
      const paxDoorBtn = document.getElementById('btn-pax-door');
      if (paxDoorBtn) paxDoorBtn.addEventListener('click', () => this.toggleDoor());
      document.getElementById('btn-weather').addEventListener('click', () => {
        this.sound.init();
        const curIdx = this.weatherOrder.indexOf(this.save.settings.weather);
        const nextId = this.weatherOrder[(curIdx + 1) % this.weatherOrder.length];
        this.save.settings.weather = nextId;
        this.applyAtmosphere();
        this.updateWeatherButton();
        persistSave(this.save);
        const wp = WEATHER_PRESETS[nextId];
        this.showToast(`${wp.icon} Weather: ${wp.name}`);
      });

      document.getElementById('btn-handbrake').addEventListener('click', () => {
        this.sound.init();
        this.physics.handbrake = !this.physics.handbrake;
        if (this.physics.handbrake) this.sound.playAirBrake();
        document.getElementById('btn-handbrake').classList.toggle('active', this.physics.handbrake);
        this.vibrate(20);
      });

      document.getElementById('btn-lights').addEventListener('click', () => {
        this.sound.init();
        this.physics.beamMode = (this.physics.beamMode + 1) % 3;
        this.sound.playTick(true);
        this.updateLightsButton();
        const beamLabels = ['Headlights OFF', 'Low Beam ON', 'High Beam ON'];
        this.showToast(`💡 ${beamLabels[this.physics.beamMode]}`);
      });

      document.getElementById('btn-ind-left').addEventListener('click', () => this.toggleIndicator('left'));
      document.getElementById('btn-ind-right').addEventListener('click', () => this.toggleIndicator('right'));
      document.getElementById('btn-cam').addEventListener('click', () => this.cycleCamera());
      const camTrayBtn = document.getElementById('btn-cam-tray');
      if (camTrayBtn) {
        camTrayBtn.addEventListener('click', () => this.toggleCameraTray());
      }
      const camResetBtn = document.getElementById('btn-cam-reset');
      if (camResetBtn) {
        camResetBtn.addEventListener('click', () => this.resetCameraView(false));
      }
      document.querySelectorAll('#cam-view-tray .cam-chip-btn').forEach((chip) => {
        chip.addEventListener('click', () => {
          const idx = Number(chip.getAttribute('data-cam'));
          this.setCameraMode(idx, false);
          this.toggleCameraTray(false);
        });
      });

      document.getElementById('btn-gear-up').addEventListener('click', () => {
        this.sound.init();
        this.physics.shiftUp(this.save.settings.transmission);
        this.sound.playGearShift();
      });
      document.getElementById('btn-gear-down').addEventListener('click', () => {
        this.sound.init();
        this.physics.shiftDown(this.save.settings.transmission);
        this.sound.playGearShift();
      });
      document.getElementById('btn-trans-toggle').addEventListener('click', () => {
        this.sound.init();
        this.save.settings.transmission = this.save.settings.transmission === 'auto' ? 'manual' : 'auto';
        this.sound.playGearShift();
        this.updateTransButtons();
        persistSave(this.save);
        this.showToast(`Transmission: ${this.save.settings.transmission.toUpperCase()}`);
      });
      const powerBtn = document.getElementById('btn-power-mode');
      if (powerBtn) {
        powerBtn.addEventListener('click', () => this.togglePowerMode());
      }

      global.onAppPause = () => {
        if (this.mode !== 'menu' && !this.paused) this.togglePause(true);
        this.sound.stopHorn();
      };

      global.onAndroidBack = () => {
        if (this.camTrayOpen) {
          this.toggleCameraTray(false);
          return;
        }
        const mcModal = document.getElementById('mission-complete-modal');
        if (mcModal && !mcModal.classList.contains('hidden')) {
          mcModal.classList.add('hidden');
          this.returnToMenu();
          return;
        }
        const robberyModal = document.getElementById('robbery-modal');
        if (robberyModal && !robberyModal.classList.contains('hidden')) {
          return;
        }
        const openModals = [
          'bd-map-modal', 'fuel-modal', 'service-garage-modal', 'wash-modal', 'rest-modal',
          'emergency-modal', 'ledger-modal', 'company-modal', 'terminals-modal',
          'economy-modal', 'online-modal', 'route-modal', 'select-bus-modal',
          'garage-modal', 'settings-modal', 'exit-modal'
        ];
        for (const id of openModals) {
          const el = document.getElementById(id);
          if (el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
            if (this.mode !== 'menu') this.paused = false;
            return;
          }
        }
        if (this.mode !== 'menu') this.togglePause(!this.paused);
        else document.getElementById('exit-modal').classList.remove('hidden');
      };
    }

    updateHazardButton() {
      const btn = document.getElementById('btn-hazard');
      if (btn) btn.classList.toggle('active', !!this.physics.hazardOn);
    }

    updateHandbrakeButton() {
      const btn = document.getElementById('btn-handbrake');
      if (btn) btn.classList.toggle('active', !!this.physics.handbrake);
    }

    renderFuelModal(title) {
      if (title) document.getElementById('fuel-station-title').textContent = title.toUpperCase();
      const fuelPct = Math.round(this.save.fuel);
      document.getElementById('fuel-modal-bar').style.width = `${fuelPct}%`;
      document.getElementById('fuel-modal-pct').textContent = `${fuelPct}%`;
      const missing = Math.max(0, 100 - this.save.fuel);
      document.getElementById('fuel-cost-25').textContent = `৳${this.mechanics.calculateFuelCost(Math.min(25, missing), this.selectedFuelType)}`;
      document.getElementById('fuel-cost-50').textContent = `৳${this.mechanics.calculateFuelCost(Math.min(50, missing), this.selectedFuelType)}`;
      document.getElementById('fuel-cost-full').textContent = `৳${this.mechanics.calculateFuelCost(missing, this.selectedFuelType)}`;
    }

    renderServiceGarage(title) {
      if (title) document.getElementById('repair-station-title').textContent = title.toUpperCase();
      document.getElementById('repair-taka').textContent = `৳ ${this.save.taka.toLocaleString()}`;
      document.getElementById('repair-health').textContent = `${Math.round(this.save.health)}%`;
      document.getElementById('repair-ins-status').textContent = this.save.insurance.active ? 'Active' : 'Paused';

      const grid = document.getElementById('repair-services-grid');
      grid.innerHTML = '';
      REPAIR_SERVICES.forEach((svc) => {
        const rawCost = this.mechanics.getRepairCost(svc.id);
        const canIns = this.repairUseInsurance && this.save.insurance.active && rawCost >= 400;
        const payCost = canIns ? Math.round(rawCost * (1 - this.save.insurance.coveragePct / 100)) : rawCost;
        const card = document.createElement('div');
        card.className = 'repair-card';
        card.innerHTML = `<div><strong>${svc.name}</strong><small>${rawCost <= 0 ? 'Condition OK' : canIns ? `Total ৳${rawCost} → Pay ৳${payCost} (Insured)` : `Repair Cost: ৳${rawCost}`}</small></div>`;
        const btn = document.createElement('button');
        btn.className = `btn ${rawCost <= 0 ? 'btn-secondary' : 'btn-primary'}`;
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '11px';
        if (rawCost <= 0) {
          btn.textContent = '100% OK';
          btn.disabled = true;
        } else {
          btn.textContent = `REPAIR ৳${payCost}`;
          btn.addEventListener('click', () => {
            const wrap = document.getElementById('repair-progress-wrap');
            const bar = document.getElementById('repair-anim-bar');
            document.getElementById('repair-anim-label').textContent = svc.name;
            wrap.classList.remove('hidden');
            bar.style.width = '20%';
            setTimeout(() => { bar.style.width = '100%'; }, 70);
            setTimeout(() => {
              wrap.classList.add('hidden');
              bar.style.width = '0%';
              const res = this.mechanics.performRepair(svc.id, this.repairUseInsurance);
              if (res.ok) this.sound.playChime();
              this.showToast(res.msg);
              this.renderServiceGarage();
            }, 380);
          });
        }
        card.appendChild(btn);
        grid.appendChild(card);
      });
    }

    renderWashModal(title) {
      if (title) document.getElementById('wash-station-title').textContent = title.toUpperCase();
      const clean = Math.round(this.save.cleanliness);
      document.getElementById('wash-clean-bar').style.width = `${clean}%`;
      document.getElementById('wash-clean-txt').textContent = `${clean}%`;
    }

    renderRestModal(title) {
      if (title) document.getElementById('rest-station-title').textContent = title.toUpperCase();
      const fat = Math.round(this.save.fatigue);
      document.getElementById('rest-fatigue-bar').style.width = `${fat}%`;
      document.getElementById('rest-fatigue-txt').textContent = `${fat}%`;
    }

    renderEmergencyModal() {
      const m = this.save.mechanics;
      document.getElementById('emergency-diag-txt').textContent =
        `Health: ${Math.round(this.save.health)}% • Fuel: ${Math.round(this.save.fuel)}% • Temp: ${Math.round(m.engineTemp)}°C • ${m.punctured ? 'FLAT TIRE!' : 'Tires OK'}`;
    }

    renderLedgerModal() {
      const p = this.save.parts;
      const m = this.save.mechanics;
      const partLabels = [
        ['Front Bumper', p.frontBumper], ['Rear Bumper', p.rearBumper],
        ['Windshield', p.windshield], ['Side Windows', p.sideWindows],
        ['Headlights', p.headlights], ['Tail Lights', p.tailLights],
        ['Doors', p.doors], ['Tires', p.tires],
        ['Engine', p.engine], ['Radiator', p.radiator],
        ['Suspension', p.suspension], ['Body Panels', p.bodyPanels]
      ];
      const grid = document.getElementById('ledger-parts-grid');
      grid.innerHTML = partLabels.map(([name, val]) => {
        const pct = Math.round(val);
        const col = pct < 50 ? '#fb7185' : pct < 80 ? '#fbbf24' : '#34d399';
        return `<div class="part-chip"><span>${name}</span><strong style="color:${col}">${pct}%</strong></div>`;
      }).join('');

      document.getElementById('ledger-mech-summary').textContent =
        `Oil: ${Math.round(m.oilLevel)}% • Coolant: ${Math.round(m.coolantLevel)}% • Brakes: ${Math.round(m.brakeCondition)}% • Battery: ${Math.round(m.battery)}% • Tire PSI: ${Math.round(m.tirePressure)}%${m.punctured ? ' (PUNCTURED!)' : ''}`;
      document.getElementById('ledger-ins-txt').textContent =
        `Insurance: ${this.save.insurance.active ? 'ACTIVE (70% Coverage)' : 'PAUSED (৳2,500)'} • Claims: ${this.save.insurance.claimsCount}`;

      const list = document.getElementById('ledger-history-list');
      const items = [];
      this.save.accidentReports.slice(0, 6).forEach((r) => {
        items.push(`<div class="history-item accident"><b>🚨 ${r.severity} ACCIDENT (${r.time})</b><br/>${r.cause} • Est Repair: ৳${r.repairEstimate} (${r.parts})</div>`);
      });
      this.save.economyHistory.slice(0, 12).forEach((e) => {
        const sign = e.type === 'expense' ? '-৳' : '+৳';
        items.push(`<div class="history-item ${e.type}"><b>${e.label}</b> (${e.time}) <span style="float:right;font-weight:800">${sign}${e.amount.toLocaleString()}</span></div>`);
      });
      list.innerHTML = items.length ? items.join('') : '<div class="modal-sub">No accidents or transactions recorded yet.</div>';
    }

    toggleDoor() {
      this.sound.init();
      if (Math.abs(this.physics.speedMs) * 3.6 > 6) {
        this.showToast('Slow down under 6 km/h to open bus doors!');
        return;
      }
      this.physics.doorOpen = !this.physics.doorOpen;
      this.sound.playDoorPneumatic();
      this.updateDoorButton();
    }

    updateDoorButton() {
      const btn = document.getElementById('btn-door');
      btn.classList.toggle('active', this.physics.doorOpen);
      btn.textContent = this.physics.doorOpen ? '🚪 OPEN' : '🚪 DOOR';
      const paxBtn = document.getElementById('btn-pax-door');
      if (paxBtn) {
        paxBtn.classList.toggle('open', this.physics.doorOpen);
        paxBtn.textContent = this.physics.doorOpen ? '🚪 বন্ধ' : '🚪 খুলুন';
      }
    }

    updateWeatherButton() {
      const btn = document.getElementById('btn-weather');
      const wp = WEATHER_PRESETS[this.save.settings.weather] || WEATHER_PRESETS.sunny;
      btn.textContent = wp.icon;
      btn.classList.toggle('active', wp.id !== 'sunny');
    }

    bindHoldControl(elementId, inputKey) {
      const btn = document.getElementById(elementId);
      if (!btn) return;
      const activePointers = new Set();
      this._holdResetters.push(() => {
        activePointers.clear();
        this.input[inputKey] = false;
        btn.classList.remove('pressed');
      });

      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.sound.init();
        activePointers.add(e.pointerId);
        try {
          if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
        } catch (_) {}
        this.input[inputKey] = true;
        btn.classList.add('pressed');
      };

      const up = (e) => {
        if (e && e.pointerId !== undefined) {
          if (!activePointers.has(e.pointerId)) return;
          activePointers.delete(e.pointerId);
          try {
            if (btn.releasePointerCapture && btn.hasPointerCapture && btn.hasPointerCapture(e.pointerId)) {
              btn.releasePointerCapture(e.pointerId);
            }
          } catch (_) {}
        } else {
          activePointers.clear();
        }
        if (activePointers.size === 0) {
          this.input[inputKey] = false;
          btn.classList.remove('pressed');
        }
      };

      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    bindSegmented(containerId, onSelect) {
      const container = document.getElementById(containerId);
      container.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          onSelect(btn.getAttribute('data-val'));
        });
      });
    }

    bindKeyboard() {
      const setKey = (code, pressed) => {
        if (this.mode === 'menu') return;
        switch (code) {
          case 'ArrowLeft':
          case 'KeyA':
            this.input.left = pressed;
            document.getElementById('btn-steer-left').classList.toggle('pressed', pressed);
            break;
          case 'ArrowRight':
          case 'KeyD':
            this.input.right = pressed;
            document.getElementById('btn-steer-right').classList.toggle('pressed', pressed);
            break;
          case 'ArrowUp':
          case 'KeyW':
            this.input.gas = pressed;
            document.getElementById('btn-gas').classList.toggle('pressed', pressed);
            break;
          case 'ArrowDown':
          case 'KeyS':
            this.input.brake = pressed;
            document.getElementById('btn-brake').classList.toggle('pressed', pressed);
            break;
          case 'KeyH':
            if (pressed && !this.input.horn) {
              this.input.horn = true;
              this.sound.startHorn();
              document.getElementById('btn-horn').classList.add('pressed');
            } else if (!pressed && this.input.horn) {
              this.input.horn = false;
              this.sound.stopHorn();
              document.getElementById('btn-horn').classList.remove('pressed');
            }
            break;
        }
      };

      window.addEventListener('keydown', (e) => {
        this.sound.init();
        if (e.repeat && ['Space', 'KeyC', 'KeyV', 'KeyL', 'KeyQ', 'KeyE', 'KeyO', 'Escape'].includes(e.code)) return;
        setKey(e.code, true);
        if (this.mode === 'menu') return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.physics.handbrake = !this.physics.handbrake;
          document.getElementById('btn-handbrake').classList.toggle('active', this.physics.handbrake);
        } else if (e.code === 'KeyO') {
          this.toggleDoor();
        } else if (e.code === 'KeyC') {
          this.cycleCamera();
        } else if (e.code === 'KeyV') {
          this.toggleCameraTray();
        } else if (e.code >= 'Digit1' && e.code <= 'Digit9') {
          const idx = Number(e.code.replace('Digit', '')) - 1;
          if (idx >= 0 && idx < CAMERA_MODES.length) {
            this.setCameraMode(idx, false);
            this.toggleCameraTray(false);
          }
        } else if (e.code === 'KeyL') {
          this.physics.beamMode = (this.physics.beamMode + 1) % 3;
          this.updateLightsButton();
        } else if (e.code === 'KeyQ') {
          this.toggleIndicator('left');
        } else if (e.code === 'KeyE') {
          this.toggleIndicator('right');
        } else if (e.code === 'KeyB') {
          this.togglePowerMode();
        } else if (e.code === 'ShiftLeft' || e.code === 'Equal') {
          this.physics.shiftUp(this.save.settings.transmission);
          this.sound.playGearShift();
        } else if (e.code === 'ControlLeft' || e.code === 'Minus') {
          this.physics.shiftDown(this.save.settings.transmission);
          this.sound.playGearShift();
        } else if (e.code === 'Escape') {
          if (this.camTrayOpen) {
            this.toggleCameraTray(false);
          } else {
            this.togglePause(!this.paused);
          }
        }
      });

      window.addEventListener('keyup', (e) => setKey(e.code, false));
      window.addEventListener('blur', () => this.clearInputs());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.clearInputs();
      });
    }

    toggleIndicator(side) {
      this.sound.init();
      if (side === 'left') {
        this.physics.indLeft = !this.physics.indLeft;
        if (this.physics.indLeft) this.physics.indRight = false;
      } else {
        this.physics.indRight = !this.physics.indRight;
        if (this.physics.indRight) this.physics.indLeft = false;
      }
      document.getElementById('btn-ind-left').classList.toggle('active', this.physics.indLeft);
      document.getElementById('btn-ind-right').classList.toggle('active', this.physics.indRight);
    }

    bindCameraGestures() {
      const canvas = this.canvas;
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        if (this.paused) return;
        this._camDrag.active = true;
        this._camDrag.pointerId = e.pointerId;
        this._camDrag.lastX = e.clientX;
        this._camDrag.lastY = e.clientY;
        this._camDrag.moved = 0;
        if (this.camTrayOpen) this.toggleCameraTray(false);
      });

      window.addEventListener('pointermove', (e) => {
        if (!this._camDrag.active || e.pointerId !== this._camDrag.pointerId) return;
        const dx = e.clientX - this._camDrag.lastX;
        const dy = e.clientY - this._camDrag.lastY;
        this._camDrag.lastX = e.clientX;
        this._camDrag.lastY = e.clientY;
        this._camDrag.moved += Math.abs(dx) + Math.abs(dy);

        if (this.mode === 'menu') {
          this.showroomAngle -= dx * 0.008;
          return;
        }
        if (this.paused) return;

        const cam = CAMERA_MODES[this.cameraModeIndex] || CAMERA_MODES[0];
        if (cam.type === 'orbit') {
          this.camLookYaw -= dx * 0.0065;
          this.camLookPitch = Math.max(-0.28, Math.min(0.72, this.camLookPitch + dy * 0.0045));
        } else {
          const maxYaw = cam.id === 'CABIN' ? 2.4 : cam.id === 'ROOF' ? Math.PI : cam.id === 'REAR' ? 1.35 : 1.85;
          this.camLookYaw = Math.max(-maxYaw, Math.min(maxYaw, this.camLookYaw - dx * 0.0055));
          this.camLookPitch = Math.max(-0.42, Math.min(0.48, this.camLookPitch - dy * 0.004));
        }
      });

      const endDrag = (e) => {
        if (!this._camDrag.active || e.pointerId !== this._camDrag.pointerId) return;
        const wasTap = this._camDrag.moved < 8;
        this._camDrag.active = false;
        this._camDrag.pointerId = null;
        if (wasTap && this.mode !== 'menu' && !this.paused) {
          const now = performance.now();
          if (now - this._camDrag.lastTapMs < 320) {
            this.resetCameraView(false);
            this._camDrag.lastTapMs = 0;
          } else {
            this._camDrag.lastTapMs = now;
          }
        }
      };
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);

      canvas.addEventListener('wheel', (e) => {
        if (this.mode === 'menu' || this.paused) return;
        const cam = CAMERA_MODES[this.cameraModeIndex];
        if (cam && cam.type === 'orbit') {
          this.camOrbitDist = Math.max(7.0, Math.min(24.0, this.camOrbitDist + e.deltaY * 0.01));
        }
      }, { passive: true });
    }

    setCameraMode(idxOrId, silent) {
      let idx = typeof idxOrId === 'number'
        ? idxOrId
        : CAMERA_MODES.findIndex((c) => c.id === idxOrId);
      if (idx < 0 || idx >= CAMERA_MODES.length) idx = 0;
      this.cameraModeIndex = idx;
      const cam = CAMERA_MODES[idx];
      this.camLookYaw = cam.id === 'ORBIT' ? -0.68 : 0;
      this.camLookPitch = 0;
      this.camOrbitDist = cam.id === 'FOLLOW' ? 15.2 : cam.id === 'ORBIT' ? 12.2 : 10.6;
      this.cameraNeedsSnap = true;
      this.updateCamButton();
      if (!silent) {
        this.sound.playTick(true);
        this.showToast(`${cam.icon} ${cam.label} — ${cam.nameBn}`);
      }
    }

    resetCameraView(silent) {
      const cam = CAMERA_MODES[this.cameraModeIndex] || CAMERA_MODES[0];
      this.camLookYaw = cam.id === 'ORBIT' ? -0.68 : 0;
      this.camLookPitch = 0;
      this.camOrbitDist = cam.id === 'FOLLOW' ? 15.2 : cam.id === 'ORBIT' ? 12.2 : 10.6;
      if (!silent) {
        this.sound.playTick(false);
        this.showToast(`↺ View Reset (${cam.label})`);
      }
    }

    toggleCameraTray(forceOpen) {
      const tray = document.getElementById('cam-view-tray');
      const btn = document.getElementById('btn-cam-tray');
      if (!tray) return;
      this.camTrayOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.camTrayOpen;
      tray.classList.toggle('hidden', !this.camTrayOpen);
      if (btn) btn.classList.toggle('active', this.camTrayOpen);
    }

    cycleCamera() {
      this.setCameraMode((this.cameraModeIndex + 1) % CAMERA_MODES.length, false);
    }

    updateCamButton() {
      const cam = CAMERA_MODES[this.cameraModeIndex] || CAMERA_MODES[0];
      const btn = document.getElementById('btn-cam');
      if (btn) btn.textContent = `${cam.icon} ${cam.label}`;
      document.querySelectorAll('#cam-view-tray .cam-chip-btn').forEach((chip) => {
        chip.classList.toggle('active', Number(chip.getAttribute('data-cam')) === this.cameraModeIndex);
      });
    }

    updateLightsButton() {
      const btn = document.getElementById('btn-lights');
      const bm = this.physics.beamMode;
      btn.textContent = bm === 2 ? '🔆 HIGH' : bm === 1 ? '💡 LOW' : '💡 OFF';
      btn.classList.toggle('active', bm > 0);
    }

    updateTransButtons() {
      const mode = this.save.settings.transmission.toUpperCase();
      document.getElementById('btn-trans-label').textContent = mode;
      document.getElementById('hud-trans-mode').textContent = mode;
    }

    togglePowerMode() {
      this.sound.init();
      this.physics.powerMode = !this.physics.powerMode;
      this.sound.playGearShift();
      this.updatePowerModeButton();
      this.vibrate(25);
      this.showToast(
        this.physics.powerMode
          ? '⚡ POWER MODE ON — +28% ইঞ্জিন টর্ক ও সর্বোচ্চ গতি চালু!'
          : '🌿 ECO MODE — সাশ্রয়ী জ্বালানি ড্রাইভিং'
      );
    }

    updatePowerModeButton() {
      const btn = document.getElementById('btn-power-mode');
      const lbl = document.getElementById('btn-power-label');
      if (btn) btn.classList.toggle('active', !!this.physics.powerMode);
      if (lbl) lbl.textContent = this.physics.powerMode ? 'PWR+' : 'ECO';
    }

    togglePause(shouldPause) {
      this.paused = shouldPause;
      this.clearInputs();
      this.sound.stopHorn();
      if (shouldPause) {
        this.toggleCameraTray(false);
        this.sound.updateEngine(0, 0, false);
        const bus = this.getSelectedBusSpec();
        document.getElementById('pause-summary').textContent =
          `${bus.name} • Tickets: +৳${this.passengers.ticketIncome} • Tolls: -৳${this.sessionTollCost} • Fines: -৳${this.sessionFines}`;
      }
      document.getElementById('pause-modal').classList.toggle('hidden', !shouldPause);
      persistSave(this.save);
    }

    recoverBusOnRoad() {
      const surf = this.world.getSurfaceAt(this.physics.x, this.physics.z);
      const s = surf.nearestSample;
      const yaw = Math.atan2(-s.tx, -s.tz);
      this.physics.reset(s.x - s.rx * 3.4, s.y, s.z - s.rz * 3.4, yaw);
      this.cameraNeedsSnap = true;
      this.updateHandbrakeButton();
      this.updateDoorButton();
      this.syncBusTransform();
      this.showToast('Bus positioned safely in left highway lane.');
    }

    refreshMenuStats() {
      const bus = this.getSelectedBusSpec();
      document.getElementById('menu-taka').textContent = `৳ ${this.save.taka.toLocaleString()}`;
      document.getElementById('menu-distance').textContent = `${this.save.totalDistanceKm.toFixed(1)} km`;
      document.getElementById('menu-trips').textContent = `${this.save.tripsCompleted}`;
      const lvlEl = document.getElementById('menu-level');
      if (lvlEl) lvlEl.textContent = `Lv ${this.save.progression ? this.save.progression.level : 1}`;
      const onlineSub = document.getElementById('menu-online-sub');
      if (onlineSub && this.multiplayer) {
        onlineSub.textContent = this.multiplayer.auth.signedIn
          ? `🟢 ${this.multiplayer.auth.displayName || 'Online'} • Cloud`
          : 'Google Sync & Multiplayer';
      }
      document.getElementById('menu-bus-route').textContent = bus.routeBn;
      document.getElementById('menu-bus-name').textContent = bus.name;
      document.getElementById('menu-bus-model').textContent = bus.model;
      const engLvl = this.save.upgrades.engine || 0;
      document.getElementById('menu-bus-speed').textContent = `${Math.round(bus.topSpeedKmh * (1 + engLvl * 0.12))} km/h`;
      document.getElementById('menu-bus-torque').textContent = `Tier ${engLvl + 1}/6`;
      document.getElementById('menu-bus-fuel').textContent = `${Math.round(this.save.fuel)}%`;
    }

    renderBusShop() {
      document.getElementById('shop-taka').textContent = `৳ ${this.save.taka.toLocaleString()}`;
      const grid = document.getElementById('bus-grid');
      grid.innerHTML = '';

      BUS_CATALOG.forEach((bus) => {
        const unlocked = this.save.unlockedBuses.includes(bus.id);
        const selected = this.save.selectedBusId === bus.id;
        const card = document.createElement('div');
        card.className = `bus-card ${selected ? 'selected' : ''}`;
        const paint = this.save.customColors[bus.id] || bus.primaryColor;

        card.innerHTML = `
          <div class="bus-swatch-strip" style="background: linear-gradient(90deg, ${paint}, ${bus.stripeColor});"></div>
          <h3>${bus.name} <small style="color:#34d399">(${bus.busType || 'Intercity'})</small></h3>
          <div class="bus-card-route">${bus.routeBn} (${bus.routeEn})</div>
          <div class="bus-stat-bar"><span>Speed</span><div class="stat-meter"><div style="width:${Math.min(100, Math.round((bus.topSpeedKmh - 65) * 1.0))}%"></div></div></div>
          <div class="bus-stat-bar"><span>Power</span><div class="stat-meter"><div style="width:${Math.min(100, Math.round(bus.accelPower * 62))}%"></div></div></div>
          <div class="bus-stat-bar"><span>Handling</span><div class="stat-meter"><div style="width:${Math.min(100, Math.round(bus.handling * 80))}%"></div></div></div>
        `;

        const actionBtn = document.createElement('button');
        actionBtn.className = `btn ${selected ? 'btn-secondary' : 'btn-primary'}`;
        actionBtn.style.marginTop = '6px';
        if (selected) {
          actionBtn.textContent = '✓ SELECTED';
          actionBtn.disabled = true;
        } else if (unlocked) {
          actionBtn.textContent = 'SELECT COACH';
          actionBtn.addEventListener('click', () => {
            this.save.selectedBusId = bus.id;
            const match = this.save.company.fleet.find((f) => f.busId === bus.id);
            if (match) this.save.selectedFleetUid = match.uid;
            persistSave(this.save);
            this.spawnPlayerBus();
            this.renderBusShop();
            this.refreshMenuStats();
          });
        } else {
          actionBtn.textContent = `UNLOCK (৳ ${bus.price.toLocaleString()})`;
          actionBtn.addEventListener('click', () => {
            const res = this.company.buyBusToFleet(bus.id);
            if (res.ok) {
              this.sound.playChime();
              this.spawnPlayerBus();
              this.renderBusShop();
              this.refreshMenuStats();
            } else {
              this.showToast(res.msg);
            }
          });
        }
        card.appendChild(actionBtn);
        grid.appendChild(card);
      });
    }

    renderGarage() {
      const bus = this.getSelectedBusSpec();
      document.getElementById('garage-bus-title').textContent = bus.name;
      document.getElementById('garage-taka').textContent = `৳ ${this.save.taka.toLocaleString()}`;

      const activePaint = this.save.customColors[bus.id] || bus.primaryColor;
      const swatches = document.getElementById('paint-swatches');
      swatches.innerHTML = '';
      PAINT_PALETTE.forEach((p) => {
        const dot = document.createElement('button');
        dot.className = `paint-dot ${activePaint.toLowerCase() === p.hex.toLowerCase() ? 'active' : ''}`;
        dot.style.background = p.hex;
        dot.title = p.name;
        dot.addEventListener('click', () => {
          this.save.customColors[bus.id] = p.hex;
          this.busRig.setPaintColor(p.hex);
          persistSave(this.save);
          this.renderGarage();
        });
        swatches.appendChild(dot);
      });

      const repairCost = this.mechanics.getRepairCost('full');
      const refuelCost = this.mechanics.calculateFuelCost(Math.max(0, 100 - this.save.fuel), 'diesel');
      document.getElementById('repair-cost').textContent = `৳ ${repairCost}`;
      document.getElementById('refuel-cost').textContent = `৳ ${refuelCost}`;
      document.getElementById('garage-health-bar').style.width = `${Math.round(this.save.health)}%`;
      document.getElementById('garage-health-txt').textContent = `${Math.round(this.save.health)}%`;
      document.getElementById('garage-fuel-bar').style.width = `${Math.round(this.save.fuel)}%`;
      document.getElementById('garage-fuel-txt').textContent = `${Math.round(this.save.fuel)}%`;

      const upgList = document.getElementById('upgrades-list');
      upgList.innerHTML = '';
      UPGRADE_DEFINITIONS.forEach((u) => {
        const lvl = this.save.upgrades[u.id] || 0;
        const cost = u.baseCost * (lvl + 1);
        const row = document.createElement('div');
        row.className = 'upgrade-item';
        row.innerHTML = `<div><strong>${u.name} (Lv ${lvl}/${u.maxLevel})</strong><small>${u.desc}</small></div>`;
        const btn = document.createElement('button');
        btn.className = `btn ${lvl >= u.maxLevel ? 'btn-secondary' : 'btn-primary'}`;
        if (lvl >= u.maxLevel) {
          btn.textContent = 'MAXED';
          btn.disabled = true;
        } else {
          btn.textContent = `৳ ${cost.toLocaleString()}`;
          btn.addEventListener('click', () => {
            if (this.save.taka >= cost) {
              this.save.taka -= cost;
              this.save.upgrades[u.id] = lvl + 1;
              this.sound.playChime();
              persistSave(this.save);
              this.renderGarage();
            } else {
              this.showToast(`Need ৳ ${cost.toLocaleString()} for ${u.name}!`);
            }
          });
        }
        row.appendChild(btn);
        upgList.appendChild(row);
      });
    }

    syncSettingsUI() {
      const s = this.save.settings;
      const syncSeg = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-val') === String(val));
        });
      };
      syncSeg('set-quality', s.quality);
      syncSeg('set-shadow', s.shadowQuality || 'medium');
      syncSeg('set-reflection', s.reflectionQuality || 'medium');
      syncSeg('set-texture', s.textureQuality || 'medium');
      syncSeg('set-weather-fx', s.weatherEffects !== false ? 'on' : 'off');
      syncSeg('set-fps-limit', String(s.fpsLimit || 60));
      syncSeg('set-transmission', s.transmission);
      syncSeg('set-day-mode', s.dayCycleMode || 'auto');
      syncSeg('set-time', s.timeOfDay);
      syncSeg('set-weather-mode', s.weatherMode || 'auto');
      syncSeg('set-weather', s.weather);
      syncSeg('set-sound', s.soundOn ? 'on' : 'off');
      syncSeg('set-fps', s.showFps ? 'on' : 'off');
      syncSeg('set-fatigue', s.fatigueOn ? 'on' : 'off');
      syncSeg('set-robbery', s.robberyOn ? 'on' : 'off');
      document.getElementById('set-draw-dist').value = s.drawDistance || 1.0;
      document.getElementById('draw-dist-val').textContent = s.drawDistance || 1.0;
      document.getElementById('set-sensitivity').value = s.sensitivity;
      document.getElementById('sens-val').textContent = s.sensitivity;
      document.getElementById('set-volume').value = s.volume;
      document.getElementById('vol-val').textContent = s.volume;
    }

    drawMiniMap(targetStopId) {
      const ctx = this.minimapCtx;
      const w = this.minimapCanvas.width;
      const h = this.minimapCanvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#071c13';
      ctx.fillRect(0, 0, w, h);

      const scale = 0.085; // ~1.3 km tactical GPS view around player on 40 units/km scale
      const cx = w / 2;
      const cy = h / 2;
      const toMap = (wx, wz) => [
        cx + (wx - this.physics.x) * scale,
        cy + (wz - this.physics.z) * scale
      ];

      // Draw nearby Real Rivers
      const Geo = global.BDGeoData;
      if (Geo && Geo.REAL_RIVERS) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#0369a1';
        Geo.REAL_RIVERS.forEach((riv) => {
          const pts = riv.points || riv.pointsLatLon || [];
          ctx.beginPath();
          pts.forEach(([lat, lon], idx) => {
            const wp = Geo.latLonToWorld(lat, lon);
            const [mx, my] = toMap(wp.x, wp.z);
            if (idx === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
          });
          ctx.stroke();
        });
      }

      // Draw nearby curved road edges
      const edges = (this.world && this.world.roadEdges) ? this.world.roadEdges : ROAD_NETWORK_EDGES;
      ctx.lineWidth = 3;
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        ctx.strokeStyle = edge.ferry
          ? '#f472b6'
          : edge.bridge
          ? '#38bdf8'
          : edge.type === 'village'
          ? '#a16207'
          : '#64748b';
        ctx.beginPath();
        if (edge.samples && edge.samples.length > 0) {
          const step = Math.max(1, Math.floor(edge.samples.length / 10));
          for (let j = 0; j < edge.samples.length; j += step) {
            const [mx, my] = toMap(edge.samples[j].x, edge.samples[j].z);
            if (j === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
          }
          const last = edge.samples[edge.samples.length - 1];
          const [lx, ly] = toMap(last.x, last.z);
          ctx.lineTo(lx, ly);
        } else {
          const p1 = BANGLADESH_LOCATIONS[edge.from];
          const p2 = BANGLADESH_LOCATIONS[edge.to];
          const [x1, y1] = toMap(p1.x, p1.z);
          const [x2, y2] = toMap(p2.x, p2.z);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }

      // Highlight active career or GPS navigation route path using actual curved road samples
      const activeStops =
        (this.activeRoute && this.mode === 'career' && this.activeRoute.stops) ||
        (this.gpsNavRoute && this.gpsNavRoute.stops) ||
        null;
      if (activeStops && activeStops.length > 1) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        let startedPath = false;
        for (let i = 0; i < activeStops.length - 1; i++) {
          const aId = activeStops[i];
          const bId = activeStops[i + 1];
          const edge = this.world.getEdgeWaypoints(aId, bId);
          if (edge && edge.samples && edge.samples.length > 1) {
            const forward = edge.from === aId;
            for (let s = 0; s < edge.samples.length; s += 2) {
              const smp = edge.samples[forward ? s : edge.samples.length - 1 - s];
              const [mx, my] = toMap(smp.x, smp.z);
              if (!startedPath) {
                ctx.moveTo(mx, my);
                startedPath = true;
              } else {
                ctx.lineTo(mx, my);
              }
            }
            const endSmp = edge.samples[forward ? edge.samples.length - 1 : 0];
            const [ex, ey] = toMap(endSmp.x, endSmp.z);
            ctx.lineTo(ex, ey);
          } else {
            const locA = BANGLADESH_LOCATIONS[aId];
            const locB = BANGLADESH_LOCATIONS[bId];
            if (locA && locB) {
              const [x1, y1] = toMap(locA.x, locA.z);
              const [x2, y2] = toMap(locB.x, locB.z);
              if (!startedPath) {
                ctx.moveTo(x1, y1);
                startedPath = true;
              }
              ctx.lineTo(x2, y2);
            }
          }
        }
        ctx.stroke();
      }

      // Draw city terminals/stops within minimap frame + edge pointer to targetStopId
      Object.values(BANGLADESH_LOCATIONS).forEach((loc) => {
        const [mx, my] = toMap(loc.x, loc.z);
        if (mx < -10 || mx > w + 10 || my < -10 || my > h + 10) return;
        ctx.fillStyle = loc.id === targetStopId ? '#fbbf24' : loc.isTerminal ? '#10b981' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(mx, my, loc.id === targetStopId ? 4.5 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      });

      const targetLocMap = BANGLADESH_LOCATIONS[targetStopId];
      if (targetLocMap) {
        const [tx, ty] = toMap(targetLocMap.x, targetLocMap.z);
        if (tx < 6 || tx > w - 6 || ty < 6 || ty > h - 6) {
          const ang = Math.atan2(ty - cy, tx - cx);
          const edgeR = Math.min(w, h) * 0.43;
          const ax = cx + Math.cos(ang) * edgeR;
          const ay = cy + Math.sin(ang) * edgeR;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(ang);
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-4, 4);
          ctx.lineTo(-4, -4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw police checkpoints
      ctx.fillStyle = '#3b82f6';
      this.police.checkpoints.forEach((cp) => {
        const [mx, my] = toMap(cp.x, cp.z);
        if (mx >= -5 && mx <= w + 5 && my >= -5 && my <= h + 5) {
          ctx.fillRect(mx - 2, my - 2, 4, 4);
        }
      });

      // Draw robbery warnings (if active)
      if (this.save.settings.robberyOn) {
        ctx.fillStyle = '#f97316';
        this.events.robberyZones.forEach((rz) => {
          if (!rz.cleared) {
            const [mx, my] = toMap(rz.x, rz.z);
            ctx.fillRect(mx - 2, my - 2, 4, 4);
          }
        });
      }

      // Draw pinned Service Station Navigation target
      const navMode = NAV_MODES[this.navServiceIndex];
      if (navMode) {
        const st = this.world.getNearestServiceStation(this.physics.x, this.physics.z, navMode);
        if (st) {
          const [sx, sy] = toMap(st.x, st.z);
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw nearby AI traffic dots
      ctx.fillStyle = '#f87171';
      this.traffic.getNearbyDots(this.physics.x, this.physics.z, 900).forEach((dot) => {
        const [mx, my] = toMap(dot.x, dot.z);
        ctx.fillRect(mx - 1, my - 1, 2, 2);
      });

      // Draw online multiplayer player dots
      if (this.multiplayer) {
        this.multiplayer.getMinimapMarkers().forEach((mk) => {
          const [mx, my] = toMap(mk.x, mk.z);
          ctx.fillStyle = mk.isLeader ? '#fbbf24' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(mx, my, mk.isLeader ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Draw player bus triangle heading
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-this.physics.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    updateCamera(dt) {
      if (this.mode === 'menu') {
        if (!this._camDrag.active) {
          this.showroomAngle += dt * 0.28;
        }
        const r = 11.2;
        const cx = this.physics.x + Math.sin(this.showroomAngle) * r;
        const cz = this.physics.z + Math.cos(this.showroomAngle) * r;
        this.camera.position.set(cx, this.physics.y + 3.4, cz);
        this.camera.lookAt(this.physics.x - 1.5, this.physics.y + 1.8, this.physics.z);
        return;
      }

      const cam = CAMERA_MODES[this.cameraModeIndex] || CAMERA_MODES[0];
      const mode = cam.id;
      const spec = this.getSelectedBusSpec();
      const ddBoost = spec && spec.isDoubleDecker ? 1.38 : 0;

      const fx = -Math.sin(this.physics.yaw);
      const fz = -Math.cos(this.physics.yaw);
      const rx = Math.cos(this.physics.yaw);
      const rz = -Math.sin(this.physics.yaw);

      const px = this.physics.x;
      const py = this.physics.y;
      const pz = this.physics.z;
      const bounce = this.physics.suspBounce || 0;
      const pitch = this.physics.suspPitch || 0;

      if (mode === 'COCKPIT') {
        const eyeX = px + rx * 0.68 + fx * 3.92;
        const eyeY = py + 2.4 + bounce;
        const eyeZ = pz + rz * 0.68 + fz * 3.92;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + this.camLookYaw;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        const lrx = Math.cos(lookYaw);
        const lrz = -Math.sin(lookYaw);
        const lookX = eyeX + lfx * 24 - this.physics.steerAngle * lrx * 4;
        const lookY = eyeY - 0.55 + pitch * 6 + this.camLookPitch * 10;
        const lookZ = eyeZ + lfz * 24 - this.physics.steerAngle * lrz * 4;
        this.camera.lookAt(lookX, lookY, lookZ);
      } else if (mode === 'BUMPER') {
        const eyeX = px + fx * 5.56;
        const eyeY = py + 1.24 + bounce * 0.8;
        const eyeZ = pz + fz * 5.56;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + this.camLookYaw;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        const lrx = Math.cos(lookYaw);
        const lrz = -Math.sin(lookYaw);
        this.camera.lookAt(
          eyeX + lfx * 26 - this.physics.steerAngle * lrx * 3.5,
          eyeY - 0.25 + pitch * 4 + this.camLookPitch * 8,
          eyeZ + lfz * 26 - this.physics.steerAngle * lrz * 3.5
        );
      } else if (mode === 'CABIN') {
        const eyeX = px + rx * 0.03 - fx * 1.35;
        const eyeY = py + 2.16 + ddBoost + bounce;
        const eyeZ = pz + rz * 0.03 - fz * 1.35;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + this.camLookYaw;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        this.camera.lookAt(
          eyeX + lfx * 20,
          eyeY - 0.25 + pitch * 5 + this.camLookPitch * 10,
          eyeZ + lfz * 20
        );
      } else if (mode === 'WHEEL') {
        const eyeX = px - rx * (2.38 + this.camLookPitch * 0.5) + fx * 1.15;
        const eyeY = py + 1.48 + bounce * 0.4;
        const eyeZ = pz - rz * (2.38 + this.camLookPitch * 0.5) + fz * 1.15;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + this.camLookYaw * 0.7;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        this.camera.lookAt(
          px - rx * 0.65 + lfx * 7.2,
          py + 1.32,
          pz - rz * 0.65 + lfz * 7.2
        );
      } else if (mode === 'ROOF') {
        const eyeX = px + fx * 1.25;
        const eyeY = py + 4.35 + ddBoost + bounce * 0.5;
        const eyeZ = pz + fz * 1.25;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + this.camLookYaw;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        this.camera.lookAt(
          eyeX + lfx * 28,
          eyeY - 1.45 + this.camLookPitch * 12,
          eyeZ + lfz * 28
        );
      } else if (mode === 'REAR') {
        const eyeX = px - fx * 5.68;
        const eyeY = py + 2.85 + ddBoost * 0.78 + bounce * 0.5;
        const eyeZ = pz - fz * 5.68;
        this.camera.position.set(eyeX, eyeY, eyeZ);

        const lookYaw = this.physics.yaw + Math.PI + this.camLookYaw;
        const lfx = -Math.sin(lookYaw);
        const lfz = -Math.cos(lookYaw);
        this.camera.lookAt(
          eyeX + lfx * 24,
          eyeY - 1.15 + this.camLookPitch * 10,
          eyeZ + lfz * 24
        );
      } else {
        // CHASE, FOLLOW, ORBIT
        const orbitYaw = this.physics.yaw + this.camLookYaw;
        const ofx = -Math.sin(orbitYaw);
        const ofz = -Math.cos(orbitYaw);
        const baseDist = mode === 'ORBIT' ? this.camOrbitDist : mode === 'CHASE' ? this.camOrbitDist : Math.max(12.0, this.camOrbitDist);
        const baseHeight = mode === 'FOLLOW' ? 6.2 : mode === 'ORBIT' ? 4.2 : 4.3;
        const heightUp = Math.max(1.3, baseHeight + ddBoost * 0.65 + this.camLookPitch * 6.0);

        const targetPos = new THREE.Vector3(
          px - ofx * baseDist,
          py + heightUp,
          pz - ofz * baseDist
        );
        const lerpRate = mode === 'ORBIT' ? 10.5 : mode === 'CHASE' ? 8.5 : 4.4;
        const lerpAlpha = this.cameraNeedsSnap ? 1 : Math.min(1, dt * lerpRate);
        this.cameraNeedsSnap = false;
        this.camera.position.lerp(targetPos, lerpAlpha);

        const targetShiftFwd = mode === 'ORBIT' ? 0.5 : 7.5;
        this.camera.lookAt(
          px + fx * targetShiftFwd,
          py + 1.95 + ddBoost * 0.45,
          pz + fz * targetShiftFwd
        );
      }
    }

    updateMissionAndHUD(stepRes, paxState, policeState, surfaceInfo, eventRes) {
      let targetStopId = paxState.nearestStop ? paxState.nearestStop.id : 'dhaka';
      let objectiveText = 'Explore Bangladesh Open World';
      let distKmText = 'Free Drive';
      let missionPct = 100;

      if (this.mode === 'career' && this.activeRoute) {
        const stops = this.activeRoute.stops;

        // If player arrives directly at a later stop in the route, sync progress cleanly
        for (let sIdx = this.routeStopIndex + 1; sIdx < stops.length; sIdx++) {
          const checkStop = this.world.busStops.find((s) => s.id === stops[sIdx]);
          if (checkStop) {
            const sd = Math.hypot(checkStop.x - this.physics.x, checkStop.z - this.physics.z);
            if (sd < 18 && stepRes.speedKmh <= 6.5 && this.physics.doorOpen) {
              this.routeStopIndex = sIdx;
              break;
            }
          }
        }

        const curId = stops[Math.min(this.routeStopIndex, stops.length - 1)];
        targetStopId = curId;
        const stopObj = this.world.busStops.find((s) => s.id === curId);
        let distM = 9999;
        if (stopObj) {
          const dx = stopObj.x - this.physics.x;
          const dz = stopObj.z - this.physics.z;
          distM = Math.round(Math.sqrt(dx * dx + dz * dz));
          objectiveText = `${stopObj.nameEn} (${distM}m)`;
        } else {
          objectiveText = `${curId.toUpperCase()}`;
        }
        distKmText = `Stop ${Math.min(this.routeStopIndex + 1, stops.length)}/${stops.length}`;
        missionPct = Math.round((this.routeStopIndex / Math.max(1, stops.length - 1)) * 100);

        // Advance from starting stop if player already boarded passengers and departed
        if (this.routeStopIndex === 0 && stops.length > 1 && this.passengers.totalBoarded > 0 && distM > 55) {
          this.recordVisitedDistrict(curId);
          this.routeStopIndex = 1;
        } else if (distM < 18 && stepRes.speedKmh <= 6.5 && this.physics.doorOpen) {
          this.visitedStops.add(curId);
          this.recordVisitedDistrict(curId);
          if (this.routeStopIndex === stops.length - 1) {
            const remainingForFinal = this.passengers.onboard.some((p) => p.destId === curId);
            if (!remainingForFinal && paxState.alightingActive === 0) {
              if (this.activeRoute.requiresRefuel && !this.refueledThisMission) {
                this.showToast('⛽ Refuel Mission: Visit a Petrol/Diesel Pump & refuel before finishing!');
              } else {
                this.completeRouteMission();
                return;
              }
            }
          } else if (this.routeStopIndex < stops.length - 1) {
            const stopQueue = this.passengers.stopStates.get(curId);
            const stillWaiting = stopQueue && stopQueue.waiting.length > 0 && this.passengers.onboard.length < this.passengers.capacity;
            const stillAlighting = this.passengers.onboard.some((p) => p.destId === curId);
            if (!stillWaiting && !stillAlighting) {
              this.routeStopIndex += 1;
              const nextLoc = BANGLADESH_LOCATIONS[stops[this.routeStopIndex]];
              this.showToast(`✅ সব যাত্রী উঠেছেন! পরবর্তী গন্তব্য: ${nextLoc.nameBn} (${nextLoc.nameEn})`);
            }
          }
        }
      } else if (this.gpsNavRoute && this.gpsNavRoute.destId) {
        const gpsStops = this.gpsNavRoute.stops || [this.gpsNavRoute.destId];
        while (this.gpsNavIndex < gpsStops.length - 1) {
          const wpLoc = BANGLADESH_LOCATIONS[gpsStops[this.gpsNavIndex]];
          if (!wpLoc || Math.hypot(wpLoc.x - this.physics.x, wpLoc.z - this.physics.z) < 42) {
            this.recordVisitedDistrict(gpsStops[this.gpsNavIndex]);
            this.gpsNavIndex += 1;
          } else {
            break;
          }
        }
        const destLoc = BANGLADESH_LOCATIONS[this.gpsNavRoute.destId];
        const nextWpId = gpsStops[Math.min(this.gpsNavIndex, gpsStops.length - 1)];
        targetStopId = nextWpId;
        if (destLoc) {
          const distUnits = Math.hypot(destLoc.x - this.physics.x, destLoc.z - this.physics.z);
          const distKm = distUnits / 40;
          objectiveText = `GPS ➔ ${destLoc.nameEn} (${distKm >= 1 ? `${distKm.toFixed(1)} km` : `${Math.round(distUnits)}m`})`;
          distKmText = `${this.gpsNavRoute.totalKm} km route`;
          if (distUnits < 28) {
            this.recordVisitedDistrict(destLoc.id);
            this.showToast(`🏁 Arrived at ${destLoc.nameEn} (${destLoc.nameBn})! +50 XP`);
            this.company.awardXP(50);
            this.gpsNavRoute = null;
          }
        }
      } else {
        const navMode = NAV_MODES[this.navServiceIndex];
        if (navMode) {
          const st = this.world.getNearestServiceStation(this.physics.x, this.physics.z, navMode);
          if (st) {
            objectiveText = `Nav: ${st.name} (${Math.round(st.dist)}m)`;
            distKmText = navMode.toUpperCase();
          }
        } else {
          const nearCity = paxState.nearestStop;
          if (nearCity) {
            objectiveText = `Near ${nearCity.nameEn} (${Math.round(paxState.nearestDist)}m)`;
            distKmText = surfaceInfo.isBridge ? 'Bridge Zone' : surfaceInfo.surface === 'village' ? 'Village Road' : 'Highway';
          }
        }
      }

      this.updateTurnDirectionGuidance(targetStopId, surfaceInfo);

      // Highlight active target bus stop ring
      this.world.busStops.forEach((s) => {
        s.ringMesh.material.color.setHex(s.id === targetStopId ? 0x34d399 : 0x065f46);
      });

      document.getElementById('hud-objective').textContent = objectiveText;
      document.getElementById('hud-route-dist').textContent = distKmText;
      document.getElementById('hud-mission-progress').style.width = `${missionPct}%`;
      document.getElementById('hud-stop-badge').classList.toggle('hidden', !paxState.atStopBay);
      document.getElementById('hud-speed-limit').textContent = `LIMIT ${policeState.activeSpeedLimit}`;

      const gpsEl = document.getElementById('hud-gps-coords');
      if (gpsEl && global.BDGeoData) {
        const gps = global.BDGeoData.worldToLatLon(this.physics.x, this.physics.z);
        const nearName = paxState.nearestStop ? paxState.nearestStop.nameEn : 'Bangladesh';
        gpsEl.textContent = `${gps.lat.toFixed(3)}°N ${gps.lon.toFixed(3)}°E • ${nearName}`;
      }

      // Phase 3 Interactive Service Zone Detection (Fuel / Garage / Wash / Rest Stop)
      const svcZone = this.world.getServiceZoneNear(this.physics.x, this.physics.z);
      this.activeServiceZone = svcZone;
      const svcBtn = document.getElementById('btn-enter-service');
      if (svcZone && stepRes.speedKmh <= 12) {
        const labels = {
          fuel: `⛽ OPEN ${svcZone.name.toUpperCase()}`,
          garage: `🔧 OPEN ${svcZone.name.toUpperCase()}`,
          wash: `🚿 OPEN ${svcZone.name.toUpperCase()}`,
          rest: `☕ OPEN ${svcZone.name.toUpperCase()}`
        };
        svcBtn.textContent = labels[svcZone.kind] || 'OPEN SERVICE';
        svcBtn.classList.remove('hidden');
      } else {
        svcBtn.classList.add('hidden');
      }

      // Auto-close passenger door smoothly once bus accelerates away from a stop
      if (this.physics.doorOpen && stepRes.speedKmh > 8.5) {
        this.physics.doorOpen = false;
        this.sound.playDoorPneumatic();
        this.updateDoorButton();
        this.showToast('🚪 দরজা বন্ধ হয়েছে — শুভ যাত্রা!');
      }

      // Live Passenger Boarding & Alighting Panel (#pax-board-card)
      const paxCard = document.getElementById('pax-board-card');
      if (paxCard) {
        const showPaxCard = paxState.nearStop && paxState.nearestStop &&
          (paxState.atStopBay || paxState.waitingCount > 0 || paxState.alightingCount > 0 || this.physics.doorOpen);
        paxCard.classList.toggle('hidden', !showPaxCard);
        if (showPaxCard) {
          const ns = paxState.nearestStop;
          document.getElementById('pax-stop-title').textContent = `🚌 ${ns.nameBn || ns.nameEn} (${Math.round(paxState.nearestDist)}m)`;
          let subMsg = 'সবুজ বাস বে-তে থামুন ও দরজা খুলুন';
          if (paxState.atStopBay && this.physics.doorOpen) {
            if (paxState.alightingCount > 0 || paxState.alightingActive > 0) {
              subMsg = `👋 যাত্রী নামছে (${paxState.alightingCount} জন)...`;
            } else if (paxState.waitingCount > 0 && paxState.onboardCount < paxState.capacity) {
              subMsg = `🧍 যাত্রী উঠছে (${paxState.waitingCount} জন অপেক্ষমাণ)...`;
            } else if (paxState.onboardCount >= paxState.capacity) {
              subMsg = '💺 সব সিট পূর্ণ! দরজা বন্ধ করে যাত্রা শুরু করুন';
            } else {
              subMsg = '✅ সব যাত্রী ওঠা-নামা সম্পন্ন! যাত্রা শুরু করুন';
            }
          } else if (paxState.atStopBay && !this.physics.doorOpen) {
            subMsg = '🚪 যাত্রী ওঠা-নামার জন্য দরজা খুলুন';
          } else if (paxState.alightingCount > 0) {
            subMsg = `👋 এই স্টপে ${paxState.alightingCount} জন যাত্রী নামবে — গতি কমান`;
          } else if (paxState.waitingCount > 0) {
            subMsg = `🧍 ${paxState.waitingCount} জন যাত্রী বাসের জন্য অপেক্ষা করছে`;
          }
          document.getElementById('pax-stop-sub').textContent = subMsg;
          document.getElementById('pax-wait-cnt').textContent = `${paxState.waitingCount}`;
          document.getElementById('pax-alight-cnt').textContent = `${paxState.alightingCount}`;
          document.getElementById('pax-seat-cnt').textContent = `${paxState.onboardCount}/${paxState.capacity}`;
          document.getElementById('pax-fare-val').textContent = `৳${paxState.nextFare}`;
          document.getElementById('pax-seat-bar').style.width = `${Math.round((paxState.onboardCount / Math.max(1, paxState.capacity)) * 100)}%`;
        }
      }

      const alertEl = document.getElementById('hud-alert');
      const m = this.save.mechanics;

      if (this.save.fuel <= 0.1) {
        alertEl.textContent = '⛽ OUT OF FUEL! Engine stopped — Use 🆘 SOS or Refuel';
        alertEl.classList.remove('hidden');
      } else if (m.engineTemp >= 118) {
        alertEl.textContent = '🔥 ENGINE OVERHEATED (118°C+)! Engine shut down — Use 🆘 SOS / Repair';
        alertEl.classList.remove('hidden');
      } else if (eventRes && eventRes.policeBanner) {
        alertEl.textContent = '🚓 HIGHWAY POLICE PATROL ESCORT ACTIVE';
        alertEl.classList.remove('hidden');
      } else if (eventRes && eventRes.warning) {
        alertEl.textContent = eventRes.warning;
        alertEl.classList.remove('hidden');
      } else if (policeState.warning) {
        alertEl.textContent = policeState.warning;
        alertEl.classList.remove('hidden');
      } else if (m.punctured) {
        alertEl.textContent = '🛞 PUNCTURED TIRE! Severe steering pull — Stop & use 🆘 SOS or Garage';
        alertEl.classList.remove('hidden');
      } else if (this.save.settings.fatigueOn && this.save.fatigue >= 75) {
        alertEl.textContent = `😴 DRIVER FATIGUE HIGH (${Math.round(this.save.fatigue)}%)! Visit Highway Rest Stop`;
        alertEl.classList.remove('hidden');
      } else if (surfaceInfo.inConstruction) {
        alertEl.textContent = '🚧 ROAD CONSTRUCTION AHEAD — SLOW DOWN (40 KM/H)';
        alertEl.classList.remove('hidden');
      } else if (surfaceInfo.isBrokenRoad) {
        alertEl.textContent = '⚠️ BROKEN ROAD PATCH — REDUCE SPEED';
        alertEl.classList.remove('hidden');
      } else if (this.envState && this.envState.fogWarning) {
        alertEl.textContent = this.envState.fogWarning;
        alertEl.classList.remove('hidden');
      } else if (paxState.statusText) {
        alertEl.textContent = `🚌 ${paxState.statusText}`;
        alertEl.classList.remove('hidden');
      } else if (this.save.fuel <= 12) {
        alertEl.textContent = '⛽ LOW FUEL! Tap 🧭 NAV to locate nearest Petrol/Diesel Pump';
        alertEl.classList.remove('hidden');
      } else {
        alertEl.classList.add('hidden');
      }

      if (this.input.gas && stepRes.speedKmh < 3) {
        const nowMs = performance.now();
        if (nowMs - this._driveBlockHintTime > 2800) {
          const inNeutral =
            (this.save.settings.transmission === 'auto' && this.physics.autoDriveMode === 'N') ||
            (this.save.settings.transmission === 'manual' && this.physics.gear === 'N');
          if (this.physics.handbrake) {
            this._driveBlockHintTime = nowMs;
            this.showToast('🅿️ Handbrake ON! Tap P to release • হ্যান্ডব্রেক (P) বন্ধ করুন');
          } else if (inNeutral) {
            this._driveBlockHintTime = nowMs;
            this.showToast('⚙️ Gear is Neutral (N)! Tap ▲ for Drive • গিয়ার ▲ চেপে Drive দিন');
          } else if (this.save.fuel <= 0.1 || m.engineTemp >= 118 || this.save.parts.engine <= 10 || m.battery <= 5) {
            this._driveBlockHintTime = nowMs;
            this.showToast('🔧 Engine stopped! Tap 🆘 SOS for emergency repair / fuel');
          }
        }
      }

      // Gauges & Telemetry Counters
      document.getElementById('hud-speed').textContent = `${stepRes.speedKmh}`;
      const gearLabel =
        this.save.settings.transmission === 'auto'
          ? (this.physics.gear === 'R' ? 'R' : this.physics.autoDriveMode === 'N' ? 'N' : `D${this.physics.gear}`)
          : `M${this.physics.gear}`;
      document.getElementById('hud-gear-badge').textContent = gearLabel;
      document.getElementById('hud-gear-big').textContent = gearLabel;

      document.getElementById('hud-rpm').textContent = (this.physics.rpm / 1000).toFixed(1);
      const rpmNorm = stepRes.rpmNormalized;
      document.getElementById('rpm-arc').style.strokeDashoffset = `${210 - rpmNorm * 165}`;
      const needleAngle = -20 + rpmNorm * 220;
      const rad = (needleAngle * Math.PI) / 180;
      const needle = document.getElementById('rpm-needle');
      needle.setAttribute('x2', (60 - Math.cos(rad) * 36).toFixed(1));
      needle.setAttribute('y2', (62 - Math.sin(rad) * 36).toFixed(1));

      const fuelPct = Math.max(0, Math.round(this.save.fuel));
      document.getElementById('hud-fuel-pct').textContent = `${fuelPct}%`;
      document.getElementById('hud-fuel-bar').style.width = `${fuelPct}%`;
      document.getElementById('hud-health-pct').textContent = `${Math.max(0, Math.round(this.save.health))}%`;
      document.getElementById('hud-pax').textContent = `${paxState.onboardCount}/${paxState.capacity}`;
      document.getElementById('hud-ticket-income').textContent = `৳${paxState.ticketIncome}`;
      document.getElementById('hud-taka').textContent = this.save.taka.toLocaleString();

      // Phase 3 & 4 Dashboard Readouts
      document.getElementById('hud-temp').textContent = `${Math.round(m.engineTemp)}°C`;
      document.getElementById('hud-tire-pct').textContent = m.punctured ? 'FLAT' : `${Math.round(this.save.parts.tires)}%`;
      document.getElementById('hud-oil-pct').textContent = `${Math.round(m.oilLevel)}%`;
      document.getElementById('hud-clean-pct').textContent = `${Math.round(this.save.cleanliness)}%`;
      document.getElementById('hud-fatigue-pct').textContent = `${Math.round(this.save.fatigue)}%`;
      if (this.envState) {
        document.getElementById('hud-clock-weather').textContent =
          `${this.envState.formattedClock} • ${this.envState.weatherIcon} ${this.envState.weatherName}`;
      }

      document.getElementById('hud-ind-left').classList.toggle('blink-on', (this.physics.indLeft || this.physics.hazardOn) && this.blinkOn);
      document.getElementById('hud-ind-right').classList.toggle('blink-on', (this.physics.indRight || this.physics.hazardOn) && this.blinkOn);
      this.updateDoorButton();
      this.drawMiniMap(targetStopId);
    }

    updateTurnDirectionGuidance(targetStopId, surfaceInfo) {
      const row = document.getElementById('hud-turn-signal');
      const arrowEl = document.getElementById('hud-turn-arrow');
      const labelEl = document.getElementById('hud-turn-label');
      const distEl = document.getElementById('hud-turn-dist');
      if (!row || !arrowEl || !labelEl || !distEl) return;

      const px = this.physics.x;
      const pz = this.physics.z;
      const fx = -Math.sin(this.physics.yaw);
      const fz = -Math.cos(this.physics.yaw);
      const rx = Math.cos(this.physics.yaw);
      const rz = -Math.sin(this.physics.yaw);

      let stops = null;
      let curIdx = 0;
      if (this.mode === 'career' && this.activeRoute && this.activeRoute.stops) {
        stops = this.activeRoute.stops;
        curIdx = Math.min(this.routeStopIndex, stops.length - 1);
      } else if (this.gpsNavRoute && this.gpsNavRoute.stops) {
        stops = this.gpsNavRoute.stops;
        curIdx = Math.min(this.gpsNavIndex, stops.length - 1);
      }

      const navMode = !stops ? NAV_MODES[this.navServiceIndex] : null;
      let guidePoints = []; // Up to 4 chevron poses along intended path
      let targetPt = null;
      let distLabel = '';
      let upcomingJunctionMsg = null;
      let upcomingArrow = null;

      if (stops && stops.length >= 2) {
        const curId = stops[curIdx];
        const prevId = curIdx > 0 ? stops[curIdx - 1] : stops[0];
        const nextId = curIdx < stops.length - 1 ? stops[curIdx + 1] : null;
        let activeEdge = curIdx > 0
          ? this.world.getEdgeWaypoints(prevId, curId)
          : this.world.getEdgeWaypoints(curId, nextId);

        const curLoc = BANGLADESH_LOCATIONS[curId];
        const distToStop = curLoc ? Math.hypot(curLoc.x - px, curLoc.z - pz) : 9999;
        distLabel = distToStop >= 1000 ? `${(distToStop / 1000).toFixed(1)} km` : `${Math.round(distToStop)} m`;

        if (activeEdge && activeEdge.samples && activeEdge.samples.length >= 2) {
          const forward = curIdx > 0 ? (activeEdge.from === prevId) : (activeEdge.from === curId);
          const samples = activeEdge.samples;
          let closestIdx = 0;
          let bestD2 = Infinity;
          for (let i = 0; i < samples.length; i++) {
            const dx = samples[i].x - px;
            const dz = samples[i].z - pz;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
              bestD2 = d2;
              closestIdx = i;
            }
          }
          const stepSign = forward ? 1 : -1;
          const laIdx = Math.max(0, Math.min(samples.length - 1, closestIdx + stepSign * 3));
          targetPt = samples[laIdx];

          for (let c = 0; c < 4; c++) {
            const cIdx = Math.max(0, Math.min(samples.length - 1, closestIdx + stepSign * (1 + c)));
            const cs = samples[cIdx];
            const cYaw = Math.atan2(-(cs.tx * stepSign), -(cs.tz * stepSign));
            guidePoints.push({ x: cs.x, y: (cs.y || 0) + 0.16, z: cs.z, yaw: cYaw });
          }

          // Upcoming junction turn check within 220m of an intermediate Mor / stop
          if (distToStop < 220 && nextId && curLoc) {
            const nextEdge = this.world.getEdgeWaypoints(curId, nextId);
            if (nextEdge && nextEdge.samples && nextEdge.samples.length >= 2) {
              const nextForward = nextEdge.from === curId;
              const inS = samples[forward ? samples.length - 1 : 0];
              const inTx = inS.tx * (forward ? 1 : -1);
              const inTz = inS.tz * (forward ? 1 : -1);
              const outS = nextEdge.samples[nextForward ? 0 : nextEdge.samples.length - 1];
              const outTx = outS.tx * (nextForward ? 1 : -1);
              const outTz = outS.tz * (nextForward ? 1 : -1);
              const inRx = -inTz;
              const inRz = inTx;
              const turnForward = outTx * inTx + outTz * inTz;
              const turnRight = outTx * inRx + outTz * inRz;
              const turnDeg = (Math.atan2(turnRight, turnForward) * 180) / Math.PI;
              if (turnDeg < -26) {
                upcomingArrow = '↰';
                upcomingJunctionMsg = `বামে ঘুরুন • ${curLoc.nameBn}`;
              } else if (turnDeg > 26) {
                upcomingArrow = '↱';
                upcomingJunctionMsg = `ডানে ঘুরুন • ${curLoc.nameBn}`;
              }
            }
          }
        } else if (curLoc) {
          targetPt = { x: curLoc.x, z: curLoc.z };
        }
      } else if (navMode) {
        const st = this.world.getNearestServiceStation(px, pz, navMode);
        if (st) {
          targetPt = { x: st.x, z: st.z };
          distLabel = st.dist >= 1000 ? `${(st.dist / 1000).toFixed(1)} km` : `${Math.round(st.dist)} m`;
          const ang = Math.atan2(-(st.x - px), -(st.z - pz));
          const len = Math.max(1, st.dist);
          const ux = (st.x - px) / len;
          const uz = (st.z - pz) / len;
          for (let c = 0; c < 4; c++) {
            const dAhead = 16 + c * 11;
            if (dAhead < st.dist) {
              const cx = px + ux * dAhead;
              const cz = pz + uz * dAhead;
              const cy = this.world.getSurfaceAt(cx, cz).groundY || 0;
              guidePoints.push({ x: cx, y: cy + 0.16, z: cz, yaw: ang });
            }
          }
        }
      } else if (surfaceInfo && surfaceInfo.nearestSample) {
        // Free drive subtle road bend indicator along current road
        const ns = surfaceInfo.nearestSample;
        const alignSign = ns.tx * fx + ns.tz * fz >= 0 ? 1 : -1;
        targetPt = {
          x: px + ns.tx * alignSign * 40,
          z: pz + ns.tz * alignSign * 40
        };
      }

      // Position or hide 3D glowing green road chevrons
      if (this.navChevrons) {
        for (let i = 0; i < this.navChevrons.length; i++) {
          const ch = this.navChevrons[i];
          const gp = guidePoints[i];
          if (gp && this.mode !== 'menu') {
            ch.group.visible = true;
            ch.group.position.set(gp.x, gp.y, gp.z);
            ch.group.rotation.y = gp.yaw;
            const wave = 0.45 + 0.45 * Math.sin(this.elapsed * 5.2 - i * 0.9);
            ch.mat.opacity = wave;
          } else {
            ch.group.visible = false;
          }
        }
      }

      // Compute relative Left / Right / Straight / U-Turn signal
      let arrow = '⬆';
      let label = 'সোজা যান';
      let stateClass = '';

      if (upcomingArrow && upcomingJunctionMsg) {
        arrow = upcomingArrow;
        label = upcomingJunctionMsg;
        stateClass = 'turn-side';
      } else if (targetPt) {
        const dx = targetPt.x - px;
        const dz = targetPt.z - pz;
        const fwdDot = dx * fx + dz * fz;
        const rightDot = dx * rx + dz * rz;
        const deg = (Math.atan2(rightDot, fwdDot) * 180) / Math.PI;
        if (Math.abs(deg) > 125) {
          arrow = '↩';
          label = 'ঘুরে পেছনে যান';
          stateClass = 'turn-uturn';
        } else if (deg < -42) {
          arrow = '⬅';
          label = 'বামে ঘুরুন';
          stateClass = 'turn-side';
        } else if (deg < -15) {
          arrow = '↖';
          label = 'বাম পাশে যান';
          stateClass = 'turn-side';
        } else if (deg > 42) {
          arrow = '➡';
          label = 'ডানে ঘুরুন';
          stateClass = 'turn-side';
        } else if (deg > 15) {
          arrow = '↗';
          label = 'ডান পাশে যান';
          stateClass = 'turn-side';
        } else {
          arrow = '⬆';
          label = 'সোজা যান';
        }
      }

      arrowEl.textContent = arrow;
      labelEl.textContent = label;
      distEl.textContent = distLabel;
      row.classList.remove('turn-side', 'turn-uturn');
      if (stateClass) row.classList.add(stateClass);
    }

    loop(now) {
      requestAnimationFrame(this.loop);

      const fpsLimit = this.save.settings.fpsLimit || 60;
      if (fpsLimit < 58 && (now - this.lastRenderTime) < (1000 / fpsLimit) - 2) {
        return;
      }
      this.lastRenderTime = now;

      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.elapsed += dt;

      this.fpsFrames++;
      this.fpsAccum += dt;
      if (this.fpsAccum >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsFrames = 0;
        this.fpsAccum = 0;
        if (this.save.settings.showFps) {
          document.getElementById('hud-fps').textContent = `${this.currentFps}`;
        }
      }

      this.blinkTimer += dt;
      if (this.blinkTimer >= 0.42) {
        this.blinkTimer = 0;
        this.blinkOn = !this.blinkOn;
        if (this.mode !== 'menu' && !this.paused && (this.physics.indLeft || this.physics.indRight)) {
          this.sound.playTick(this.blinkOn);
        }
      }

      this.skyDome.position.set(this.physics.x, 0, this.physics.z);
      if (this.washingAnimTimer > 0) this.washingAnimTimer = Math.max(0, this.washingAnimTimer - dt);

      const isDriving = this.mode !== 'menu' && !this.paused;
      const surfaceInfo = this.world.getSurfaceAt(this.physics.x, this.physics.z);
      const envState = this.env.update(dt, this.elapsed, this.physics, this.save.settings, surfaceInfo, this.sound, isDriving);
      this.envState = envState;

      // Auto headlights & streetlights when entering dusk/night/storm
      const headlightsTurnedOn = envState.isDark && !this.wasDark && this.physics.beamMode === 0 && this.mode !== 'menu';
      const streetLightsTurnedOn = envState.streetLightsActive && !this.wasStreetLightsOn && this.mode !== 'menu';
      if (headlightsTurnedOn) {
        this.physics.beamMode = 1;
        this.updateLightsButton();
        this.showToast(
          streetLightsTurnedOn
            ? '🌙💡 রাত হয়েছে — হেডলাইট ও স্ট্রিট লাইট অটো চালু!'
            : '🌙 Night / Dusk — Headlights Auto-ON (Low Beam)'
        );
      } else if (streetLightsTurnedOn) {
        this.showToast('🌇💡 সন্ধ্যা/রাত — শহর ও মহাসড়কের স্ট্রিট লাইট চালু হয়েছে!');
      }
      this.wasDark = envState.isDark;
      this.wasStreetLightsOn = !!envState.streetLightsActive;
      this.updateWeatherButton();

      this.world.update(this.elapsed, dt, this.physics.x, this.physics.z);

      const rainy = envState.rainIntensity > 0.08;
      if (isDriving) {
        this.traffic.update(dt, this.physics);

        const mechMods = this.mechanics.getPhysicsModifiers(this.save.fuel);
        const stepRes = this.physics.step(
          dt,
          this.input,
          this.getSelectedBusSpec(),
          this.save.upgrades,
          this.save.settings.sensitivity,
          this.save.settings.transmission,
          this.save.fuel,
          surfaceInfo,
          rainy,
          mechMods,
          envState
        );

        if (surfaceInfo.onSpeedBump && !this.prevBumpFlag && stepRes.speedKmh > 18) {
          this.sound.playSuspensionThud();
        }
        this.prevBumpFlag = surfaceInfo.onSpeedBump;

        this.mechanics.update(
          dt,
          stepRes.speedKmh,
          stepRes.throttle,
          this.input.brake ? 1 : 0,
          rainy,
          surfaceInfo,
          this.save.settings
        );

        // Highway Robbery / Roadblock Events
        const eventRes = this.events.update(dt, this.elapsed, this.physics, this.save.settings.robberyOn);
        if (eventRes.triggerModalZone) {
          this.paused = true;
          this.clearInputs();
          document.getElementById('robbery-zone-name').textContent = eventRes.triggerModalZone.name;
          document.getElementById('robbery-modal').classList.remove('hidden');
        }
        if (eventRes.escapeBonus > 0) {
          this.save.taka += eventRes.escapeBonus;
          this.mechanics.logEconomy('income', 'Safe Bypass / Escape Bonus', eventRes.escapeBonus);
          this.sound.playChime();
          this.showToast(`Cleared highway hazard! +৳ ${eventRes.escapeBonus}`);
        }

        // Bridge Toll Crossing Check
        const toll = this.world.checkTollCrossing(this.physics.x, this.physics.z);
        if (toll) {
          const paid = Math.min(this.save.taka, toll.fee);
          this.save.taka -= paid;
          this.sessionTollCost += paid;
          this.mechanics.logEconomy('expense', `${toll.bridgeName} Toll`, paid);
          this.sound.playTick(true);
          this.showToast(`${toll.bridgeName} Toll Paid: -৳ ${paid}`);
        }

        // Directional Collisions (World Props, Traffic, Robbery Barrels)
        let maxImpact = 0;
        let hitCause = 'Roadway Collision';
        let hitX = this.physics.x;
        let hitZ = this.physics.z;
        const nearColliders = this.world.getCollidersNear(this.physics.x, this.physics.z);
        for (let i = 0; i < nearColliders.length; i++) {
          const c = nearColliders[i];
          const imp = this.physics.resolveCollision(c.x, c.z, c.radius + 1.55, 0.38);
          if (imp && imp > maxImpact) {
            maxImpact = imp;
            hitX = c.x;
            hitZ = c.z;
            hitCause = surfaceInfo.isBridge ? 'Bridge Barrier Collision' : 'Roadside Structure Collision';
          }
        }
        const trafficImpact = this.traffic.checkPlayerCollisions(this.physics);
        if (trafficImpact > maxImpact) {
          maxImpact = trafficImpact;
          hitCause = 'Traffic Vehicle Collision';
        }
        if (eventRes.barrelImpact > maxImpact) {
          maxImpact = eventRes.barrelImpact;
          hitCause = 'Roadblock Barrel Impact';
        }

        if (maxImpact > 0) {
          const fx = -Math.sin(this.physics.yaw);
          const fz = -Math.cos(this.physics.yaw);
          const toHitX = hitX - this.physics.x;
          const toHitZ = hitZ - this.physics.z;
          const relAngle = Math.atan2(fx * toHitZ - fz * toHitX, fx * toHitX + fz * toHitZ);
          const crashInfo = this.mechanics.applyCollisionImpact(maxImpact, relAngle, hitCause);
          if (this.save.progression) {
            this.save.progression.drivingRating = Math.max(40, (this.save.progression.drivingRating || 96) - Math.min(4, maxImpact * 0.25));
          }
          this.sound.playCrash(maxImpact / 18);
          this.vibrate(95);
          this.showToast(`💥 ${hitCause}! ${crashInfo.report.parts} damaged.`);
          if (crashInfo.emergencyStopNeeded) {
            this.physics.speedMs = 0;
            this.physics.hazardOn = true;
            this.updateHazardButton();
          }
        }

        // Passengers Boarding / Alighting & Ticket Collection
        const paxState = this.passengers.update(
          dt,
          this.physics,
          this.busRig,
          this.activeRoute,
          this.sound,
          (evt, stop, fare, destId) => {
            if (evt === 'board') {
              this.save.taka += fare;
              const destLoc = destId && BANGLADESH_LOCATIONS[destId];
              const destLabel = destLoc ? (destLoc.nameBn || destLoc.nameEn) : 'গন্তব্য';
              this.showToast(`🎟️ যাত্রী উঠেছে (${destLabel}) +৳${fare}`);
            } else if (evt === 'alight') {
              const stopLabel = stop ? (stop.nameBn || stop.nameEn) : 'স্টপ';
              this.showToast(`👋 যাত্রী ${stopLabel}-এ নেমেছেন`);
            }
          }
        );

        // Traffic Police Enforcement
        const policeState = this.police.update(dt, this.elapsed, this.physics, surfaceInfo, this.sound);
        if (policeState.fineIssued) {
          const fineAmt = Math.min(this.save.taka, policeState.fineIssued.amount);
          this.save.taka -= fineAmt;
          this.sessionFines += fineAmt;
          this.mechanics.logEconomy('expense', `Police Fine: ${policeState.fineIssued.reason}`, fineAmt);
          this.showToast(`🚨 ${policeState.fineIssued.reason}! Fined -৳ ${fineAmt}`);
          this.vibrate(90);
        }

        this.save.totalDistanceKm += stepRes.distanceMeters / 1000;
        this.save.fuel = Math.max(0, this.save.fuel - stepRes.fuelBurn);
        this.company.syncActiveBusState();
        const bizReport = this.company.simulateTick(dt, true);
        if (bizReport) {
          this.showToast(`💼 Business Day ${bizReport.day}: Net ${bizReport.netProfit >= 0 ? '+' : ''}৳${bizReport.netProfit.toLocaleString()}`);
        }

        this.syncBusTransform();
        this.busRig.updateVisuals(this.physics, this.blinkOn, this.elapsed, envState.rainIntensity, {
          parts: this.save.parts,
          mechanics: this.save.mechanics,
          cleanliness: this.save.cleanliness,
          washingActive: this.washingAnimTimer > 0
        }, envState.isDark, () => this.sound.playWiperSweep());
        this.sound.updateEngine(stepRes.rpmNormalized, mechMods.engineStalled ? 0 : stepRes.throttle, !mechMods.engineStalled);
        this.sound.updateEnvironmentAudio(dt, {
          isDriving: true,
          speedKmh: stepRes.speedKmh,
          isBraking: this.physics.isBraking,
          rainIntensity: envState.rainIntensity,
          windStrength: envState.windStrength,
          surfaceType: surfaceInfo.surface,
          isBrokenRoad: surfaceInfo.isBrokenRoad,
          nearRiver: envState.nearRiver,
          nearCity: paxState.nearestDist < 95,
          isDark: envState.isDark,
          paxCount: paxState.onboardCount
        });
        this.updateMissionAndHUD(stepRes, paxState, policeState, surfaceInfo, eventRes);
      } else if (this.mode === 'menu') {
        this.traffic.update(dt, null);
        this.sound.updateEnvironmentAudio(dt, {
          isDriving: false,
          rainIntensity: envState.rainIntensity,
          windStrength: envState.windStrength,
          nearRiver: envState.nearRiver
        });
        this.busRig.updateVisuals(this.physics, false, this.elapsed, envState.rainIntensity, {
          parts: this.save.parts,
          mechanics: this.save.mechanics,
          cleanliness: this.save.cleanliness,
          washingActive: this.washingAnimTimer > 0
        }, envState.isDark);
      } else if (this.washingAnimTimer > 0) {
        this.busRig.updateVisuals(this.physics, this.blinkOn, this.elapsed, envState.rainIntensity, {
          parts: this.save.parts,
          mechanics: this.save.mechanics,
          cleanliness: this.save.cleanliness,
          washingActive: true
        }, envState.isDark);
      }

      // Online Multiplayer & Convoy Sync
      if (this.multiplayer) {
        const progPct = this.mode === 'career' && this.activeRoute
          ? Math.round((this.routeStopIndex / Math.max(1, this.activeRoute.stops.length - 1)) * 100)
          : 0;
        this.multiplayer.update(dt, this.blinkOn, this.physics, this.getSelectedBusSpec(), isDriving, progPct);
        const onlinePill = document.getElementById('hud-online-pill');
        if (onlinePill) {
          if (this.mode !== 'menu' && this.multiplayer.currentRoom) {
            onlinePill.classList.remove('hidden');
            const cs = this.multiplayer.convoyStatus;
            const txtEl = document.getElementById('hud-online-text');
            if (cs.active) {
              const dir = cs.isSelfLeader ? '👑 YOU ARE LEADER' : `Follow ${cs.leaderName} (${cs.distanceToLeaderM}m)`;
              txtEl.textContent = `🚛 CONVOY • ${this.multiplayer.roomPlayers.length} Online • ${dir} • ${cs.sharedProgressPct}%`;
            } else {
              txtEl.textContent = `🌐 ${this.multiplayer.currentRoom.roomCode} • ${this.multiplayer.roomPlayers.length} Players Online`;
            }
          } else {
            onlinePill.classList.add('hidden');
          }
        }
      }

      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    global.bdBusGame = new BusSimulatorGame();
  });
})(typeof window !== 'undefined' ? window : globalThis);
