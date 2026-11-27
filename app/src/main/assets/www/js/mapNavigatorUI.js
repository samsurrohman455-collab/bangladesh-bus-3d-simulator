(function (global) {
  'use strict';

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class BDMapNavigatorUI {
    constructor(game) {
      this.game = game;
      this.activeTab = 'map';
      this.selectedLocId = 'dhaka';
      this.searchQuery = '';
      this.divFilter = 'all';
      this.catFilter = 'all';

      // Canvas pan & zoom state in Bangladesh world units
      this.viewCenterX = 0;
      this.viewCenterZ = 0;
      this.zoom = 1.0; // 1.0 fits whole Bangladesh nicely
      this.dragging = false;
      this.dragMoved = false;
      this.lastPointer = { x: 0, y: 0 };

      this.bindTabs();
    }

    bindTabs() {
      const strip = document.getElementById('bd-map-tabs');
      if (!strip) return;
      strip.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          strip.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeTab = btn.getAttribute('data-tab');
          this.render();
        });
      });
    }

    open(initialTab) {
      if (initialTab) {
        this.activeTab = initialTab;
        const strip = document.getElementById('bd-map-tabs');
        if (strip) {
          strip.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-tab') === initialTab);
          });
        }
      }
      const Geo = global.BDGeoData;
      if (Geo && this.game && this.game.physics) {
        const nearest = Geo.findNearestLocation(this.game.physics.x, this.game.physics.z);
        if (nearest && nearest.location) {
          this.selectedLocId = nearest.location.id;
        }
      }
      document.getElementById('bd-map-modal').classList.remove('hidden');
      this.render();
    }

    render() {
      const body = document.getElementById('bd-map-body');
      const Geo = global.BDGeoData;
      const Tiles = global.BDMapTiles;
      if (!body || !Geo) return;

      const subEl = document.getElementById('bd-map-sub');
      if (subEl) {
        const districtCount = Object.values(Geo.BANGLADESH_LOCATIONS).filter((l) => l.isDistrict).length;
        const gps = Geo.worldToLatLon(this.game.physics.x, this.game.physics.z);
        subEl.textContent = `${Geo.BD_DIVISIONS.length} Divisions • ${districtCount} Districts • GPS: ${gps.lat.toFixed(4)}°N, ${gps.lon.toFixed(4)}°E`;
      }

      if (this.activeTab === 'offline') {
        this.renderOfflineTab(body, Geo, Tiles);
        return;
      }

      this.renderMapTab(body, Geo, Tiles);
    }

    renderMapTab(body, Geo, Tiles) {
      const divs = Geo.BD_DIVISIONS;
      body.innerHTML = `
        <div class="bd-map-layout">
          <div class="bd-map-canvas-col">
            <div class="bd-map-toolbar">
              <button type="button" class="btn btn-secondary bd-map-tool-btn" id="bd-map-zoom-in" title="Zoom In">＋</button>
              <button type="button" class="btn btn-secondary bd-map-tool-btn" id="bd-map-zoom-out" title="Zoom Out">－</button>
              <button type="button" class="btn btn-secondary bd-map-tool-btn" id="bd-map-center-bus" title="Center on Bus">📍 Bus</button>
              <button type="button" class="btn btn-secondary bd-map-tool-btn" id="bd-map-reset-view" title="Full Bangladesh">🇧🇩 All</button>
              <select id="bd-map-layer-sel" class="p5-select" style="padding:4px 7px;font-size:11px;margin-left:auto;">
                <option value="offline_vector" ${Tiles && Tiles.tileMode === 'offline_vector' ? 'selected' : ''}>Vector Map</option>
                <option value="osm" ${Tiles && Tiles.tileMode === 'osm' ? 'selected' : ''}>OSM Tiles</option>
                <option value="satellite" ${Tiles && Tiles.tileMode === 'satellite' ? 'selected' : ''}>Satellite</option>
              </select>
            </div>
            <div class="bd-map-canvas-wrap">
              <canvas id="bd-map-canvas" width="460" height="330"></canvas>
              <div id="bd-map-attrib" class="bd-map-attrib">Map data © OpenStreetMap contributors (ODbL) • SRTM DEM</div>
            </div>
          </div>

          <div class="bd-map-side-col">
            <div class="bd-map-filters">
              <input id="bd-map-search" class="p5-input" style="width:100%;" placeholder="Search district, upazila, landmark, বাংলা..." value="${escHtml(this.searchQuery)}" />
              <div class="p5-row" style="gap:6px;">
                <select id="bd-map-div-filter" class="p5-select" style="flex:1;font-size:11px;">
                  <option value="all">All 8 Divisions</option>
                  ${divs.map((d) => `<option value="${d.id}" ${this.divFilter === d.id ? 'selected' : ''}>${escHtml(d.nameEn)} (${escHtml(d.nameBn)})</option>`).join('')}
                </select>
                <select id="bd-map-cat-filter" class="p5-select" style="flex:1;font-size:11px;">
                  <option value="all" ${this.catFilter === 'all' ? 'selected' : ''}>All Places (${Object.keys(Geo.BANGLADESH_LOCATIONS || {}).length})</option>
                  <option value="district" ${this.catFilter === 'district' ? 'selected' : ''}>64 Districts</option>
                  <option value="terminal" ${this.catFilter === 'terminal' ? 'selected' : ''}>Terminals</option>
                  <option value="market" ${this.catFilter === 'market' ? 'selected' : ''}>Mor & Bazaars</option>
                  <option value="landmark" ${this.catFilter === 'landmark' ? 'selected' : ''}>Landmarks</option>
                </select>
              </div>
            </div>
            <div id="bd-map-results" class="bd-map-results"></div>
            <div id="bd-map-inspector" class="bd-map-inspector"></div>
          </div>
        </div>
      `;

      const searchEl = document.getElementById('bd-map-search');
      const divEl = document.getElementById('bd-map-div-filter');
      const catEl = document.getElementById('bd-map-cat-filter');
      const layerEl = document.getElementById('bd-map-layer-sel');

      searchEl.addEventListener('input', () => {
        this.searchQuery = searchEl.value;
        this.updateResultsAndInspector();
        this.drawMapCanvas();
      });
      divEl.addEventListener('change', () => {
        this.divFilter = divEl.value;
        this.updateResultsAndInspector();
        this.drawMapCanvas();
      });
      catEl.addEventListener('change', () => {
        this.catFilter = catEl.value;
        this.updateResultsAndInspector();
        this.drawMapCanvas();
      });
      layerEl.addEventListener('change', () => {
        if (Tiles) {
          Tiles.tileMode = layerEl.value;
          this.updateAttributionLabel();
          this.drawMapCanvas();
        }
      });

      document.getElementById('bd-map-zoom-in').addEventListener('click', () => {
        this.zoom = Math.min(18, this.zoom * 1.45);
        this.drawMapCanvas();
      });
      document.getElementById('bd-map-zoom-out').addEventListener('click', () => {
        this.zoom = Math.max(0.75, this.zoom / 1.45);
        this.drawMapCanvas();
      });
      document.getElementById('bd-map-center-bus').addEventListener('click', () => {
        this.viewCenterX = this.game.physics.x;
        this.viewCenterZ = this.game.physics.z;
        this.zoom = Math.max(this.zoom, 4.5);
        this.drawMapCanvas();
      });
      document.getElementById('bd-map-reset-view').addEventListener('click', () => {
        this.viewCenterX = 0;
        this.viewCenterZ = 0;
        this.zoom = 1.0;
        this.drawMapCanvas();
      });

      this.bindCanvasInteractions();
      this.updateAttributionLabel();
      this.updateResultsAndInspector();
      this.drawMapCanvas();
    }

    updateAttributionLabel() {
      const el = document.getElementById('bd-map-attrib');
      const Tiles = global.BDMapTiles;
      if (!el || !Tiles) return;
      if (Tiles.tileMode === 'satellite') {
        el.textContent = Tiles.isOnline
          ? 'Satellite: Esri World Imagery • Vectors: OSM (ODbL)'
          : 'Offline Cached Vector Fallback (OSM ODbL / SRTM)';
      } else if (Tiles.tileMode === 'osm') {
        el.textContent = Tiles.isOnline
          ? 'Map tiles © OpenStreetMap contributors (ODbL)'
          : 'Offline Cached Vector Fallback (OSM ODbL / SRTM)';
      } else {
        el.textContent = 'Bundled Vector Topology (OSM ODbL • BBS Districts • SRTM DEM)';
      }
    }

    bindCanvasInteractions() {
      const canvas = document.getElementById('bd-map-canvas');
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        this.dragging = true;
        this.dragMoved = false;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
        const rect = canvas.getBoundingClientRect();
        const pxScale = this.getMapPxPerWorldUnit(canvas);
        const ratioX = canvas.width / Math.max(1, rect.width);
        const ratioY = canvas.height / Math.max(1, rect.height);
        this.viewCenterX -= (dx * ratioX) / pxScale;
        this.viewCenterZ -= (dy * ratioY) / pxScale;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.drawMapCanvas();
      });

      const stopDrag = (e) => {
        if (!this.dragging) return;
        this.dragging = false;
        if (!this.dragMoved) {
          this.selectLocationAtPointer(canvas, e);
        }
      };
      canvas.addEventListener('pointerup', stopDrag);
      canvas.addEventListener('pointercancel', () => { this.dragging = false; });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.2 : 0.84;
        this.zoom = Math.max(0.75, Math.min(18, this.zoom * factor));
        this.drawMapCanvas();
      }, { passive: false });
    }

    selectLocationAtPointer(canvas, e) {
      const Geo = global.BDGeoData;
      if (!Geo) return;
      const rect = canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const cy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
      const pxScale = this.getMapPxPerWorldUnit(canvas);
      const wx = this.viewCenterX + (cx - canvas.width / 2) / pxScale;
      const wz = this.viewCenterZ + (cy - canvas.height / 2) / pxScale;
      const nearest = Geo.findNearestLocation(wx, wz);
      if (nearest && nearest.location && nearest.distUnits * pxScale <= 24) {
        this.selectedLocId = nearest.location.id;
        this.updateResultsAndInspector();
        this.drawMapCanvas();
      }
    }

    getMapPxPerWorldUnit(canvas) {
      return (canvas.height / 28500) * this.zoom;
    }

    updateResultsAndInspector() {
      const Geo = global.BDGeoData;
      if (!Geo) return;
      const listEl = document.getElementById('bd-map-results');
      const inspEl = document.getElementById('bd-map-inspector');
      if (!listEl || !inspEl) return;

      const matches = Geo.searchRealLocations(this.searchQuery, this.divFilter, this.catFilter);
      const playerGps = Geo.worldToLatLon(this.game.physics.x, this.game.physics.z);

      listEl.innerHTML = matches.slice(0, 80).map((loc) => {
        const km = Math.round(Geo.haversineKm(playerGps.lat, playerGps.lon, loc.lat, loc.lon));
        const active = loc.id === this.selectedLocId;
        const badge = loc.isTerminal ? '🚌 Terminal' : loc.isDistrict ? '🏙️ District' : '📍 Landmark';
        return `
          <button type="button" class="bd-loc-row ${active ? 'active' : ''}" data-loc="${loc.id}">
            <span>
              <b>${escHtml(loc.nameEn)}</b> <small>(${escHtml(loc.nameBn)})</small>
            </span>
            <span class="bd-loc-meta">${badge} • ${km} km</span>
          </button>
        `;
      }).join('') || '<div class="p5-muted" style="padding:8px;">No matching Bangladesh locations found.</div>';

      listEl.querySelectorAll('.bd-loc-row').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedLocId = btn.getAttribute('data-loc');
          const sel = Geo.BANGLADESH_LOCATIONS[this.selectedLocId];
          if (sel) {
            this.viewCenterX = sel.x;
            this.viewCenterZ = sel.z;
          }
          this.updateResultsAndInspector();
          this.drawMapCanvas();
        });
      });

      const loc = Geo.BANGLADESH_LOCATIONS[this.selectedLocId] || Geo.BANGLADESH_LOCATIONS.dhaka;
      const divObj = Geo.BD_DIVISIONS.find((d) => d.id === loc.division);
      const elev = Geo.getElevationAtLatLon(loc.lat, loc.lon);
      const nearestPlayer = Geo.findNearestLocation(this.game.physics.x, this.game.physics.z);
      const routeFromId = nearestPlayer && nearestPlayer.location ? nearestPlayer.location.id : 'dhaka';
      const roadPath = Geo.findShortestRoadPath(routeFromId, loc.id);
      const airKm = Math.round(Geo.haversineKm(playerGps.lat, playerGps.lon, loc.lat, loc.lon) * 10) / 10;
      const roadKm = roadPath ? roadPath.totalKm : airKm;
      const upazilaText = (loc.upazilas || []).slice(0, 5).join(', ');
      const cached = global.BDMapTiles ? global.BDMapTiles.isDivisionCached(loc.division) : true;

      inspEl.innerHTML = `
        <div class="p5-row">
          <div>
            <strong style="font-size:13px;color:#fff;">${escHtml(loc.nameEn)}</strong>
            <span style="font-size:11px;color:#fcd34d;"> (${escHtml(loc.nameBn)})</span>
          </div>
          <span class="badge-pill" style="border-color:${divObj ? divObj.color : '#10b981'}">${divObj ? escHtml(divObj.nameEn) : escHtml(loc.division)}</span>
        </div>
        <div class="bd-insp-meta">
          <span>🌐 ${loc.lat.toFixed(4)}°N, ${loc.lon.toFixed(4)}°E</span>
          <span>⛰️ Elev ~${Math.round(elev * 3 + 6)}m</span>
          <span>🛣️ Road: ${roadKm} km</span>
          <span>${cached ? '📥 Offline Ready' : '☁️ Stream/Vector'}</span>
        </div>
        <small style="color:#a7f3d0;line-height:1.3;">${escHtml(loc.desc || '')}</small>
        ${upazilaText ? `<small style="color:#cbd5e1;"><b>Upazilas/Areas:</b> ${escHtml(upazilaText)}</small>` : ''}
        ${roadPath && roadPath.stops.length > 1 ? `<small style="color:#7dd3fc;"><b>Via:</b> ${roadPath.stops.slice(0, 5).map((id) => escHtml(Geo.BANGLADESH_LOCATIONS[id].nameEn)).join(' → ')}${roadPath.stops.length > 5 ? ` … → ${escHtml(loc.nameEn)}` : ''}</small>` : ''}
        <div class="p5-row" style="margin-top:4px;gap:5px;">
          <button type="button" id="bd-btn-navigate" class="btn btn-secondary" style="flex:1;padding:7px 6px;font-size:10.5px;">🧭 GPS রুট</button>
          <button type="button" id="bd-btn-spawn-loc" class="btn btn-secondary" style="flex:1;padding:7px 6px;font-size:10.5px;">🚌 এখানে যান</button>
          <button type="button" id="bd-btn-start-mission" class="btn btn-primary" style="flex:1.15;padding:7px 6px;font-size:10.5px;">🎯 মিশন শুরু</button>
        </div>
      `;

      document.getElementById('bd-btn-navigate').addEventListener('click', () => {
        this.game.navigateByRoadTo(loc.id);
        document.getElementById('bd-map-modal').classList.add('hidden');
        if (this.game.mode !== 'menu') this.game.paused = false;
      });

      document.getElementById('bd-btn-spawn-loc').addEventListener('click', () => {
        document.getElementById('bd-map-modal').classList.add('hidden');
        this.game.spawnAtRealLocation(loc.id);
      });

      document.getElementById('bd-btn-start-mission').addEventListener('click', () => {
        document.getElementById('bd-map-modal').classList.add('hidden');
        this.game.startMissionToLocation(loc.id);
      });
    }

    drawMapCanvas() {
      const canvas = document.getElementById('bd-map-canvas');
      const Geo = global.BDGeoData;
      const Tiles = global.BDMapTiles;
      if (!canvas || !Geo) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#071b24'; // Bay of Bengal deep water base
      ctx.fillRect(0, 0, w, h);

      const pxScale = this.getMapPxPerWorldUnit(canvas);
      const toScreen = (wx, wz) => [
        w / 2 + (wx - this.viewCenterX) * pxScale,
        h / 2 + (wz - this.viewCenterZ) * pxScale
      ];

      // Optional live Web Mercator Tile Overlay (OSM / Esri) with smooth fallback
      if (Tiles && Tiles.tileMode !== 'offline_vector' && Tiles.isOnline) {
        const z = this.zoom < 1.8 ? 7 : this.zoom < 4.5 ? 8 : this.zoom < 10 ? 9 : 11;
        const centerGps = Geo.worldToLatLon(this.viewCenterX, this.viewCenterZ);
        const centerTileX = Math.floor(((centerGps.lon + 180) / 360) * Math.pow(2, z));
        const latRad = (centerGps.lat * Math.PI) / 180;
        const centerTileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
        const span = this.zoom < 2.2 ? 2 : 1;

        for (let ty = centerTileY - span; ty <= centerTileY + span; ty++) {
          for (let tx = centerTileX - span; tx <= centerTileX + span; tx++) {
            const n = Math.pow(2, z);
            if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
            const entry = Tiles.fetchTileImage(z, tx, ty, Tiles.tileMode);
            if (entry && entry.status === 'ready' && entry.img) {
              const lonW = (tx / n) * 360 - 180;
              const lonE = ((tx + 1) / n) * 360 - 180;
              const latN = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
              const latS = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 1)) / n))) * 180) / Math.PI;
              const nw = Geo.latLonToWorld(latN, lonW);
              const se = Geo.latLonToWorld(latS, lonE);
              const [sx1, sy1] = toScreen(nw.x, nw.z);
              const [sx2, sy2] = toScreen(se.x, se.z);
              ctx.globalAlpha = 0.65;
              ctx.drawImage(entry.img, sx1, sy1, sx2 - sx1, sy2 - sy1);
              ctx.globalAlpha = 1.0;
            }
          }
        }
      }

      // Draw Bangladesh National Boundary Landmass Polygon
      if (Geo.BANGLADESH_BORDER_LATLON && Geo.BANGLADESH_BORDER_LATLON.length > 2) {
        ctx.beginPath();
        Geo.BANGLADESH_BORDER_LATLON.forEach(([lat, lon], idx) => {
          const p = Geo.latLonToWorld(lat, lon);
          const [sx, sy] = toScreen(p.x, p.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fillStyle = Tiles && Tiles.tileMode !== 'offline_vector' ? 'rgba(14, 52, 34, 0.35)' : '#0f3622';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.55)';
        ctx.stroke();
      }

      // Draw Real Rivers
      ctx.lineWidth = Math.max(1.2, 2.2 * Math.min(2, this.zoom * 0.5));
      ctx.strokeStyle = '#38bdf8';
      Geo.REAL_RIVERS.forEach((riv) => {
        const pts = riv.points || riv.pointsLatLon || [];
        ctx.beginPath();
        pts.forEach(([lat, lon], idx) => {
          const p = Geo.latLonToWorld(lat, lon);
          const [sx, sy] = toScreen(p.x, p.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      });

      // Draw Real Highway & Road Network
      const edges = this.game.world ? this.game.world.roadEdges : Geo.ROAD_NETWORK_EDGES;
      edges.forEach((edge) => {
        ctx.beginPath();
        if (edge.samples && edge.samples.length > 0) {
          const step = Math.max(1, Math.floor(edge.samples.length / 8));
          for (let i = 0; i < edge.samples.length; i += step) {
            const [sx, sy] = toScreen(edge.samples[i].x, edge.samples[i].z);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          const last = edge.samples[edge.samples.length - 1];
          const [lx, ly] = toScreen(last.x, last.z);
          ctx.lineTo(lx, ly);
        } else {
          const p1 = Geo.BANGLADESH_LOCATIONS[edge.from];
          const p2 = Geo.BANGLADESH_LOCATIONS[edge.to];
          const [x1, y1] = toScreen(p1.x, p1.z);
          const [x2, y2] = toScreen(p2.x, p2.z);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.lineWidth = edge.type === 'highway' ? 1.8 : 1.1;
        ctx.strokeStyle = edge.ferry
          ? '#f472b6'
          : edge.bridge
          ? '#60a5fa'
          : edge.type === 'village'
          ? '#d97706'
          : '#94a3b8';
        ctx.stroke();
      });

      // Draw Active GPS Navigation Route OR Active Career Route
      const activeStops =
        (this.game.gpsNavRoute && this.game.gpsNavRoute.stops) ||
        (this.game.activeRoute && this.game.mode === 'career' && this.game.activeRoute.stops) ||
        null;
      if (activeStops && activeStops.length > 1) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        activeStops.forEach((sid, idx) => {
          const l = Geo.BANGLADESH_LOCATIONS[sid];
          if (!l) return;
          const [sx, sy] = toScreen(l.x, l.z);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }

      // Draw Locations (filtered matches emphasized)
      const matchedSet = new Set(
        Geo.searchRealLocations(this.searchQuery, this.divFilter, this.catFilter).map((l) => l.id)
      );
      const divColorMap = {};
      Geo.BD_DIVISIONS.forEach((d) => { divColorMap[d.id] = d.color; });

      ctx.font = 'bold 9px sans-serif';
      Object.values(Geo.BANGLADESH_LOCATIONS).forEach((loc) => {
        const [sx, sy] = toScreen(loc.x, loc.z);
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) return;
        const isSel = loc.id === this.selectedLocId;
        const isMatch = matchedSet.has(loc.id);
        const r = isSel ? 5.5 : loc.isTerminal ? 4.0 : loc.isDistrict ? 3.0 : 2.3;

        ctx.fillStyle = isSel
          ? '#fde047'
          : !isMatch
          ? 'rgba(148, 163, 184, 0.35)'
          : divColorMap[loc.division] || '#10b981';

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        if (isSel || (isMatch && (loc.isTerminal || this.zoom >= 2.1))) {
          ctx.fillStyle = isSel ? '#fef08a' : '#e2e8f0';
          ctx.fillText(loc.nameEn, sx + 6, sy + 3);
        }
      });

      // Draw Player Live GPS Marker
      const [px, py] = toScreen(this.game.physics.x, this.game.physics.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-this.game.physics.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    renderOfflineTab(body, Geo, Tiles) {
      const onlineBadge = Tiles && Tiles.isOnline ? '🟢 Online (Live Map Tiles Available)' : '⚪ Offline (Cached Vector & Procedural Terrain)';
      body.innerHTML = `
        <div class="p5-grid">
          <div class="p5-card">
            <div class="p5-row">
              <h3>📥 Offline Division Map Packs</h3>
              <span class="badge-pill">${onlineBadge}</span>
            </div>
            <small>Cache administrative districts, upazilas, DEM heights &amp; road topology by division for fast offline driving.</small>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
              ${Geo.BD_DIVISIONS.map((div) => {
                const cached = Tiles && Tiles.isDivisionCached(div.id);
                const count = Object.values(Geo.BANGLADESH_LOCATIONS).filter((l) => l.division === div.id && l.isDistrict).length;
                return `
                  <div class="lb-row ${cached ? 'me' : ''}">
                    <span>
                      <b>${escHtml(div.nameEn)} Division</b> (${escHtml(div.nameBn)})<br/>
                      <small>${count} Districts • ~${div.offlineSizeMb} MB vector pack</small>
                    </span>
                    ${cached
                      ? `<button type="button" class="btn btn-secondary bd-clr-div" data-div="${div.id}" style="padding:4px 9px;font-size:10px;">✓ Cached</button>`
                      : `<button type="button" class="btn btn-primary bd-dl-div" data-div="${div.id}" style="padding:4px 9px;font-size:10px;">⬇️ Download</button>`}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="p5-card">
            <h3>📜 Licensed Geographic Data Sources</h3>
            <small>All coordinates use uniform WGS-84 projection centered on Dhaka (40 units/km) with transparent provenance:</small>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
              ${Geo.DATA_SOURCES.map((src) => `
                <div class="p5-card" style="padding:7px 9px;">
                  <div class="p5-row"><b>${escHtml(src.name)}</b><span class="badge-pill badge-blue">${escHtml(src.license)}</span></div>
                  <small>${escHtml(src.scope)}</small>
                  <small style="color:#fde68a;">Status: ${escHtml(src.status)} • Updated ${escHtml(src.updated)}</small>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      body.querySelectorAll('.bd-dl-div').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!Tiles) return;
          const res = Tiles.downloadDivisionOffline(btn.getAttribute('data-div'));
          this.game.showToast(res.msg);
          this.renderOfflineTab(body, Geo, Tiles);
        });
      });

      body.querySelectorAll('.bd-clr-div').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!Tiles) return;
          const res = Tiles.clearDivisionOffline(btn.getAttribute('data-div'));
          this.game.showToast(res.msg);
          this.renderOfflineTab(body, Geo, Tiles);
        });
      });
    }
  }

  global.BDMapNavigatorUI = BDMapNavigatorUI;
})(typeof window !== 'undefined' ? window : globalThis);
