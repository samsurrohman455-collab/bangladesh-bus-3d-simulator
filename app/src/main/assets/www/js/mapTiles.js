(function (global) {
  'use strict';

  const OFFLINE_CACHE_KEY = 'bd_bus_offline_divisions_v1';

  // Standard Web Mercator Slippy Tile math (OSM / Esri compatible)
  function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const xtile = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const ytile = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return {
      x: Math.max(0, Math.min(n - 1, xtile)),
      y: Math.max(0, Math.min(n - 1, ytile)),
      z: zoom
    };
  }

  class BDMapTileManager {
    constructor() {
      this.tileCache = new Map();
      this.offlineDivisions = this.loadOfflineState();
      this.tileMode = 'osm'; // 'osm' | 'satellite' | 'offline_vector'
      this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => { this.isOnline = true; });
        window.addEventListener('offline', () => { this.isOnline = false; });
      }
    }

    loadOfflineState() {
      try {
        const raw = global.localStorage && global.localStorage.getItem(OFFLINE_CACHE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      // Dhaka core metadata bundled locally by default
      return {
        dhaka: { cachedAt: 'Bundled', districts: 13, source: 'Bundled Geo + Vector Cache' }
      };
    }

    saveOfflineState() {
      try {
        if (global.localStorage) {
          global.localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(this.offlineDivisions));
        }
      } catch (_) {}
    }

    isDivisionCached(divId) {
      return !!this.offlineDivisions[divId];
    }

    downloadDivisionOffline(divId) {
      const Geo = global.BDGeoData;
      if (!Geo) return { ok: false, msg: 'Geographic dataset unavailable.' };
      const div = Geo.BD_DIVISIONS.find((d) => d.id === divId);
      if (!div) return { ok: false, msg: 'Division not found.' };

      const districts = Object.values(Geo.BANGLADESH_LOCATIONS).filter(
        (l) => l.division === divId
      );
      const payload = {
        cachedAt: new Date().toISOString().slice(0, 10),
        districts: districts.filter((d) => d.isDistrict).length,
        locations: districts.length,
        source: 'OSM Vector Topology + DEM Elevation Cache'
      };
      this.offlineDivisions[divId] = payload;
      this.saveOfflineState();

      // Pre-warm map tile request if online (non-blocking)
      if (this.isOnline && typeof Image !== 'undefined') {
        const tile = latLonToTile(div.centerLat, div.centerLon, 10);
        this.fetchTileImage(tile.z, tile.x, tile.y, this.tileMode);
      }
      return {
        ok: true,
        msg: `${div.nameEn} Division cached offline (${payload.districts} districts, ${payload.locations} places).`
      };
    }

    clearDivisionOffline(divId) {
      if (divId === 'dhaka') {
        return { ok: false, msg: 'Dhaka core map stays bundled for instant startup.' };
      }
      delete this.offlineDivisions[divId];
      this.saveOfflineState();
      return { ok: true, msg: 'Cleared offline division cache.' };
    }

    getTileUrl(z, x, y, mode) {
      if (mode === 'satellite') {
        return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      }
      return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }

    fetchTileImage(z, x, y, mode) {
      const m = mode || this.tileMode;
      const key = `${m}_${z}_${x}_${y}`;
      if (this.tileCache.has(key)) return this.tileCache.get(key);

      if (!this.isOnline || typeof Image === 'undefined') {
        return null;
      }

      const entry = { status: 'loading', img: null, key };
      this.tileCache.set(key, entry);

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => {
          if (entry.status === 'loading') entry.status = 'error';
        }, 4500);
        img.onload = () => {
          clearTimeout(timer);
          entry.status = 'ready';
          entry.img = img;
        };
        img.onerror = () => {
          clearTimeout(timer);
          entry.status = 'error';
        };
        img.src = this.getTileUrl(z, x, y, m);
      } catch (_) {
        entry.status = 'error';
      }
      return entry;
    }

    // Procedural fallback satellite-style texture for 3D ground terrain tiles
    createRegionalGroundTexture(biome) {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');

      const palettes = {
        urban_dhaka: ['#3f5a45', '#4c5b4f', '#64748b'],
        haor_hills_sylhet: ['#1e6b34', '#2d8a45', '#14532d'],
        port_hills_ctg: ['#2f6b36', '#4d7c3f', '#5c5346'],
        coast_beach: ['#d6be8a', '#2e6f40', '#c2a874'],
        mangrove_delta: ['#14532d', '#1b4d3e', '#0f3d2e'],
        plains_north: ['#3b7a38', '#4c8c42', '#688c3a'],
        delta_plains: ['#2d6a31', '#3b813e', '#235927']
      };
      const cols = palettes[biome] || palettes.delta_plains;

      ctx.fillStyle = cols[0];
      ctx.fillRect(0, 0, 256, 256);

      // Subtle paddy-field / terrain patchwork matching satellite delta look
      for (let i = 0; i < 42; i++) {
        const x = (i * 59) % 240;
        const y = (i * 97) % 240;
        const w = 18 + (i % 4) * 14;
        const h = 14 + (i % 3) * 12;
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.38;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1.0;

      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      return tex;
    }
  }

  global.BDMapTiles = new BDMapTileManager();
})(typeof window !== 'undefined' ? window : globalThis);
