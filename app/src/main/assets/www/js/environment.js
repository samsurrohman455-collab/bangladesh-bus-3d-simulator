(function (global) {
  'use strict';

  const { TIME_PRESETS, WEATHER_PRESETS, QUALITY_PRESETS } = global.BDGameConfig;

  const WEATHER_SEQUENCE = ['sunny', 'cloudy', 'dusty', 'light_rain', 'heavy_rain', 'thunderstorm', 'cloudy', 'fog', 'winter_mist'];

  function createSoftGlowTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.22)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  const CLOCK_KEYFRAMES = [
    { hour: 0.0, preset: TIME_PRESETS.night },
    { hour: 5.3, preset: TIME_PRESETS.early_morning },
    { hour: 6.4, preset: TIME_PRESETS.sunrise },
    { hour: 9.2, preset: TIME_PRESETS.morning },
    { hour: 14.0, preset: TIME_PRESETS.afternoon },
    { hour: 17.1, preset: TIME_PRESETS.golden_hour },
    { hour: 18.2, preset: TIME_PRESETS.sunset },
    { hour: 19.6, preset: TIME_PRESETS.evening },
    { hour: 23.5, preset: TIME_PRESETS.night },
    { hour: 24.0, preset: TIME_PRESETS.night }
  ];

  class EnvironmentManager {
    constructor(scene, world, skyMat, hemiLight, sunLight) {
      this.scene = scene;
      this.world = world;
      this.skyMat = skyMat;
      this.hemiLight = hemiLight;
      this.sunLight = sunLight;

      this.clockHours = 14.0;
      this.weatherId = 'sunny';
      this.weatherTimer = 68;
      this.autoWeatherIdx = 0;

      // Interpolated weather state
      this.rainIntensity = 0;
      this.windStrength = 0.1;
      this.fogScale = 1.0;
      this.fogParticleIntensity = 0;
      this.dustIntensity = 0.18;
      this.cloudCover = 0.25;
      this.darkness = 0;
      this.gripFactor = 1.0;
      this.wetSurface = 0;
      this.manualTransitionBoost = 0;

      // Thunderstorm state
      this.lightningTimer = 7.5;
      this.lightningFlash = 0;
      this.pendingThunderTimer = -1;
      this.pendingThunderIntensity = 0;

      this.sunOffset = new THREE.Vector3(70, 120, 60);
      this.particleScale = 0.65;
      this.effectsEnabled = true;

      // Reusable temp colors (zero GC churn per frame)
      this._cTopA = new THREE.Color();
      this._cTopB = new THREE.Color();
      this._cBotA = new THREE.Color();
      this._cBotB = new THREE.Color();
      this._cFogA = new THREE.Color();
      this._cFogB = new THREE.Color();
      this._cSunA = new THREE.Color();
      this._cSunB = new THREE.Color();
      this._cHemiSkyA = new THREE.Color();
      this._cHemiSkyB = new THREE.Color();
      this._cHemiGndA = new THREE.Color();
      this._cHemiGndB = new THREE.Color();
      this._cStormTint = new THREE.Color('#334155');
      this._cFogTint = new THREE.Color('#cbd5e1');
      this._cDustTint = new THREE.Color('#d6b88d');
      this._cWaterDay = new THREE.Color('#2b7d8c');
      this._cWaterSunset = new THREE.Color('#ea580c');
      this._cWaterNight = new THREE.Color('#0f172a');
      this._cWaterStorm = new THREE.Color('#334155');

      this.softParticleTex = createSoftGlowTexture();

      this.buildSkyCelestials();
      this.buildCloudPool();
      this.buildRainStreaks();
      this.buildRainSplashParticles();
      this.buildFogParticles();
      this.buildDustParticles();
      this.buildTireParticles();
      this.buildSkidMarkPool();
    }

    buildSkyCelestials() {
      this.sunDisc = new THREE.Mesh(
        new THREE.SphereGeometry(18, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false })
      );
      this.scene.add(this.sunDisc);

      this.moonDisc = new THREE.Mesh(
        new THREE.SphereGeometry(13, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0, fog: false })
      );
      this.scene.add(this.moonDisc);

      const starCount = 200;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const theta = (i * 2.39996) % (Math.PI * 2);
        const phi = Math.acos(0.12 + 0.85 * ((i * 37 % 100) / 100));
        const r = 530;
        starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
        starPos[i * 3 + 1] = Math.cos(phi) * r;
        starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      this.starMat = new THREE.PointsMaterial({
        color: 0xf8fafc,
        size: 2.8,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false
      });
      this.starField = new THREE.Points(starGeo, this.starMat);
      this.scene.add(this.starField);
    }

    buildCloudPool() {
      const tex = global.BDTextures.createCloudTexture();
      this.clouds = [];
      for (let i = 0; i < 14; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(115 + (i % 3) * 35, 52 + (i % 2) * 18), mat);
        plane.rotation.x = Math.PI / 2;
        const angle = (i / 14) * Math.PI * 2;
        const dist = 120 + (i % 4) * 85;
        this.scene.add(plane);
        this.clouds.push({
          mesh: plane,
          mat,
          ox: Math.cos(angle) * dist,
          oz: Math.sin(angle) * dist,
          oy: 105 + (i % 3) * 18
        });
      }
    }

    buildRainStreaks() {
      this.maxRainStreaks = 800;
      const pos = new Float32Array(this.maxRainStreaks * 6);
      this.rainSeeds = [];
      for (let i = 0; i < this.maxRainStreaks; i++) {
        const x = (Math.random() - 0.5) * 95;
        const y = Math.random() * 28;
        const z = (Math.random() - 0.5) * 95;
        this.rainSeeds.push({ x, y, z, speed: 28 + (i % 5) * 3.5 });
        pos[i * 6] = x;
        pos[i * 6 + 1] = y;
        pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x;
        pos[i * 6 + 4] = y + 1.1;
        pos[i * 6 + 5] = z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rainMat = new THREE.LineBasicMaterial({
        color: 0xdbeafe,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      this.rainLines = new THREE.LineSegments(geo, this.rainMat);
      this.rainLines.visible = false;
      this.rainLines.frustumCulled = false;
      this.scene.add(this.rainLines);
    }

    buildRainSplashParticles() {
      this.maxRainSplashes = 220;
      const pos = new Float32Array(this.maxRainSplashes * 3);
      this.rainSplashSeeds = [];
      for (let i = 0; i < this.maxRainSplashes; i++) {
        const x = (Math.random() - 0.5) * 76;
        const z = (Math.random() - 0.5) * 76;
        const life = Math.random();
        this.rainSplashSeeds.push({ x, z, life, speed: 1.8 + Math.random() * 1.4 });
        pos[i * 3] = x;
        pos[i * 3 + 1] = 0.12;
        pos[i * 3 + 2] = z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rainSplashMat = new THREE.PointsMaterial({
        color: 0xe0f2fe,
        map: this.softParticleTex,
        size: 0.95,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      this.rainSplashPoints = new THREE.Points(geo, this.rainSplashMat);
      this.rainSplashPoints.visible = false;
      this.rainSplashPoints.frustumCulled = false;
      this.scene.add(this.rainSplashPoints);
    }

    buildFogParticles() {
      this.maxFogParticles = 180;
      const pos = new Float32Array(this.maxFogParticles * 3);
      this.fogSeeds = [];
      for (let i = 0; i < this.maxFogParticles; i++) {
        const x = (Math.random() - 0.5) * 140;
        const y = 0.8 + Math.random() * 11.5;
        const z = (Math.random() - 0.5) * 140;
        this.fogSeeds.push({
          x,
          y,
          z,
          baseY: y,
          phase: Math.random() * Math.PI * 2,
          drift: 0.6 + Math.random() * 0.8
        });
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.fogMat = new THREE.PointsMaterial({
        color: 0xe2e8f0,
        map: this.softParticleTex,
        size: 13.5,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        fog: false
      });
      this.fogPoints = new THREE.Points(geo, this.fogMat);
      this.fogPoints.visible = false;
      this.fogPoints.frustumCulled = false;
      this.scene.add(this.fogPoints);
    }

    buildDustParticles() {
      this.maxDustParticles = 260;
      const pos = new Float32Array(this.maxDustParticles * 3);
      this.dustSeeds = [];
      for (let i = 0; i < this.maxDustParticles; i++) {
        const x = (Math.random() - 0.5) * 105;
        const y = 0.25 + Math.random() * 7.5;
        const z = (Math.random() - 0.5) * 105;
        this.dustSeeds.push({
          x,
          y,
          z,
          baseY: y,
          phase: Math.random() * Math.PI * 2,
          speed: 0.85 + Math.random() * 0.9
        });
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.dustMat = new THREE.PointsMaterial({
        color: 0xd6b88d,
        map: this.softParticleTex,
        size: 1.75,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      });
      this.dustPoints = new THREE.Points(geo, this.dustMat);
      this.dustPoints.visible = false;
      this.dustPoints.frustumCulled = false;
      this.scene.add(this.dustPoints);
    }

    buildTireParticles() {
      this.maxTireParticles = 96;
      const pos = new Float32Array(this.maxTireParticles * 3);
      this.tireParticleState = [];
      for (let i = 0; i < this.maxTireParticles; i++) {
        pos[i * 3 + 1] = -999;
        this.tireParticleState.push({
          x: 0,
          y: -999,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 0.6
        });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.tireParticleMat = new THREE.PointsMaterial({
        color: 0xe2e8f0,
        map: this.softParticleTex,
        size: 0.92,
        transparent: true,
        opacity: 0.62,
        depthWrite: false
      });
      this.tirePoints = new THREE.Points(geo, this.tireParticleMat);
      this.tirePoints.frustumCulled = false;
      this.scene.add(this.tirePoints);
      this.particleCursor = 0;
    }

    buildSkidMarkPool() {
      this.skidMarks = [];
      this.skidMat = new THREE.MeshBasicMaterial({
        color: 0x111827,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      });
      const geo = new THREE.PlaneGeometry(0.45, 1.8);
      for (let i = 0; i < 36; i++) {
        const m = new THREE.Mesh(geo, this.skidMat);
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        this.scene.add(m);
        this.skidMarks.push(m);
      }
      this.skidCursor = 0;
      this.skidCooldown = 0;
    }

    spawnTireParticle(x, y, z, vx, vy, vz, maxLife) {
      const p = this.tireParticleState[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxTireParticles;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.life = maxLife;
      p.maxLife = maxLife;
    }

    placeSkidMark(x, y, z, yaw) {
      const m = this.skidMarks[this.skidCursor];
      this.skidCursor = (this.skidCursor + 1) % this.skidMarks.length;
      m.position.set(x, y + 0.06, z);
      m.rotation.set(-Math.PI / 2, 0, -yaw);
      m.visible = true;
    }

    setQuality(qualityPreset, settings) {
      this.particleScale = qualityPreset.particles ?? 0.65;
      this.effectsEnabled = settings.weatherEffects !== false;
      this.drawDistanceScale = settings.drawDistance || 1.0;
      this.baseFogFar = qualityPreset.fogFar || 420;
    }

    setTimePreset(timeKey) {
      const p = TIME_PRESETS[timeKey];
      if (p && typeof p.clock === 'number') {
        this.clockHours = p.clock;
      }
    }

    setWeatherPreset(weatherId, fastTransition) {
      if (WEATHER_PRESETS[weatherId]) {
        this.weatherId = weatherId;
        this.weatherTimer = 110;
        if (fastTransition) {
          this.manualTransitionBoost = 3.2;
        }
      }
    }

    formatClock(hours) {
      const wrapped = ((hours % 24) + 24) % 24;
      const hh = Math.floor(wrapped);
      const mm = Math.floor((wrapped - hh) * 60);
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    getTimePhaseLabel(hours) {
      const h = ((hours % 24) + 24) % 24;
      if (h >= 4.5 && h < 5.9) return 'Early Morning';
      if (h >= 5.9 && h < 7.2) return 'Sunrise';
      if (h >= 7.2 && h < 11.8) return 'Morning';
      if (h >= 11.8 && h < 16.5) return 'Afternoon';
      if (h >= 16.5 && h < 17.7) return 'Golden Hour';
      if (h >= 17.7 && h < 18.8) return 'Sunset';
      if (h >= 18.8 && h < 20.8) return 'Evening';
      return 'Midnight';
    }

    recommendQuality() {
      const cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
      const mem = (global.navigator && global.navigator.deviceMemory) || 4;
      const dpr = global.devicePixelRatio || 1;
      if (cores >= 8 && mem >= 6 && dpr >= 2) return 'ultra';
      if (cores >= 6 && mem >= 4) return 'high';
      if (cores >= 4 && mem >= 2) return 'medium';
      return 'low';
    }

    update(dt, elapsed, physics, settings, surfaceInfo, soundEngine, isDriving) {
      // 1. Advance 24h Day-Night Clock
      if (settings.dayCycleMode === 'auto' && isDriving) {
        this.clockHours = (this.clockHours + dt * 0.055) % 24;
        settings.clockHours = this.clockHours;
      } else if (settings.dayCycleMode === 'manual') {
        const p = TIME_PRESETS[settings.timeOfDay];
        if (p) this.clockHours = p.clock;
      }

      // 2. Dynamic Weather Transitions
      if (settings.weatherMode === 'auto' && isDriving) {
        this.weatherTimer -= dt;
        if (this.weatherTimer <= 0) {
          this.autoWeatherIdx = (this.autoWeatherIdx + 1) % WEATHER_SEQUENCE.length;
          this.weatherId = WEATHER_SEQUENCE[this.autoWeatherIdx];
          settings.weather = this.weatherId;
          this.weatherTimer = 65 + Math.random() * 25;
        }
      } else {
        this.weatherId = WEATHER_PRESETS[settings.weather] ? settings.weather : 'sunny';
      }

      const targetW = WEATHER_PRESETS[this.weatherId] || WEATHER_PRESETS.sunny;
      if (this.manualTransitionBoost > 0) {
        this.manualTransitionBoost = Math.max(0, this.manualTransitionBoost - dt);
      }
      const lerpRate = this.manualTransitionBoost > 0 ? 2.8 : 0.45;
      const wLerp = Math.min(1, dt * lerpRate);
      this.rainIntensity += (targetW.rainIntensity - this.rainIntensity) * wLerp;
      this.windStrength += (targetW.windStrength - this.windStrength) * wLerp;
      this.fogScale += (targetW.fogScale - this.fogScale) * wLerp;
      this.fogParticleIntensity += ((targetW.fogParticles || 0) - this.fogParticleIntensity) * wLerp;
      this.dustIntensity += ((targetW.dustIntensity || 0) - this.dustIntensity) * wLerp;
      this.cloudCover += (targetW.cloudCover - this.cloudCover) * wLerp;
      this.darkness += (targetW.darkness - this.darkness) * wLerp;
      this.gripFactor += (targetW.gripFactor - this.gripFactor) * wLerp;

      if (this.rainIntensity > 0.08) {
        this.wetSurface = Math.min(1, this.wetSurface + dt * 0.16 * this.rainIntensity);
      } else {
        this.wetSurface = Math.max(0, this.wetSurface - dt * 0.04);
      }

      // 3. Thunderstorm Lightning & Delayed Thunder Sound
      if (targetW.thunder && this.effectsEnabled && isDriving) {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          this.lightningTimer = 6.5 + Math.random() * 9.0;
          this.lightningFlash = 1.0;
          this.pendingThunderTimer = 0.28 + Math.random() * 0.65;
          this.pendingThunderIntensity = 0.75 + Math.random() * 0.35;
        }
      }
      if (this.pendingThunderTimer >= 0) {
        this.pendingThunderTimer -= dt;
        if (this.pendingThunderTimer < 0) {
          if (soundEngine && soundEngine.playThunder) {
            soundEngine.playThunder(this.pendingThunderIntensity);
          }
        }
      }
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.8);

      // 4. Interpolate 24h Sky, Sun, Moon & Lighting
      let kfA = CLOCK_KEYFRAMES[0];
      let kfB = CLOCK_KEYFRAMES[CLOCK_KEYFRAMES.length - 1];
      for (let i = 0; i < CLOCK_KEYFRAMES.length - 1; i++) {
        if (this.clockHours >= CLOCK_KEYFRAMES[i].hour && this.clockHours <= CLOCK_KEYFRAMES[i + 1].hour) {
          kfA = CLOCK_KEYFRAMES[i];
          kfB = CLOCK_KEYFRAMES[i + 1];
          break;
        }
      }
      const span = Math.max(0.01, kfB.hour - kfA.hour);
      const t = Math.max(0, Math.min(1, (this.clockHours - kfA.hour) / span));

      this._cTopA.set(kfA.preset.skyTop);
      this._cTopB.set(kfB.preset.skyTop);
      this._cTopA.lerp(this._cTopB, t);

      this._cBotA.set(kfA.preset.skyBottom);
      this._cBotB.set(kfB.preset.skyBottom);
      this._cBotA.lerp(this._cBotB, t);

      this._cFogA.set(kfA.preset.fogColor);
      this._cFogB.set(kfB.preset.fogColor);
      this._cFogA.lerp(this._cFogB, t);

      this._cSunA.set(kfA.preset.sunColor);
      this._cSunB.set(kfB.preset.sunColor);
      this._cSunA.lerp(this._cSunB, t);

      this._cHemiSkyA.set(kfA.preset.hemiSky);
      this._cHemiSkyB.set(kfB.preset.hemiSky);
      this._cHemiSkyA.lerp(this._cHemiSkyB, t);

      this._cHemiGndA.set(kfA.preset.hemiGround);
      this._cHemiGndB.set(kfB.preset.hemiGround);
      this._cHemiGndA.lerp(this._cHemiGndB, t);

      const baseSunI = kfA.preset.sunIntensity + (kfB.preset.sunIntensity - kfA.preset.sunIntensity) * t;
      const baseHemiI = kfA.preset.hemiIntensity + (kfB.preset.hemiIntensity - kfA.preset.hemiIntensity) * t;

      // Apply Storm / Fog / Dust Atmospheric Blending + Lightning Flash Illumination
      const stormBlend = Math.min(0.82, this.darkness * 1.15);
      if (this.dustIntensity > 0.45 && this.rainIntensity < 0.1) {
        const dBlend = Math.min(0.65, (this.dustIntensity - 0.35) * 0.85);
        this._cTopA.lerp(this._cDustTint, dBlend * 0.55);
        this._cBotA.lerp(this._cDustTint, dBlend * 0.72);
        this._cFogA.lerp(this._cDustTint, dBlend * 0.78);
      } else if (this.fogScale < 0.4) {
        this._cTopA.lerp(this._cFogTint, 0.55);
        this._cBotA.lerp(this._cFogTint, 0.65);
        this._cFogA.lerp(this._cFogTint, 0.72);
      } else if (stormBlend > 0.01) {
        this._cTopA.lerp(this._cStormTint, stormBlend * 0.78);
        this._cBotA.lerp(this._cStormTint, stormBlend * 0.65);
        this._cFogA.lerp(this._cStormTint, stormBlend * 0.65);
      }

      if (this.lightningFlash > 0.01) {
        const flashCol = this._cFogTint;
        this._cTopA.lerp(flashCol, this.lightningFlash * 0.65);
        this._cBotA.lerp(flashCol, this.lightningFlash * 0.75);
      }

      this.skyMat.uniforms.topColor.value.copy(this._cTopA);
      this.skyMat.uniforms.bottomColor.value.copy(this._cBotA);

      // Sun & Moon Orbit
      const orbitAngle = ((this.clockHours - 6) / 24) * Math.PI * 2;
      const sunDx = Math.cos(orbitAngle);
      const sunDy = Math.sin(orbitAngle);
      const sunDz = 0.38;

      this.sunDisc.visible = sunDy > -0.08 && this.cloudCover < 0.85;
      this.sunDisc.position.set(physics.x + sunDx * 460, Math.max(-40, sunDy * 460), physics.z + sunDz * 460);

      const moonDy = -sunDy;
      this.moonDisc.visible = moonDy > -0.08;
      this.moonDisc.position.set(physics.x - sunDx * 450, Math.max(-40, moonDy * 450), physics.z - sunDz * 450);

      // Directional Light follows sun by day or moon by night
      if (sunDy >= 0.04) {
        this.sunOffset.set(sunDx * 120, Math.max(25, sunDy * 140), sunDz * 90);
      } else {
        this.sunOffset.set(-sunDx * 100, Math.max(35, moonDy * 120), -sunDz * 80);
      }
      this.sunLight.position.set(physics.x + this.sunOffset.x, physics.y + this.sunOffset.y, physics.z + this.sunOffset.z);
      this.sunLight.target.position.set(physics.x, physics.y, physics.z);

      const isDark = this.clockHours < 6.1 || this.clockHours >= 18.0 || this.darkness > 0.45;
      let timeLampLevel = 0;
      if (this.clockHours >= 18.3 || this.clockHours <= 5.7) {
        timeLampLevel = 1.0;
      } else if (this.clockHours > 17.3 && this.clockHours < 18.3) {
        timeLampLevel = this.clockHours - 17.3;
      } else if (this.clockHours > 5.7 && this.clockHours < 6.6) {
        timeLampLevel = (6.6 - this.clockHours) / 0.9;
      }
      const weatherLampLevel = Math.max(
        this.rainIntensity > 0.45 ? Math.min(1, (this.rainIntensity - 0.45) * 1.8) : 0,
        this.fogScale < 0.48 ? 0.85 : 0,
        this.darkness > 0.45 ? Math.min(1, (this.darkness - 0.35) * 1.5) : 0
      );
      const streetLightLevel = Math.max(0, Math.min(1, Math.max(timeLampLevel, weatherLampLevel)));

      this.sunLight.color.copy(this._cSunA);
      this.sunLight.intensity = baseSunI * (1 - this.darkness * 0.55) + this.lightningFlash * 2.1;
      this.hemiLight.color.copy(this._cHemiSkyA);
      this.hemiLight.groundColor.copy(this._cHemiGndA);
      const rawHemi = baseHemiI * (1 - this.darkness * 0.35);
      this.hemiLight.intensity = Math.max(rawHemi, streetLightLevel * 0.40) + this.lightningFlash * 0.9;

      this.starField.position.set(physics.x, 0, physics.z);
      this.starMat.opacity = isDark && this.cloudCover < 0.8 ? (1 - this.cloudCover) * 0.85 : 0;

      // 5. Clouds drift & storm tint
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        c.ox += this.windStrength * 6.5 * dt;
        if (c.ox > 360) c.ox = -360;
        c.mesh.position.set(physics.x + c.ox, c.oy, physics.z + c.oz);
        c.mat.opacity = this.effectsEnabled ? Math.min(0.88, this.cloudCover * 0.72) : 0;
        c.mat.color.copy(this._cBotA).lerp(this._cStormTint, this.darkness * 0.7);
      }

      // 6. Dynamic Distance Fog & Near-River Fog
      const nearRiver = this.world.isNearRiver(physics.x, physics.z);
      const riverFogBoost = nearRiver && (this.clockHours < 8.5 || this.clockHours > 17.3 || this.fogScale < 0.75) ? 0.65 : 1.0;
      const fogFar = Math.max(55, (this.baseFogFar || 420) * (this.drawDistanceScale || 1.0) * this.fogScale * riverFogBoost);
      const fogNear = Math.min(fogFar * 0.35, 42 * this.fogScale);
      if (!this.scene.fog) {
        this.scene.fog = new THREE.Fog(this._cFogA.getHex(), fogNear, fogFar);
      } else {
        this.scene.fog.color.copy(this._cFogA);
        this.scene.fog.near = fogNear;
        this.scene.fog.far = fogFar;
      }

      // 7. Auto Streetlights, Wet Asphalt Puddle Gloss & Water Reflections
      this.world.setNightLights(streetLightLevel);

      const wetRough = 0.88 - this.wetSurface * 0.74;
      const wetMetal = 0.05 + this.wetSurface * 0.44;
      for (let i = 0; i < this.world.wettableRoadMats.length; i++) {
        const rm = this.world.wettableRoadMats[i];
        rm.roughness = wetRough;
        rm.metalness = wetMetal;
      }
      if (this.world.villageRoadMat) {
        this.world.villageRoadMat.roughness = 0.94 - this.wetSurface * 0.42;
      }

      // River & Coastal water color reflections (sunrise/sunset warmth, night moonlight, storm slate)
      const isGoldenOrSunset = (this.clockHours >= 5.6 && this.clockHours <= 7.2) || (this.clockHours >= 16.5 && this.clockHours <= 18.6);
      const targetWater = isDark && !isGoldenOrSunset
        ? this._cWaterNight
        : isGoldenOrSunset
          ? this._cWaterSunset
          : this._cWaterDay;
      for (let i = 0; i < this.world.riverMaterials.length; i++) {
        const wm = this.world.riverMaterials[i];
        wm.color.copy(targetWater).lerp(this._cWaterStorm, this.darkness * 0.65);
        wm.roughness = 0.12 + this.windStrength * 0.14;
      }

      // 8. Wind-Driven Rain Streaks + Rain Ground Splashes
      const activeRainCount = this.effectsEnabled && this.rainIntensity > 0.05
        ? Math.floor(this.maxRainStreaks * this.particleScale * Math.min(1, this.rainIntensity + 0.1))
        : 0;
      this.rainLines.visible = activeRainCount > 0;
      if (this.rainLines.visible) {
        this.rainLines.geometry.setDrawRange(0, activeRainCount * 2);
        this.rainLines.position.set(physics.x, physics.y, physics.z);
        this.rainMat.opacity = Math.min(0.78, 0.25 + this.rainIntensity * 0.52);
        const pos = this.rainLines.geometry.attributes.position.array;
        const windDx = this.windStrength * 0.42;
        const windDz = this.windStrength * 0.15;
        for (let i = 0; i < activeRainCount; i++) {
          const s = this.rainSeeds[i];
          s.y -= s.speed * (0.85 + this.rainIntensity * 0.4) * dt;
          s.x += windDx * 18 * dt;
          s.z += windDz * 18 * dt;
          if (s.y < 0) {
            s.y = 28;
            s.x = ((i * 53 % 95) - 47.5);
            s.z = ((i * 97 % 95) - 47.5);
          }
          const b = i * 6;
          pos[b] = s.x;
          pos[b + 1] = s.y;
          pos[b + 2] = s.z;
          pos[b + 3] = s.x - windDx * 1.3;
          pos[b + 4] = s.y + 1.25;
          pos[b + 5] = s.z - windDz * 1.3;
        }
        this.rainLines.geometry.attributes.position.needsUpdate = true;
      }

      // 8b. Rain Ground Splashes & Wet Road Mist
      const activeSplashCount = this.effectsEnabled && this.rainIntensity > 0.15
        ? Math.floor(this.maxRainSplashes * this.particleScale * this.rainIntensity)
        : 0;
      this.rainSplashPoints.visible = activeSplashCount > 0;
      if (this.rainSplashPoints.visible) {
        this.rainSplashPoints.geometry.setDrawRange(0, activeSplashCount);
        this.rainSplashPoints.position.set(physics.x, physics.y, physics.z);
        this.rainSplashMat.opacity = Math.min(0.65, this.rainIntensity * 0.62);
        const spPos = this.rainSplashPoints.geometry.attributes.position.array;
        for (let i = 0; i < activeSplashCount; i++) {
          const sp = this.rainSplashSeeds[i];
          sp.life += sp.speed * dt;
          if (sp.life >= 1) {
            sp.life = 0;
            sp.x = (Math.random() - 0.5) * 72;
            sp.z = (Math.random() - 0.5) * 72;
          }
          spPos[i * 3] = sp.x;
          spPos[i * 3 + 1] = 0.08 + Math.sin(sp.life * Math.PI) * 0.72;
          spPos[i * 3 + 2] = sp.z;
        }
        this.rainSplashPoints.geometry.attributes.position.needsUpdate = true;
      }

      // 8c. Volumetric Drifting Fog & Winter Mist Billows (reacts to fog/mist presets + river mist)
      const riverMistBoost = nearRiver && (this.clockHours < 8.8 || this.clockHours > 17.0) ? 0.38 : 0;
      const effectiveFogParticles = Math.min(1.0, Math.max(this.fogParticleIntensity, riverMistBoost));
      const activeFogCount = this.effectsEnabled && effectiveFogParticles > 0.06
        ? Math.floor(this.maxFogParticles * this.particleScale * effectiveFogParticles)
        : 0;
      this.fogPoints.visible = activeFogCount > 0;
      if (this.fogPoints.visible) {
        this.fogPoints.geometry.setDrawRange(0, activeFogCount);
        this.fogPoints.position.set(physics.x, physics.y, physics.z);
        this.fogMat.opacity = Math.min(0.36, 0.06 + effectiveFogParticles * 0.28);
        this.fogMat.size = this.weatherId === 'winter_mist' ? 15.5 : 13.0;
        this.fogMat.color.copy(this._cFogA).lerp(this._cFogTint, isDark ? 0.25 : 0.6);
        const fgPos = this.fogPoints.geometry.attributes.position.array;
        const driftVx = (0.8 + this.windStrength * 6.5);
        const driftVz = (0.3 + this.windStrength * 2.2);
        for (let i = 0; i < activeFogCount; i++) {
          const fg = this.fogSeeds[i];
          fg.x += driftVx * fg.drift * dt;
          fg.z += driftVz * fg.drift * dt;
          if (fg.x > 70) fg.x = -70;
          if (fg.z > 70) fg.z = -70;
          fgPos[i * 3] = fg.x;
          fgPos[i * 3 + 1] = fg.baseY + Math.sin(elapsed * 0.55 + fg.phase) * 0.9;
          fgPos[i * 3 + 2] = fg.z;
        }
        this.fogPoints.geometry.attributes.position.needsUpdate = true;
      }

      // 8d. Swirling Airborne Dust Motes & Highway Grit (reacts to Dusty/Sunny/Cloudy & rough roads; suppressed by rain)
      const roughRoadBoost = surfaceInfo && (surfaceInfo.surface === 'village' || surfaceInfo.surface === 'grass' || surfaceInfo.isBrokenRoad) ? 0.35 : 0;
      const dryFactor = Math.max(0, 1 - this.rainIntensity * 2.2);
      const effectiveDust = Math.min(1.0, (this.dustIntensity + roughRoadBoost) * dryFactor);
      const activeDustCount = this.effectsEnabled && effectiveDust > 0.05
        ? Math.floor(this.maxDustParticles * this.particleScale * effectiveDust)
        : 0;
      this.dustPoints.visible = activeDustCount > 0;
      if (this.dustPoints.visible) {
        this.dustPoints.geometry.setDrawRange(0, activeDustCount);
        this.dustPoints.position.set(physics.x, physics.y, physics.z);
        this.dustMat.opacity = Math.min(0.68, 0.14 + effectiveDust * 0.52);
        this.dustMat.size = this.weatherId === 'dusty' ? 2.25 : 1.45;
        const dsPos = this.dustPoints.geometry.attributes.position.array;
        const dVx = (1.6 + this.windStrength * 14.5);
        const dVz = (0.5 + this.windStrength * 4.5);
        for (let i = 0; i < activeDustCount; i++) {
          const ds = this.dustSeeds[i];
          ds.x += dVx * ds.speed * dt;
          ds.z += dVz * ds.speed * dt + Math.sin(elapsed * 1.4 + ds.phase) * 0.8 * dt;
          if (ds.x > 52) ds.x = -52;
          if (ds.z > 52) ds.z = -52;
          dsPos[i * 3] = ds.x;
          dsPos[i * 3 + 1] = ds.baseY + Math.sin(elapsed * 1.8 + ds.phase) * 0.65;
          dsPos[i * 3 + 2] = ds.z;
        }
        this.dustPoints.geometry.attributes.position.needsUpdate = true;
      }

      // 9. Tire Water Spray, Pothole Splashes, Rural Dust & Hard-Brake Skid Marks
      if (isDriving && this.effectsEnabled) {
        const speedKmh = Math.abs(physics.speedMs) * 3.6;
        const fx = -Math.sin(physics.yaw);
        const fz = -Math.cos(physics.yaw);
        const rx = Math.cos(physics.yaw);
        const rz = -Math.sin(physics.yaw);

        const rearL_x = physics.x - fx * 3.05 - rx * 1.12;
        const rearL_z = physics.z - fz * 3.05 - rz * 1.12;
        const rearR_x = physics.x - fx * 3.05 + rx * 1.12;
        const rearR_z = physics.z - fz * 3.05 + rz * 1.12;

        const roughSurface = surfaceInfo && (surfaceInfo.surface === 'village' || surfaceInfo.surface === 'grass' || surfaceInfo.isBrokenRoad);
        if (speedKmh > 14 && (this.wetSurface > 0.2 || roughSurface || (physics.isBraking && speedKmh > 25))) {
          const isSplash = this.wetSurface > 0.25 && !roughSurface;
          const isPotholeSplash = this.wetSurface > 0.25 && surfaceInfo && surfaceInfo.isBrokenRoad;
          this.tireParticleMat.color.setHex(isSplash || isPotholeSplash ? 0xe0f2fe : roughSurface ? 0xa16207 : 0xcbd5e1);
          const count = isPotholeSplash ? 2 : 1;
          for (let k = 0; k < count; k++) {
            this.spawnTireParticle(
              rearL_x, physics.y + 0.25, rearL_z,
              -fx * 2.5 + (Math.random() - 0.5) * 1.8, isPotholeSplash ? 3.8 : 1.9, -fz * 2.5 + (Math.random() - 0.5) * 1.8,
              0.45
            );
            this.spawnTireParticle(
              rearR_x, physics.y + 0.25, rearR_z,
              -fx * 2.5 + (Math.random() - 0.5) * 1.8, isPotholeSplash ? 3.8 : 1.9, -fz * 2.5 + (Math.random() - 0.5) * 1.8,
              0.45
            );
          }
        }

        this.skidCooldown = Math.max(0, this.skidCooldown - dt);
        if (((physics.isBraking && speedKmh > 24) || (physics.handbrake && speedKmh > 10)) && this.skidCooldown <= 0) {
          this.skidCooldown = 0.08;
          this.placeSkidMark(rearL_x, physics.y, rearL_z, physics.yaw);
          this.placeSkidMark(rearR_x, physics.y, rearR_z, physics.yaw);
        }
      }

      const tpPos = this.tirePoints.geometry.attributes.position.array;
      for (let i = 0; i < this.maxTireParticles; i++) {
        const p = this.tireParticleState[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy -= 5.5 * dt;
          p.z += p.vz * dt;
          tpPos[i * 3] = p.x;
          tpPos[i * 3 + 1] = p.y;
          tpPos[i * 3 + 2] = p.z;
        } else {
          tpPos[i * 3 + 1] = -999;
        }
      }
      this.tirePoints.geometry.attributes.position.needsUpdate = true;

      let activeWarning = targetW.fogWarning || null;
      if (!activeWarning && nearRiver && (this.clockHours < 8.5 || this.clockHours > 17.5)) {
        activeWarning = '🌫️ RIVER MIST NEAR BRIDGE — DRIVE WITH LOW/HIGH BEAM';
      }

      return {
        clockHours: this.clockHours,
        formattedClock: this.formatClock(this.clockHours),
        timeLabel: this.getTimePhaseLabel(this.clockHours),
        isDark,
        streetLightLevel,
        streetLightsActive: streetLightLevel > 0.15,
        weatherId: this.weatherId,
        weatherName: targetW.name,
        weatherIcon: targetW.icon,
        rainIntensity: this.rainIntensity,
        windStrength: this.windStrength,
        gripFactor: this.gripFactor,
        wetSurface: this.wetSurface,
        lightningFlash: this.lightningFlash,
        nearRiver,
        fogWarning: activeWarning
      };
    }
  }

  global.BDEnvironmentManager = EnvironmentManager;
})(typeof window !== 'undefined' ? window : globalThis);
