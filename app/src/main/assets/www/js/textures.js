(function (global) {
  'use strict';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function createHighwayTexture() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');

    // Base weathered dark tarmac
    ctx.fillStyle = '#2a2e33';
    ctx.fillRect(0, 0, 512, 512);

    // Earthen & brick-dust road shoulders (কাঁচা/ইটের ধার) on outer edges
    ctx.fillStyle = '#6b4e38';
    ctx.fillRect(0, 0, 28, 512);
    ctx.fillRect(484, 0, 28, 512);
    ctx.fillStyle = '#47682c';
    ctx.fillRect(0, 0, 10, 512);
    ctx.fillRect(502, 0, 10, 512);

    // Fine asphalt aggregate & soil speckling
    for (let i = 0; i < 8500; i++) {
      const x = (i * 73) % 512;
      const y = (i * 137) % 512;
      if (x < 28 || x > 484) {
        ctx.fillStyle = i % 3 === 0 ? '#856248' : '#533c2a';
      } else {
        const v = 34 + (i % 28);
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      }
      ctx.fillRect(x, y, 2, 2);
    }

    // Occasional subtle darker bitumen repair patches
    ctx.fillStyle = 'rgba(20, 22, 26, 0.35)';
    ctx.fillRect(88, 92, 58, 36);
    ctx.fillRect(344, 310, 62, 44);

    // Crisp yellow outer highway edge lines
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(34, 0, 8, 512);
    ctx.fillRect(470, 0, 8, 512);

    // Tire wear tracks along 4 lanes
    ctx.fillStyle = 'rgba(15, 17, 20, 0.28)';
    ctx.fillRect(84, 0, 38, 512);
    ctx.fillRect(172, 0, 38, 512);
    ctx.fillRect(302, 0, 38, 512);
    ctx.fillRect(390, 0, 38, 512);

    // Dashed sub-lane markings
    ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
    for (let y = 20; y < 512; y += 84) {
      ctx.fillRect(146, y, 5, 36);
      ctx.fillRect(361, y, 5, 36);
    }

    // Center white/amber dashed highway divider line
    ctx.fillStyle = '#f8fafc';
    for (let y = 12; y < 512; y += 88) {
      ctx.fillRect(251, y, 10, 48);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function createVillageRoadTexture() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');

    // Grassy/muddy rural edge shoulders
    ctx.fillStyle = '#4e6b31';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#73533a';
    ctx.fillRect(16, 0, 224, 256);

    // Red-brick herringbone / worn rural road center
    ctx.fillStyle = '#8b4130';
    ctx.fillRect(30, 0, 196, 256);

    // Brick course lines
    ctx.fillStyle = 'rgba(58, 28, 20, 0.35)';
    for (let y = 0; y < 256; y += 16) {
      ctx.fillRect(30, y, 196, 2);
      const offset = ((y / 16) % 2) * 14;
      for (let x = 30 + offset; x < 224; x += 28) {
        ctx.fillRect(x, y, 2, 16);
      }
    }

    // Dusty tire tracks from buses/rickshaws/vans
    ctx.fillStyle = 'rgba(66, 48, 36, 0.32)';
    ctx.fillRect(62, 0, 34, 256);
    ctx.fillRect(160, 0, 34, 256);

    for (let i = 0; i < 2400; i++) {
      const x = (i * 53) % 256;
      const y = (i * 97) % 256;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(164, 114, 84, 0.25)' : 'rgba(52, 34, 24, 0.22)';
      ctx.fillRect(x, y, 3, 3);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createCityRoadTexture() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#29323d';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 3200; i++) {
      const x = (i * 61) % 256;
      const y = (i * 113) % 256;
      const v = 35 + (i % 20);
      ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Authentic Bangladeshi black-and-white painted city curbs
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = (y / 32) % 2 === 0 ? '#e2e8f0' : '#1e293b';
      ctx.fillRect(0, y, 14, 32);
      ctx.fillRect(242, y, 14, 32);
    }

    ctx.fillStyle = '#facc15';
    ctx.fillRect(16, 0, 4, 256);
    ctx.fillRect(236, 0, 4, 256);

    ctx.fillStyle = '#f8fafc';
    for (let y = 10; y < 256; y += 64) {
      ctx.fillRect(124, y, 8, 34);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createHazardStripeTexture() {
    const c = makeCanvas(128, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f97316';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x - 16, 64);
      ctx.lineTo(x - 32, 64);
      ctx.closePath();
      ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  function createGrassTexture() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2e6930';
    ctx.fillRect(0, 0, 512, 512);

    // Patchwork Bangladeshi paddy & crop field plots (ধানক্ষেত ও জমির আইল)
    const fieldColors = [
      '#2e6a31', '#3b7a36', '#4d8a38', '#336e34',
      '#5b9436', '#729c35', '#2a602d', '#86a238'
    ];
    const plotSize = 128;
    for (let gx = 0; gx < 4; gx++) {
      for (let gy = 0; gy < 4; gy++) {
        const col = fieldColors[(gx * 5 + gy * 3) % fieldColors.length];
        ctx.fillStyle = col;
        ctx.fillRect(gx * plotSize + 4, gy * plotSize + 4, plotSize - 8, plotSize - 8);

        // Subtle crop furrow lines inside each paddy plot
        ctx.fillStyle = 'rgba(20, 48, 18, 0.14)';
        for (let r = 8; r < plotSize - 8; r += 10) {
          if ((gx + gy) % 2 === 0) {
            ctx.fillRect(gx * plotSize + 6, gy * plotSize + r, plotSize - 12, 2);
          } else {
            ctx.fillRect(gx * plotSize + r, gy * plotSize + 6, 2, plotSize - 12);
          }
        }
      }
    }

    // Narrow earthy field bunds (জমির আইল)
    ctx.strokeStyle = '#536234';
    ctx.lineWidth = 5;
    for (let i = 0; i <= 512; i += plotSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Natural organic grass & soil speckling
    for (let i = 0; i < 6500; i++) {
      const x = (i * 41) % 512;
      const y = (i * 83) % 512;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(132, 204, 22, 0.14)' : 'rgba(20, 50, 22, 0.16)';
      ctx.fillRect(x, y, 3, 4);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // 3600 / 72 = 50 units per repeat -> matches 400-unit groundMesh snap cleanly (8 repeats)
    tex.repeat.set(72, 72);
    return tex;
  }

  function createWaterTexture() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#0f566b');
    grad.addColorStop(0.5, '#136b7e');
    grad.addColorStop(1, '#0c4e61');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(207, 250, 254, 0.18)';
    for (let i = 0; i < 110; i++) {
      const x = (i * 61) % 232;
      const y = (i * 37) % 244;
      ctx.fillRect(x, y, 20 + (i % 14), 2);
    }
    ctx.fillStyle = 'rgba(12, 74, 110, 0.25)';
    for (let i = 0; i < 70; i++) {
      const x = (i * 43) % 228;
      const y = (i * 71) % 242;
      ctx.fillRect(x, y, 24, 3);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 22);
    return tex;
  }

  function createSignTexture(bgColor, borderColor, textColor, line1, line2) {
    const c = makeCanvas(512, 256);
    const ctx = c.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, 488, 232);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(line1, 256, line2 ? 96 : 128);

    if (line2) {
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(line2, 256, 174);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function createPlateTexture(text) {
    const c = makeCanvas(256, 64);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#065f46';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    return new THREE.CanvasTexture(c);
  }

  function createDestinationLedTexture(routeBn, companyName) {
    const c = makeCanvas(512, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(routeBn, 256, 46);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(companyName.toUpperCase(), 256, 94);
    return new THREE.CanvasTexture(c);
  }

  function createDashboardTexture() {
    const c = makeCanvas(512, 192);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(150, 108, 62, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(362, 108, 62, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    ctx.fillStyle = '#052e16';
    ctx.fillRect(226, 48, 60, 96);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.strokeRect(226, 48, 60, 96);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KM/H', 150, 118);
    ctx.fillText('RPM', 362, 118);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('BD', 256, 98);

    return new THREE.CanvasTexture(c);
  }

  function createAsphaltRoughnessTexture() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, 256, 256);
    // Smooth dark puddles across wheel tracks for realistic wet-road specular reflections
    const puddles = [[68, 52, 22, 34], [184, 118, 26, 42], [92, 185, 24, 30], [168, 218, 18, 28]];
    puddles.forEach(([x, y, rx, ry]) => {
      const grad = ctx.createRadialGradient(x, y, 4, x, y, Math.max(rx, ry));
      grad.addColorStop(0, '#1e1e1e');
      grad.addColorStop(0.7, '#5a5a5a');
      grad.addColorStop(1, '#c8c8c8');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2);
      ctx.fill();
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createCloudTexture() {
    const c = makeCanvas(256, 128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    const puffs = [[82, 68, 46], [128, 54, 54], [174, 70, 44], [52, 78, 32], [202, 78, 30]];
    puffs.forEach(([x, y, r]) => {
      const grad = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.92)');
      grad.addColorStop(0.65, 'rgba(241,245,249,0.58)');
      grad.addColorStop(1, 'rgba(241,245,249,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    return new THREE.CanvasTexture(c);
  }

  function createRaindropTexture() {
    const c = makeCanvas(256, 128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 110; i++) {
      const x = (i * 47 + 13) % 248 + 4;
      const y = (i * 89 + 7) % 120 + 4;
      const r = 1.5 + (i % 4) * 0.9;
      ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fillRect(x - 0.5, y - r * 0.5, 1, 1);
    }
    return new THREE.CanvasTexture(c);
  }

  global.BDTextures = {
    createHighwayTexture,
    createVillageRoadTexture,
    createCityRoadTexture,
    createHazardStripeTexture,
    createGrassTexture,
    createWaterTexture,
    createAsphaltRoughnessTexture,
    createCloudTexture,
    createRaindropTexture,
    createSignTexture,
    createPlateTexture,
    createDestinationLedTexture,
    createDashboardTexture
  };
})(typeof window !== 'undefined' ? window : globalThis);
