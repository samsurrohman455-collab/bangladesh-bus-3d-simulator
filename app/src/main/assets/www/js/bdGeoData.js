(function (global) {
  'use strict';

  // Reference center: Dhaka (approx. Farmgate / Central Dhaka)
  const ORIGIN_LAT = 23.7800;
  const ORIGIN_LON = 90.4000;
  const METERS_PER_DEG_LAT = 110750;
  const METERS_PER_DEG_LON = 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180); // ~101865m
  const WORLD_SCALE = 0.04; // 40 world units = 1 km (uniform X/Z scale -> zero distortion)
  const UNITS_PER_KM = 1000 * WORLD_SCALE; // 40

  const DATA_SOURCES = [
    {
      name: 'OpenStreetMap Road & Waterway Network',
      license: 'ODbL 1.0 (OpenStreetMap Contributors)',
      scope: 'National highways (N1–N8), regional corridors, major bridges & river topology',
      updated: '2025-Q4',
      status: 'Verified Vector Reference'
    },
    {
      name: 'Bangladesh Administrative Hierarchy (BBS / LGED)',
      license: 'Public Official Reference',
      scope: 'All 8 Divisions, 64 Districts, and key Upazilas / Municipalities',
      updated: '2025-Q3',
      status: 'Verified Coordinates'
    },
    {
      name: 'SRTM / Copernicus Global DEM Profile',
      license: 'Open Public Elevation Data',
      scope: 'Sylhet tea hills, Chattogram Hill Tracts, Madhupur/Lalmai tracts & delta plains',
      updated: '2025-Q1',
      status: 'Regional Elevation Approximation'
    },
    {
      name: 'OSM / Esri Satellite Map Tile Stream',
      license: 'OpenStreetMap ODbL / Esri World Imagery Terms',
      scope: 'Optional online 2D map & ground tile overlay with local procedural fallback',
      updated: 'Live / Cached',
      status: 'Online Optional + Offline Fallback'
    },
    {
      name: '3D Iconic Landmarks & Terminals',
      license: 'Procedural Reference Geometry',
      scope: 'Sadarghat, Kamalapur, Jatiya Sangsad, Padma/Jamuna/Keane Bridges, Chattogram Port',
      updated: '2026-Q1',
      status: 'Visually inspired 3D model from verified reference'
    }
  ];

  function latLonToWorld(lat, lon) {
    const x = (lon - ORIGIN_LON) * METERS_PER_DEG_LON * WORLD_SCALE;
    const z = -(lat - ORIGIN_LAT) * METERS_PER_DEG_LAT * WORLD_SCALE; // +North = -Z in Three.js
    return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
  }

  function worldToLatLon(x, z) {
    const lat = ORIGIN_LAT - z / (METERS_PER_DEG_LAT * WORLD_SCALE);
    const lon = ORIGIN_LON + x / (METERS_PER_DEG_LON * WORLD_SCALE);
    return { lat, lon };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Regional DEM elevation approximation (meters in-game height scale)
  function getElevationAtLatLon(lat, lon) {
    let elev = 0;
    // Chattogram Hill Tracts (Bandarban, Rangamati, Khagrachhari, Cox's hills)
    if (lon > 91.65 && lat < 23.85 && lat > 20.9) {
      const hillCore = Math.max(0, 1 - Math.hypot((lat - 22.25) / 1.4, (lon - 92.25) / 0.58));
      const wave = 0.5 + 0.5 * Math.sin(lat * 48) * Math.cos(lon * 44);
      elev += hillCore * (8 + wave * 18);
    }
    // Sylhet / Moulvibazar / Habiganj tea garden hills
    if (lat > 24.1 && lon > 91.45) {
      const sylCore = Math.max(0, 1 - Math.hypot((lat - 24.65) / 0.68, (lon - 91.95) / 0.55));
      const wave = 0.5 + 0.5 * Math.sin(lat * 52 + lon * 38);
      elev += sylCore * (4 + wave * 11);
    }
    // Lalmai Hills near Cumilla
    const lalmai = Math.max(0, 1 - Math.hypot((lat - 23.43) / 0.14, (lon - 91.13) / 0.1));
    elev += lalmai * 4.5;
    // Madhupur Tract (Tangail / Gazipur / Mymensingh)
    const madhupur = Math.max(0, 1 - Math.hypot((lat - 24.42) / 0.35, (lon - 90.15) / 0.25));
    elev += madhupur * 2.5;
    return Math.round(elev * 100) / 100;
  }

  function getBiomeAtLatLon(lat, lon) {
    if (lon > 91.85 && lat < 21.75) return 'coast_beach';
    if (lat < 21.95 && lon > 89.8 && lon < 90.5) return 'coast_beach';
    if (lat < 22.55 && lon >= 88.95 && lon <= 89.95) return 'mangrove_delta';
    if (lon > 91.55 && lat >= 21.75 && lat <= 23.75) return 'port_hills_ctg';
    if (lat > 24.15 && lon > 91.35) return 'haor_hills_sylhet';
    if (lat >= 23.68 && lat <= 23.88 && lon >= 90.32 && lon <= 90.48) return 'urban_dhaka';
    if (lat > 24.85 && lon < 90.1) return 'plains_north';
    return 'delta_plains';
  }

  const BD_DIVISIONS = [
    { id: 'dhaka', nameEn: 'Dhaka', nameBn: 'ঢাকা বিভাগ', color: '#10b981', centerLat: 23.81, centerLon: 90.41, offlineSizeMb: 4.2 },
    { id: 'chattogram', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম বিভাগ', color: '#f59e0b', centerLat: 22.65, centerLon: 91.75, offlineSizeMb: 4.6 },
    { id: 'rajshahi', nameEn: 'Rajshahi', nameBn: 'রাজশাহী বিভাগ', color: '#38bdf8', centerLat: 24.45, centerLon: 89.10, offlineSizeMb: 3.8 },
    { id: 'khulna', nameEn: 'Khulna', nameBn: 'খুলনা বিভাগ', color: '#a855f7', centerLat: 23.15, centerLon: 89.30, offlineSizeMb: 3.9 },
    { id: 'barishal', nameEn: 'Barishal', nameBn: 'বরিশাল বিভাগ', color: '#06b6d4', centerLat: 22.45, centerLon: 90.35, offlineSizeMb: 2.9 },
    { id: 'sylhet', nameEn: 'Sylhet', nameBn: 'সিলেট বিভাগ', color: '#84cc16', centerLat: 24.75, centerLon: 91.80, offlineSizeMb: 3.1 },
    { id: 'rangpur', nameEn: 'Rangpur', nameBn: 'রংপুর বিভাগ', color: '#f97316', centerLat: 25.80, centerLon: 89.20, offlineSizeMb: 3.5 },
    { id: 'mymensingh', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ বিভাগ', color: '#ec4899', centerLat: 24.85, centerLon: 90.35, offlineSizeMb: 2.7 }
  ];

  // Helper to construct georeferenced place records
  function makeLoc(spec) {
    const { x, z } = latLonToWorld(spec.lat, spec.lon);
    return {
      isDistrict: false,
      isTerminal: false,
      hasMarket: true,
      hasMosque: true,
      hasHospital: !!spec.isDistrict,
      hasSchool: !!spec.isDistrict,
      category: spec.isDistrict ? 'district' : (spec.category || 'landmark'),
      accuracy: spec.accuracy || 'verified',
      biome: getBiomeAtLatLon(spec.lat, spec.lon),
      ticketBase: spec.ticketBase || (spec.isDistrict ? 320 : 220),
      terminalCost: spec.terminalCost || (spec.isDistrict ? 20000 : 16000),
      upazilas: spec.upazilas || [],
      ...spec,
      x,
      z
    };
  }

  // ALL 64 DISTRICTS + REAL DHAKA & REGIONAL LANDMARKS / TERMINALS / PORTS / BEACHES
  const RAW_LOCATIONS = [
    // === DHAKA DIVISION (13 Districts + Dhaka Iconic Terminals & Landmarks) ===
    { id: 'dhaka', nameEn: 'Dhaka', nameBn: 'ঢাকা', division: 'dhaka', lat: 23.7776, lon: 90.4024, isDistrict: true, isTerminal: true, category: 'terminal', landmarkType: 'mohakhali', ticketBase: 180, terminalCost: 22000, upazilas: ['Dhanmondi', 'Gulshan', 'Mirpur', 'Uttara', 'Motijheel', 'Tejgaon', 'Savar', 'Dhamrai', 'Keraniganj'], desc: 'Capital hub near Mohakhali Intercity Terminal' },
    { id: 'sadarghat', nameEn: 'Sadarghat River Port', nameBn: 'সদরঘাট লঞ্চ টার্মিনাল', division: 'dhaka', lat: 23.7056, lon: 90.4097, category: 'landmark', landmarkType: 'sadarghat', ticketBase: 170, upazilas: ['Kotwali', 'Sutrapur'], desc: 'Historic Buriganga river launch terminal (visually inspired 3D model)' },
    { id: 'kamalapur', nameEn: 'Kamalapur Station', nameBn: 'কমলাপুর রেলওয়ে স্টেশন', division: 'dhaka', lat: 23.7317, lon: 90.4263, category: 'landmark', landmarkType: 'kamalapur', ticketBase: 180, upazilas: ['Motijheel', 'Shahjahanpur'], desc: 'Iconic vaulted concrete central railway terminal' },
    { id: 'gabtoli', nameEn: 'Gabtoli Bus Terminal', nameBn: 'গাবতলী বাস টার্মিনাল', division: 'dhaka', lat: 23.7837, lon: 90.3442, isTerminal: true, category: 'terminal', landmarkType: 'terminal_hub', ticketBase: 190, upazilas: ['Mirpur', 'Darus Salam'], desc: 'Western & North Bengal intercity coach gateway' },
    { id: 'sayedabad', nameEn: 'Sayedabad Terminal', nameBn: 'সায়েদাবাদ টার্মিনাল', division: 'dhaka', lat: 23.7155, lon: 90.4310, isTerminal: true, category: 'terminal', landmarkType: 'hanif_flyover', ticketBase: 185, upazilas: ['Jatrabari', 'Mayor Hanif Flyover'], desc: 'Eastern & Chattogram–Sylhet–Padma highway departure hub' },
    { id: 'jatiya_sangsad', nameEn: 'Jatiya Sangsad', nameBn: 'জাতীয় সংসদ ভবন', division: 'dhaka', lat: 23.7623, lon: 90.3786, category: 'landmark', landmarkType: 'sangsad', ticketBase: 180, upazilas: ['Sher-e-Bangla Nagar', 'Dhanmondi'], desc: 'National Parliament complex & Crescent Lake' },
    { id: 'savar', nameEn: 'Savar / Aminbazar', nameBn: 'সাভার', division: 'dhaka', lat: 23.8483, lon: 90.2667, category: 'upazila', upazilas: ['Savar', 'Ashulia', 'Hemayetpur'], desc: 'N5 Industrial & National Martyrs Memorial corridor' },
    { id: 'gazipur', nameEn: 'Gazipur', nameBn: 'গাজীপুর', division: 'dhaka', lat: 23.9999, lon: 90.4203, isDistrict: true, ticketBase: 190, terminalCost: 16000, upazilas: ['Gazipur Sadar', 'Tongi', 'Kaliakair', 'Kapasia', 'Sreepur', 'Kaliganj'], desc: 'N3/N4 junction & industrial hub north of Dhaka' },
    { id: 'narayanganj', nameEn: 'Narayanganj', nameBn: 'নারায়ণগঞ্জ', division: 'dhaka', lat: 23.6238, lon: 90.5000, isDistrict: true, upazilas: ['Narayanganj Sadar', 'Kanchpur', 'Sonargaon', 'Rupganj', 'Bandar', 'Araihazar'], desc: 'Shitalakshya river port & Kanchpur N1/N2 junction' },
    { id: 'narsingdi', nameEn: 'Narsingdi', nameBn: 'নরসিংদী', division: 'dhaka', lat: 23.9229, lon: 90.7177, isDistrict: true, upazilas: ['Narsingdi Sadar', 'Madhabdi', 'Palash', 'Raipura', 'Shibpur', 'Belabo'], desc: 'Textile hub on the N2 Dhaka–Sylhet Highway' },
    { id: 'munshiganj', nameEn: 'Munshiganj (Mawa)', nameBn: 'মুন্সিগঞ্জ (মাওয়া)', division: 'dhaka', lat: 23.5422, lon: 90.5305, isDistrict: true, upazilas: ['Munshiganj Sadar', 'Sreenagar', 'Lohajang (Mawa)', 'Sirajdikhan', 'Gazaria', 'Tongibari'], desc: 'Padma Bridge northern bank & Mawa Expressway zone' },
    { id: 'mawa_ghat', nameEn: 'Mawa Padma Plaza', nameBn: 'মাওয়া পদ্মা সেতু', division: 'dhaka', lat: 23.4705, lon: 90.2855, category: 'landmark', landmarkType: 'padma_north', upazilas: ['Lohajang', 'Padma North Toll'], desc: 'Padma Multipurpose Bridge northern toll plaza' },
    { id: 'manikganj', nameEn: 'Manikganj', nameBn: 'মানিকগঞ্জ', division: 'dhaka', lat: 23.8617, lon: 90.0003, isDistrict: true, upazilas: ['Manikganj Sadar', 'Shibalaya (Paturia)', 'Ghior', 'Singair', 'Saturia'], desc: 'N5 highway hub leading to Paturia Ferry Ghat' },
    { id: 'tangail', nameEn: 'Tangail', nameBn: 'টাঙ্গাইল', division: 'dhaka', lat: 24.2513, lon: 89.9167, isDistrict: true, ticketBase: 250, terminalCost: 17000, upazilas: ['Tangail Sadar', 'Mirzapur', 'Madhupur', 'Elenga', 'Kalihati', 'Sakhipur'], desc: 'N4/N5 Jamuna Bridge approach corridor & Madhupur forest' },
    { id: 'kishoreganj', nameEn: 'Kishoreganj', nameBn: 'কিশোরগঞ্জ', division: 'dhaka', lat: 24.4449, lon: 90.7766, isDistrict: true, upazilas: ['Kishoreganj Sadar', 'Bhairab', 'Bajitpur', 'Kuliarchar', 'Nikli Haor', 'Itna'], desc: 'Haor gateway & Bhairab Meghna bridge corridor' },
    { id: 'bhairab', nameEn: 'Bhairab Bazar', nameBn: 'ভৈরব বাজার', division: 'dhaka', lat: 24.0524, lon: 90.9764, category: 'market', upazilas: ['Bhairab', 'Ashuganj Bridge'], desc: 'Major Meghna river port & N2 eastern trade market' },
    { id: 'faridpur', nameEn: 'Faridpur', nameBn: 'ফরিদপুর', division: 'dhaka', lat: 23.6071, lon: 89.8429, isDistrict: true, upazilas: ['Faridpur Sadar', 'Bhanga', 'Boalmari', 'Sadarpur', 'Nagarkanda'], desc: 'N7/N8 Bhanga Expressway southern transit hub' },
    { id: 'gopalganj', nameEn: 'Gopalganj', nameBn: 'গোপালগঞ্জ', division: 'dhaka', lat: 23.0051, lon: 89.8266, isDistrict: true, upazilas: ['Gopalganj Sadar', 'Tungipara', 'Kotalipara', 'Kashiani', 'Muksudpur'], desc: 'Southern highway hub linking Padma Bridge to Khulna' },
    { id: 'madaripur', nameEn: 'Madaripur', nameBn: 'মাদারীপুর', division: 'dhaka', lat: 23.1641, lon: 90.1897, isDistrict: true, upazilas: ['Madaripur Sadar', 'Shibchar', 'Rajoir', 'Kalkini'], desc: 'Padma southern bank & N8 Barishal highway corridor' },
    { id: 'rajbari', nameEn: 'Rajbari (Daulatdia)', nameBn: 'রাজবাড়ী', division: 'dhaka', lat: 23.7574, lon: 89.6445, isDistrict: true, upazilas: ['Rajbari Sadar', 'Goalanda (Daulatdia)', 'Pangsha', 'Baliakandi'], desc: 'Daulatdia Ferry Ghat & Padma south rail-road hub' },
    { id: 'shariatpur', nameEn: 'Shariatpur', nameBn: 'শরীয়তপুর', division: 'dhaka', lat: 23.2423, lon: 90.4348, isDistrict: true, upazilas: ['Shariatpur Sadar', 'Zajira', 'Naria', 'Bhedarganj', 'Damudya'], desc: 'Zajira Padma Bridge southern landing & Meghna delta' },

    // === CHATTOGRAM DIVISION (11 Districts + Port, Marine Drive, Teknaf) ===
    { id: 'chittagong', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম', division: 'chattogram', lat: 22.3569, lon: 91.7832, isDistrict: true, isTerminal: true, category: 'terminal', landmarkType: 'ctg_port', ticketBase: 550, terminalCost: 28000, upazilas: ['Dampara', 'GEC', 'Agrabad', 'Pahartali', 'Patenga', 'Sitakunda', 'Patiya', 'Mirsharai'], desc: 'Port city, Dampara Bus Terminal & Karnaphuli gateway' },
    { id: 'ctg_port', nameEn: 'Chattogram Port', nameBn: 'চট্টগ্রাম বন্দর', division: 'chattogram', lat: 22.3090, lon: 91.7975, category: 'landmark', landmarkType: 'ctg_port', upazilas: ['Bandar', 'Halishahar', 'Patenga'], desc: 'Main maritime seaport with container cranes (visually inspired 3D model)' },
    { id: 'coxsbazar', nameEn: "Cox's Bazar", nameBn: 'কক্সবাজার', division: 'chattogram', lat: 21.4272, lon: 92.0058, isDistrict: true, isTerminal: true, category: 'terminal', landmarkType: 'beach', ticketBase: 720, terminalCost: 34000, upazilas: ["Cox's Bazar Sadar", 'Laboni Beach', 'Kolatoli', 'Ramu', 'Chakaria', 'Ukhiya', 'Teknaf'], desc: "World's longest natural sea beach & Marine Drive start" },
    { id: 'teknaf', nameEn: 'Marine Drive (Teknaf)', nameBn: 'মেরিন ড্রাইভ টেকনাফ', division: 'chattogram', lat: 20.8640, lon: 92.2980, category: 'landmark', landmarkType: 'beach', upazilas: ['Inani', 'Himchari', 'Teknaf'], desc: 'Scenic Bay of Bengal Marine Drive southern terminus' },
    { id: 'cumilla', nameEn: 'Cumilla', nameBn: 'কুমিল্লা', division: 'chattogram', lat: 23.4607, lon: 91.1809, isDistrict: true, ticketBase: 280, terminalCost: 17500, upazilas: ['Cumilla Sadar', 'Daudkandi', 'Chauddagram', 'Lalmai', 'Laksam', 'Muradnagar'], desc: 'Major N1 highway city beside Lalmai hills' },
    { id: 'brahmanbaria', nameEn: 'Brahmanbaria', nameBn: 'ব্রাহ্মণবাড়িয়া', division: 'chattogram', lat: 23.9571, lon: 91.1119, isDistrict: true, upazilas: ['Brahmanbaria Sadar', 'Ashuganj', 'Sarail', 'Kasba', 'Nabinagar'], desc: 'N2 highway town near Titas river & Ashuganj bridge' },
    { id: 'chandpur', nameEn: 'Chandpur', nameBn: 'চাঁদপুর', division: 'chattogram', lat: 23.2333, lon: 90.6713, isDistrict: true, upazilas: ['Chandpur Sadar', 'Hajiganj', 'Matlab', 'Faridganj', 'Shahrasti'], desc: 'Padma–Meghna confluence river port & hilsa hub' },
    { id: 'feni', nameEn: 'Feni', nameBn: 'ফেনী', division: 'chattogram', lat: 23.0159, lon: 91.3976, isDistrict: true, upazilas: ['Feni Sadar', 'Mohipal Flyover', 'Daganbhuiyan', 'Chhagalnaiya', 'Sonagazi'], desc: 'Key N1 Mohipal Flyover highway junction' },
    { id: 'lakshmipur', nameEn: 'Lakshmipur', nameBn: 'লক্ষ্মীপুর', division: 'chattogram', lat: 22.9447, lon: 90.8282, isDistrict: true, upazilas: ['Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati', 'Kamalnagar'], desc: 'Meghna lower estuary coastal & ferry corridor' },
    { id: 'noakhali', nameEn: 'Noakhali (Maijdee)', nameBn: 'নোয়াখালী', division: 'chattogram', lat: 22.8696, lon: 91.0994, isDistrict: true, upazilas: ['Noakhali Sadar', 'Begumganj (Chowmuhani)', 'Companiganj', 'Subarnachar', 'Hatiya'], desc: 'Chowmuhani–Maijdee coastal trade hub' },
    { id: 'khagrachhari', nameEn: 'Khagrachhari', nameBn: 'খাগড়াছড়ি', division: 'chattogram', lat: 23.1193, lon: 91.9847, isDistrict: true, upazilas: ['Khagrachhari Sadar', 'Dighinala', 'Sajek Road', 'Matiranga', 'Ramgarh'], desc: 'Hill tracts winding scenic mountain valley highway' },
    { id: 'rangamati', nameEn: 'Rangamati', nameBn: 'রাঙ্গামাটি', division: 'chattogram', lat: 22.6533, lon: 92.1789, isDistrict: true, upazilas: ['Rangamati Sadar', 'Kaptai', 'Kawkhali', 'Naniarchar', 'Baghaichhari'], desc: 'Kaptai Lake hills & Chittagong Hill Tracts capital' },
    { id: 'bandarban', nameEn: 'Bandarban', nameBn: 'বান্দরবান', division: 'chattogram', lat: 22.1953, lon: 92.2184, isDistrict: true, upazilas: ['Bandarban Sadar', 'Chimbuk', 'Thanchi', 'Lama', 'Ruma'], desc: 'Highest hill road region of Bangladesh' },

    // === RAJSHAHI DIVISION (8 Districts) ===
    { id: 'rajshahi', nameEn: 'Rajshahi', nameBn: 'রাজশাহী', division: 'rajshahi', lat: 24.3745, lon: 88.6042, isDistrict: true, isTerminal: true, category: 'terminal', ticketBase: 480, terminalCost: 24000, upazilas: ['Boalia', 'Motihar', 'Paba', 'Godagari', 'Bagha', 'Charghat'], desc: 'Padma north bank Silk City & N6 western terminus' },
    { id: 'bogura', nameEn: 'Bogura', nameBn: 'বগুড়া', division: 'rajshahi', lat: 24.8465, lon: 89.3773, isDistrict: true, isTerminal: true, ticketBase: 380, terminalCost: 18500, upazilas: ['Bogura Sadar', 'Sherpur', 'Shibganj (Mahasthangarh)', 'Sariakandi', 'Adamdighi'], desc: 'North Bengal central highway hub on N5' },
    { id: 'sirajganj', nameEn: 'Sirajganj', nameBn: 'সিরাজগঞ্জ', division: 'rajshahi', lat: 24.4534, lon: 89.7007, isDistrict: true, upazilas: ['Sirajganj Sadar', 'Hatikumrul', 'Ullapara', 'Shahjadpur', 'Belkuchi'], desc: 'Bangabandhu Jamuna Bridge western landing & Hatikumrul' },
    { id: 'pabna', nameEn: 'Pabna', nameBn: 'পাবনা', division: 'rajshahi', lat: 24.0064, lon: 89.2372, isDistrict: true, upazilas: ['Pabna Sadar', 'Ishwardi (Hardinge Bridge)', 'Santhia', 'Bera', 'Sujanagar'], desc: 'Hardinge & Lalon Shah Bridge Padma north gateway' },
    { id: 'natore', nameEn: 'Natore', nameBn: 'নাটোর', division: 'rajshahi', lat: 24.4206, lon: 89.0003, isDistrict: true, upazilas: ['Natore Sadar', 'Baraigram (Bonpara)', 'Singra', 'Lalpur'], desc: 'Bonpara–N6 highway crossroads between Jamuna & Rajshahi' },
    { id: 'chapainawabganj', nameEn: 'Chapainawabganj', nameBn: 'চাঁপাইনবাবগঞ্জ', division: 'rajshahi', lat: 24.5965, lon: 88.2775, isDistrict: true, upazilas: ['Chapainawabganj Sadar', 'Shibganj (Sonamasjid)', 'Gomastapur', 'Nachole'], desc: 'Mango capital on Bangladesh westernmost Padma/Mahananda border' },
    { id: 'naogaon', nameEn: 'Naogaon', nameBn: 'নওগাঁ', division: 'rajshahi', lat: 24.7936, lon: 88.9318, isDistrict: true, upazilas: ['Naogaon Sadar', 'Badalgachhi (Paharpur)', 'Manda', 'Mohadevpur', 'Patnitala'], desc: 'Barind tract rice belt & Paharpur heritage district' },
    { id: 'joypurhat', nameEn: 'Joypurhat', nameBn: 'জয়পুরহাট', division: 'rajshahi', lat: 25.0968, lon: 89.0227, isDistrict: true, upazilas: ['Joypurhat Sadar', 'Panchbibi', 'Kalai', 'Akkelpur'], desc: 'Northern Barind rail and regional highway hub' },

    // === KHULNA DIVISION (10 Districts) ===
    { id: 'khulna', nameEn: 'Khulna', nameBn: 'খুলনা', division: 'khulna', lat: 22.8456, lon: 89.5403, isDistrict: true, isTerminal: true, category: 'terminal', ticketBase: 460, terminalCost: 23000, upazilas: ['Sonadanga Terminal', 'Khalishpur', 'Rupsha', 'Dumuria', 'Phultala'], desc: 'Sonadanga Terminal, Rupsha Bridge & Sundarbans gateway' },
    { id: 'bagerhat', nameEn: 'Bagerhat (Mongla)', nameBn: 'বাগেরহাট (সুন্দরবন)', division: 'khulna', lat: 22.6516, lon: 89.7859, isDistrict: true, upazilas: ['Bagerhat Sadar', 'Mongla Port', 'Rampal', 'Fakirhat', 'Sharankhola'], desc: 'Shat Gombuj historic city & Sundarbans mangrove corridor' },
    { id: 'jashore', nameEn: 'Jashore', nameBn: 'যশোর', division: 'khulna', lat: 23.1634, lon: 89.2182, isDistrict: true, upazilas: ['Jashore Sadar', 'Benapole', 'Noapara', 'Jhikargachha', 'Keshabpur'], desc: 'N7 regional hub & Benapole western border highway' },
    { id: 'satkhira', nameEn: 'Satkhira', nameBn: 'সাতক্ষীরা', division: 'khulna', lat: 22.7185, lon: 89.0705, isDistrict: true, upazilas: ['Satkhira Sadar', 'Shyamnagar (Sundarbans)', 'Tala', 'Kaliganj', 'Debhata'], desc: 'Western Sundarbans mangrove coast & coastal highway' },
    { id: 'kushtia', nameEn: 'Kushtia', nameBn: 'কুষ্টিয়া', division: 'khulna', lat: 23.9013, lon: 89.1205, isDistrict: true, upazilas: ['Kushtia Sadar', 'Bheramara', 'Kumarkhali', 'Daulatpur'], desc: 'Lalon Shah Bridge southern gateway & cultural city' },
    { id: 'jhenaidah', nameEn: 'Jhenaidah', nameBn: 'ঝিনাইদহ', division: 'khulna', lat: 23.5450, lon: 89.1726, isDistrict: true, upazilas: ['Jhenaidah Sadar', 'Kaliganj', 'Shailkupa', 'Kotchandpur'], desc: 'N7 highway crossroads connecting Kushtia, Magura & Jashore' },
    { id: 'magura', nameEn: 'Magura', nameBn: 'মাগুরা', division: 'khulna', lat: 23.4873, lon: 89.4199, isDistrict: true, upazilas: ['Magura Sadar', 'Sreepur', 'Shalikha', 'Mohammadpur'], desc: 'Madhumati river bridge & N7 express corridor' },
    { id: 'narail', nameEn: 'Narail', nameBn: 'নড়াইল', division: 'khulna', lat: 23.1725, lon: 89.5127, isDistrict: true, upazilas: ['Narail Sadar', 'Lohagara (Kalna Bridge)', 'Kalia'], desc: 'Kalna Madhumati Bridge fast highway to Padma Bridge' },
    { id: 'chuadanga', nameEn: 'Chuadanga', nameBn: 'চুয়াডাঙ্গা', division: 'khulna', lat: 23.6402, lon: 88.8418, isDistrict: true, upazilas: ['Chuadanga Sadar', 'Alamdanga', 'Darshana', 'Jibannagar'], desc: 'Western border rail & regional coach station' },
    { id: 'meherpur', nameEn: 'Meherpur', nameBn: 'মেহেরপুর', division: 'khulna', lat: 23.7622, lon: 88.6318, isDistrict: true, upazilas: ['Meherpur Sadar', 'Mujibnagar', 'Gangni'], desc: 'Historic western borderland of Bangladesh' },

    // === BARISHAL DIVISION (6 Districts + Kuakata Beach) ===
    { id: 'barishal', nameEn: 'Barishal', nameBn: 'বরিশাল', division: 'barishal', lat: 22.7010, lon: 90.3535, isDistrict: true, isTerminal: true, category: 'terminal', ticketBase: 420, terminalCost: 21000, upazilas: ['Nathullabad Terminal', 'Rupatoli', 'Bakerganj', 'Banaripara', 'Gournadi'], desc: 'Kirtonkhola river port & N8 Padma–Kuakata southern hub' },
    { id: 'patuakhali', nameEn: 'Patuakhali', nameBn: 'পটুয়াখালী', division: 'barishal', lat: 22.3596, lon: 90.3299, isDistrict: true, upazilas: ['Patuakhali Sadar', 'Kalapara', 'Payra Port', 'Galachipa', 'Bauphal'], desc: 'Payra bridge N8 corridor toward Kuakata sea beach' },
    { id: 'kuakata', nameEn: 'Kuakata Sea Beach', nameBn: 'কুয়াকাটা সমুদ্র সৈকত', division: 'barishal', lat: 21.8167, lon: 90.1190, category: 'landmark', landmarkType: 'beach', ticketBase: 580, upazilas: ['Kalapara', 'Latachapli'], desc: 'Sagar Kannya sunrise & sunset Bay of Bengal beach' },
    { id: 'bhola', nameEn: 'Bhola', nameBn: 'ভোলা', division: 'barishal', lat: 22.6859, lon: 90.6482, isDistrict: true, upazilas: ['Bhola Sadar', 'Ilisha Ferry', 'Lalmohan', 'Char Fasson'], desc: 'Largest island district connected via river ferry' },
    { id: 'barguna', nameEn: 'Barguna', nameBn: 'বরগুনা', division: 'barishal', lat: 22.1508, lon: 90.1264, isDistrict: true, upazilas: ['Barguna Sadar', 'Amtali', 'Patharghata', 'Betagi'], desc: 'Coastal delta district west of Kuakata' },
    { id: 'pirojpur', nameEn: 'Pirojpur', nameBn: 'পিরোজপুর', division: 'barishal', lat: 22.5841, lon: 89.9720, isDistrict: true, upazilas: ['Pirojpur Sadar', 'Bekutia Bridge', 'Mathbaria', 'Nesarabad'], desc: 'Bekutia Kocha river bridge corridor linking Barishal & Khulna' },
    { id: 'jhalokati', nameEn: 'Jhalokati', nameBn: 'ঝালকাঠি', division: 'barishal', lat: 22.6406, lon: 90.1987, isDistrict: true, upazilas: ['Jhalokati Sadar', 'Nalchity', 'Rajapur', 'Kathalia'], desc: 'Sugandha river & floating guava canal district' },

    // === SYLHET DIVISION (4 Districts + Keane Bridge & Tea Gardens) ===
    { id: 'sylhet', nameEn: 'Sylhet', nameBn: 'সিলেট', division: 'sylhet', lat: 24.8949, lon: 91.8687, isDistrict: true, isTerminal: true, category: 'terminal', landmarkType: 'keane_bridge', ticketBase: 520, terminalCost: 26000, upazilas: ['Kadamtali Terminal', 'Keane Bridge', 'Jaflong', 'Beanibazar', 'Golapganj'], desc: 'Surma River Keane Bridge, Kadamtali Terminal & tea hills' },
    { id: 'sylhet_tea', nameEn: 'Lakkatura Tea Gardens', nameBn: 'লাক্কাতুরা চা বাগান', division: 'sylhet', lat: 24.9280, lon: 91.8740, category: 'landmark', landmarkType: 'tea_garden', upazilas: ['Sylhet Airport Rd', 'Malnichhara'], desc: 'Terraced green tea estates in northern Sylhet' },
    { id: 'moulvibazar', nameEn: 'Moulvibazar', nameBn: 'মৌলভীবাজার', division: 'sylhet', lat: 24.4829, lon: 91.7774, isDistrict: true, landmarkType: 'tea_garden', upazilas: ['Moulvibazar Sadar', 'Sreemangal', 'Kamalganj (Lawachara)', 'Kulaura'], desc: 'Tea capital of Bangladesh & Lawachara green hills' },
    { id: 'habiganj', nameEn: 'Habiganj', nameBn: 'হবিগঞ্জ', division: 'sylhet', lat: 24.3749, lon: 91.4155, isDistrict: true, upazilas: ['Habiganj Sadar', 'Shaistaganj', 'Madhabpur', 'Bahubal', 'Chunarughat'], desc: 'Shaistaganj N2 highway interchange & haor edge' },
    { id: 'sunamganj', nameEn: 'Sunamganj', nameBn: 'সুনামগঞ্জ', division: 'sylhet', lat: 25.0658, lon: 91.3950, isDistrict: true, upazilas: ['Sunamganj Sadar', 'Tahirpur (Tanguar Haor)', 'Chhatak', 'Jagannathpur'], desc: 'Haor wetland plains at the foothills of Meghalaya' },

    // === RANGPUR DIVISION (8 Districts) ===
    { id: 'rangpur', nameEn: 'Rangpur', nameBn: 'রংপুর', division: 'rangpur', lat: 25.7439, lon: 89.2752, isDistrict: true, isTerminal: true, category: 'terminal', ticketBase: 560, terminalCost: 25000, upazilas: ['Kamarkhali/Modern Mor', 'Mithapukur', 'Pirganj', 'Badarganj', 'Kaunia'], desc: 'Northern metropolis along N5 & Teesta river basin' },
    { id: 'dinajpur', nameEn: 'Dinajpur', nameBn: 'দিনাজপুর', division: 'rangpur', lat: 25.6217, lon: 88.6354, isDistrict: true, upazilas: ['Dinajpur Sadar', 'Birampur', 'Parbatipur', 'Kaharole (Kantajew)', 'Birganj'], desc: 'Northwestern grain belt & Kantajew cultural heritage district' },
    { id: 'gaibandha', nameEn: 'Gaibandha', nameBn: 'গাইবান্ধা', division: 'rangpur', lat: 25.3288, lon: 89.5281, isDistrict: true, upazilas: ['Gaibandha Sadar', 'Gobindaganj', 'Palashbari', 'Sundarganj'], desc: 'Gobindaganj–Palashbari N5 corridor beside Jamuna/Brahmaputra' },
    { id: 'kurigram', nameEn: 'Kurigram', nameBn: 'কুড়িগ্রাম', division: 'rangpur', lat: 25.8054, lon: 89.6362, isDistrict: true, upazilas: ['Kurigram Sadar', 'Chilmari', 'Ulipur', 'Nageshwari', 'Bhurungamari'], desc: 'Dharla & Brahmaputra river basin northeast of Rangpur' },
    { id: 'lalmonirhat', nameEn: 'Lalmonirhat', nameBn: 'লালমনিরহাট', division: 'rangpur', lat: 25.9165, lon: 89.4532, isDistrict: true, upazilas: ['Lalmonirhat Sadar', 'Teesta Barrage', 'Patgram (Burimari)', 'Hatibandha'], desc: 'Teesta river highway corridor & northern rail hub' },
    { id: 'nilphamari', nameEn: 'Nilphamari (Saidpur)', nameBn: 'নীলফামারী', division: 'rangpur', lat: 25.9318, lon: 88.8560, isDistrict: true, upazilas: ['Nilphamari Sadar', 'Saidpur', 'Jaldhaka', 'Domar'], desc: 'Saidpur rail-road hub & Teesta irrigation plains' },
    { id: 'panchagarh', nameEn: 'Panchagarh (Tetulia)', nameBn: 'পঞ্চগড় (তেঁতুলিয়া)', division: 'rangpur', lat: 26.3411, lon: 88.5542, isDistrict: true, isTerminal: true, category: 'terminal', ticketBase: 680, terminalCost: 26000, upazilas: ['Panchagarh Sadar', 'Tetulia (Banglabandha)', 'Boda', 'Debiganj'], desc: 'Northernmost N5 highway terminal near Korotoa river & Himalayan foothills' },
    { id: 'thakurgaon', nameEn: 'Thakurgaon', nameBn: 'ঠাকুরগাঁও', division: 'rangpur', lat: 26.0337, lon: 88.4617, isDistrict: true, upazilas: ['Thakurgaon Sadar', 'Pirganj', 'Ranisankail', 'Baliadangi'], desc: 'Northwestern N5 corridor toward Panchagarh & Tetulia' },

    // === N5 PANCHAGARH–DHAKA HIGHWAY INTERSECTIONS (মোড়) & MAJOR BAZAARS (বাজার) ===
    { id: 'boda_bazar', nameEn: 'Boda Bazar & Mor', nameBn: 'বোদা বাজার ও মোড়', division: 'rangpur', lat: 26.2080, lon: 88.5580, category: 'market', ticketBase: 640, upazilas: ['Boda', 'Debiganj', 'Marea'], desc: 'Busy N5 Panchagarh–Debiganj highway crossroads & haat bazar' },
    { id: 'saidpur_mor', nameEn: 'Dashmail & Saidpur Mor', nameBn: 'দশমাইল ও সৈয়দপুর মোড়', division: 'rangpur', lat: 25.7920, lon: 88.8880, category: 'junction', ticketBase: 580, upazilas: ['Saidpur', 'Dashmail', 'Taraganj'], desc: 'Major Dinajpur–Nilphamari–Rangpur N5 three-way highway intersection' },
    { id: 'gobindaganj_bazar', nameEn: 'Gobindaganj Bazar', nameBn: 'গোবিন্দগঞ্জ বাজার ও সেতু', division: 'rangpur', lat: 25.1340, lon: 89.3890, category: 'market', ticketBase: 440, upazilas: ['Gobindaganj', 'Karatoya Bridge'], desc: 'N5 highway market hub beside Karatoya River bridge' },
    { id: 'hatikumrul_mor', nameEn: 'Hatikumrul Golchottor', nameBn: 'হাটিকুমরুল গোলচত্বর মোড়', division: 'rajshahi', lat: 24.4260, lon: 89.5120, category: 'junction', ticketBase: 360, upazilas: ['Ullapara', 'Salanga', 'Nalka'], desc: 'Iconic N5/N6 North Bengal highway roundabout linking Bogura, Rajshahi & Jamuna Bridge' },
    { id: 'elenga_mor', nameEn: 'Elenga Mor', nameBn: 'এলেঙ্গা মোড়', division: 'dhaka', lat: 24.3370, lon: 89.9190, category: 'junction', ticketBase: 280, upazilas: ['Kalihati', 'Jamuna East Approach'], desc: 'Jamuna Bridge eastern approach bus stand & Tangail highway junction' },
    { id: 'chandra_mor', nameEn: 'Chandra Tri-Mor', nameBn: 'চন্দ্রা ত্রি-মোড়', division: 'dhaka', lat: 24.0410, lon: 90.2330, category: 'junction', ticketBase: 210, upazilas: ['Kaliakair', 'Nabinagar', 'Konabari'], desc: 'N4/N5 industrial tri-junction connecting Tangail, Gazipur & Savar–Gabtoli' },

    // === MYMENSINGH DIVISION (4 Districts + Station & Brahmaputra Waterfront) ===
    { id: 'mymensingh', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ', division: 'mymensingh', lat: 24.7471, lon: 90.4203, isDistrict: true, isTerminal: true, category: 'terminal', landmarkType: 'mymensingh_station', ticketBase: 320, terminalCost: 19000, upazilas: ['Maskanda Terminal', 'Mymensingh Junction', 'Trishal', 'Bhaluka', 'Muktagachha'], desc: 'Old Brahmaputra riverfront, historic railway station & Shashi Lodge zone' },
    { id: 'jamalpur', nameEn: 'Jamalpur', nameBn: 'জামালপুর', division: 'mymensingh', lat: 24.9375, lon: 89.9378, isDistrict: true, upazilas: ['Jamalpur Sadar', 'Sarishabari', 'Dewanganj', 'Islampur', 'Melandaha'], desc: 'Jamuna-Brahmaputra plain & N4 northwestern corridor' },
    { id: 'netrokona', nameEn: 'Netrokona', nameBn: 'নেত্রকোণা', division: 'mymensingh', lat: 24.8709, lon: 90.7279, isDistrict: true, upazilas: ['Netrokona Sadar', 'Durgapur (Birishiri)', 'Kalmakanda', 'Kendua', 'Mohanganj'], desc: 'Birishiri hills & Kangsha haor gateway' },
    { id: 'sherpur', nameEn: 'Sherpur', nameBn: 'শেরপুর', division: 'mymensingh', lat: 25.0205, lon: 90.0153, isDistrict: true, upazilas: ['Sherpur Sadar', 'Nalitabari', 'Jhenaigati (Gazni)', 'Sreebardi'], desc: 'Garo Hills borderland north of Brahmaputra' }
  ];

  const BANGLADESH_LOCATIONS = {};
  RAW_LOCATIONS.forEach((spec) => {
    BANGLADESH_LOCATIONS[spec.id] = makeLoc(spec);
  });

  // Real highway edge builder with optional intermediate geographic (lat, lon) control points
  function edgeSpec(id, from, to, opts) {
    const o = opts || {};
    const waypointsWorld = Array.isArray(o.viaLatLon)
      ? o.viaLatLon.map(([lat, lon]) => latLonToWorld(lat, lon))
      : [];
    return {
      id,
      from,
      to,
      type: o.type || 'highway',
      highwayCode: o.highwayCode || '',
      speedLimit: o.speedLimit || (o.type === 'village' ? 55 : 80),
      name: o.name || `${BANGLADESH_LOCATIONS[from].nameEn}–${BANGLADESH_LOCATIONS[to].nameEn} Road`,
      bridge: o.bridge || null,
      bridgeLatLon: o.bridgeLatLon || null,
      ferry: !!o.ferry,
      toll: o.toll || 0,
      doubleToll: !!o.doubleToll,
      waypoints: waypointsWorld
    };
  }

  // Connected real national (N1–N8) & regional highway network connecting ALL 64 districts & landmarks
  const ROAD_NETWORK_EDGES = [
    // Dhaka Metro & Radial Hub Connections
    edgeSpec('dhaka_kamalapur', 'dhaka', 'kamalapur', { type: 'city', highwayCode: 'Dhaka', speedLimit: 50, name: 'Tejgaon–Kamalapur City Corridor', viaLatLon: [[23.753, 90.408]] }),
    edgeSpec('kamalapur_sayedabad', 'kamalapur', 'sayedabad', { type: 'city', highwayCode: 'Dhaka', speedLimit: 50, name: 'Motijheel–Sayedabad Link' }),
    edgeSpec('sayedabad_sadarghat', 'sayedabad', 'sadarghat', { type: 'city', highwayCode: 'Dhaka', speedLimit: 45, name: 'Dholai Khal–Sadarghat Old Dhaka Rd', viaLatLon: [[23.711, 90.418]] }),
    edgeSpec('dhaka_sangsad', 'dhaka', 'jatiya_sangsad', { type: 'city', highwayCode: 'Dhaka', speedLimit: 50, name: 'Bijoy Sarani–Parliament Ave' }),
    edgeSpec('sangsad_gabtoli', 'jatiya_sangsad', 'gabtoli', { type: 'city', highwayCode: 'Dhaka', speedLimit: 55, name: 'Mirpur Road–Technical–Gabtoli', viaLatLon: [[23.777, 90.362]] }),

    // N3: Dhaka -> Gazipur -> Mymensingh -> Netrokona / Sherpur
    edgeSpec('dhaka_gazipur', 'dhaka', 'gazipur', { highwayCode: 'N3', speedLimit: 80, name: 'N3 Dhaka–Mymensingh Elevated Express', viaLatLon: [[23.851, 90.409], [23.918, 90.404]] }),
    edgeSpec('gazipur_mymensingh', 'gazipur', 'mymensingh', { highwayCode: 'N3', speedLimit: 85, name: 'N3 Maona–Bhaluka–Trishal Highway', viaLatLon: [[24.22, 90.41], [24.48, 90.40], [24.60, 90.39]] }),
    edgeSpec('mymensingh_netrokona', 'mymensingh', 'netrokona', { highwayCode: 'R370', type: 'regional', speedLimit: 65, name: 'Mymensingh–Shambhuganj–Netrokona Rd', viaLatLon: [[24.79, 90.56]] }),
    edgeSpec('mymensingh_sherpur', 'mymensingh', 'sherpur', { highwayCode: 'R371', type: 'regional', speedLimit: 65, name: 'Mymensingh–Phulpur–Sherpur Highway', viaLatLon: [[24.91, 90.24]] }),
    edgeSpec('mymensingh_jamalpur', 'mymensingh', 'jamalpur', { highwayCode: 'R460', type: 'regional', speedLimit: 65, name: 'Mymensingh–Muktagachha–Jamalpur Rd', viaLatLon: [[24.81, 90.18]] }),
    edgeSpec('sherpur_jamalpur', 'sherpur', 'jamalpur', { highwayCode: 'R460', type: 'village', speedLimit: 55, name: 'Old Brahmaputra Sherpur–Jamalpur Link' }),

    // N4: Gazipur -> Chandra Mor -> Tangail -> Elenga Mor -> Jamalpur + Village Madhupur link
    edgeSpec('gazipur_chandra', 'gazipur', 'chandra_mor', { highwayCode: 'N4', speedLimit: 80, name: 'N4 Gazipur–Konabari–Chandra Tri-Mor', viaLatLon: [[24.02, 90.32]] }),
    edgeSpec('chandra_tangail', 'chandra_mor', 'tangail', { highwayCode: 'N4', speedLimit: 85, bridge: 'বংশী মির্জাপুর সেতু (Bangshi River Bridge)', bridgeLatLon: [24.11, 90.10], toll: 50, name: 'N4 Chandra–Mirzapur–Tangail Highway', viaLatLon: [[24.11, 90.10], [24.18, 90.00]] }),
    edgeSpec('chandra_savar', 'chandra_mor', 'savar', { highwayCode: 'N501', speedLimit: 80, bridge: 'নবীনগর বংশী সেতু (Nabinagar Bangshi Bridge)', bridgeLatLon: [23.92, 90.26], toll: 50, name: 'Chandra–EPZ–Nabinagar–Savar Highway', viaLatLon: [[23.95, 90.26], [23.90, 90.26]] }),
    edgeSpec('tangail_mymensingh', 'tangail', 'mymensingh', { highwayCode: 'N4', type: 'village', speedLimit: 60, name: 'Madhupur Shal Forest Corridor', viaLatLon: [[24.60, 90.03]] }),
    edgeSpec('tangail_jamalpur', 'tangail', 'jamalpur', { highwayCode: 'N4', speedLimit: 70, name: 'N4 Madhupur–Dhanbari–Jamalpur Highway', viaLatLon: [[24.64, 89.99]] }),

    // N5 (West & North): Gabtoli -> Savar -> Chandra -> Tangail -> Elenga Mor -> Jamuna Bridge -> Sirajganj -> Hatikumrul Mor -> Bogura -> Gobindaganj -> Gaibandha -> Rangpur -> Saidpur Mor -> Nilphamari -> Boda Bazar -> Panchagarh
    edgeSpec('gabtoli_savar', 'gabtoli', 'savar', { highwayCode: 'N5', speedLimit: 75, bridge: 'আমিনবাজার তুরাগ সেতু (Aminbazar Turag Bridge)', bridgeLatLon: [23.796, 90.318], toll: 60, name: 'N5 Gabtoli–Aminbazar Bridge–Savar', viaLatLon: [[23.796, 90.318], [23.82, 90.29]] }),
    edgeSpec('savar_gazipur', 'savar', 'gazipur', { highwayCode: 'N302', type: 'regional', speedLimit: 70, bridge: 'আশুলিয়া তুরাগ সেতু (Ashulia Turag Bridge)', bridgeLatLon: [23.90, 90.34], toll: 40, name: 'Ashulia–Tongi–Gazipur Bypass' }),
    edgeSpec('savar_manikganj', 'savar', 'manikganj', { highwayCode: 'N5', speedLimit: 80, bridge: 'ধলেশ্বরী-নয়ারহাট সেতু (Nayarhat Dhaleshwari Bridge)', bridgeLatLon: [23.90, 90.16], toll: 50, name: 'N5 Dhamrai–Manikganj Aricha Road', viaLatLon: [[23.89, 90.14]] }),
    edgeSpec('manikganj_rajbari', 'manikganj', 'rajbari', { highwayCode: 'N5', speedLimit: 65, ferry: true, bridge: 'Paturia–Daulatdia Padma Ferry', toll: 320, name: 'N5 Paturia–Daulatdia Ferry Crossing', viaLatLon: [[23.79, 89.79]] }),
    edgeSpec('tangail_elenga', 'tangail', 'elenga_mor', { highwayCode: 'N4', speedLimit: 85, name: 'N4 Tangail Bypass–Elenga Mor' }),
    edgeSpec('tangail_bogura', 'elenga_mor', 'sirajganj', { highwayCode: 'N405', speedLimit: 85, bridge: 'বঙ্গবন্ধু যমুনা সেতু (Bangabandhu Jamuna Bridge)', bridgeLatLon: [24.3997, 89.7782], toll: 380, doubleToll: true, name: 'Bangabandhu Jamuna Bridge Express', viaLatLon: [[24.385, 89.86], [24.40, 89.778], [24.42, 89.72]] }),
    edgeSpec('sirajganj_hatikumrul', 'sirajganj', 'hatikumrul_mor', { highwayCode: 'N405', speedLimit: 80, name: 'N405 Kadda Mor–Hatikumrul Golchottor', viaLatLon: [[24.44, 89.60]] }),
    edgeSpec('sirajganj_bogura', 'hatikumrul_mor', 'bogura', { highwayCode: 'N5', speedLimit: 85, bridge: 'নলকা ফুলজোড় সেতু (Nalka Phuljor Bridge)', bridgeLatLon: [24.55, 89.46], toll: 70, name: 'N5 Hatikumrul–Nalka Bridge–Sherpur–Bogura', viaLatLon: [[24.55, 89.46], [24.68, 89.42]] }),
    edgeSpec('bogura_gobindaganj', 'bogura', 'gobindaganj_bazar', { highwayCode: 'N5', speedLimit: 80, bridge: 'করতোয়া-বাঙালি সেতু (Karatoya–Bangali Bridge)', bridgeLatLon: [25.06, 89.38], toll: 60, name: 'N5 Bogura–Mahasthangarh–Gobindaganj', viaLatLon: [[24.97, 89.37], [25.06, 89.38]] }),
    edgeSpec('bogura_gaibandha', 'gobindaganj_bazar', 'gaibandha', { highwayCode: 'N5', speedLimit: 80, name: 'N5 Gobindaganj–Palashbari–Gaibandha', viaLatLon: [[25.22, 89.42]] }),
    edgeSpec('gaibandha_rangpur', 'gaibandha', 'rangpur', { highwayCode: 'N5', speedLimit: 80, bridge: 'ঘাঘট ও পীরগঞ্জ সেতু (Ghaghat River Bridge)', bridgeLatLon: [25.56, 89.29], toll: 40, name: 'N5 Palashbari–Pirganj–Mithapukur–Rangpur', viaLatLon: [[25.43, 89.31], [25.58, 89.29]] }),
    edgeSpec('rangpur_lalmonirhat', 'rangpur', 'lalmonirhat', { highwayCode: 'N509', type: 'regional', speedLimit: 70, bridge: 'তিস্তা সড়ক সেতু (Teesta Road Bridge)', bridgeLatLon: [25.79, 89.37], toll: 80, name: 'Rangpur–Teesta Bridge–Lalmonirhat Rd', viaLatLon: [[25.79, 89.37]] }),
    edgeSpec('lalmonirhat_kurigram', 'lalmonirhat', 'kurigram', { highwayCode: 'R570', type: 'regional', speedLimit: 65, bridge: 'ধরলা সেতু (Dharla River Bridge)', bridgeLatLon: [25.86, 89.56], toll: 50, name: 'Lalmonirhat–Dharla Bridge–Kurigram Rd' }),
    edgeSpec('rangpur_saidpur', 'rangpur', 'saidpur_mor', { highwayCode: 'N5', speedLimit: 80, bridge: 'তিস্তা খাল ও চিকলী সেতু (Chikli–Teesta Canal Bridge)', bridgeLatLon: [25.77, 89.08], toll: 40, name: 'N5 Rangpur–Taraganj–Saidpur Mor', viaLatLon: [[25.78, 89.08]] }),
    edgeSpec('saidpur_nilphamari', 'saidpur_mor', 'nilphamari', { highwayCode: 'N5', speedLimit: 75, name: 'N5 Saidpur Mor–Nilphamari Highway' }),
    edgeSpec('saidpur_dinajpur', 'saidpur_mor', 'dinajpur', { highwayCode: 'R585', speedLimit: 75, bridge: 'আত্রাই মোহনপুর সেতু (Mohanpur Atrai Bridge)', bridgeLatLon: [25.71, 88.76], toll: 50, name: 'Dashmail Mor–Atrai Bridge–Dinajpur', viaLatLon: [[25.71, 88.76]] }),
    edgeSpec('nilphamari_boda', 'nilphamari', 'boda_bazar', { highwayCode: 'N5', speedLimit: 75, bridge: 'আত্রাই দেবীগঞ্জ সেতু (Debiganj Atrai Bridge)', bridgeLatLon: [26.12, 88.75], toll: 50, name: 'N5 Domar–Debiganj Atrai Bridge–Boda Bazar', viaLatLon: [[26.12, 88.75]] }),
    edgeSpec('dinajpur_thakurgaon', 'dinajpur', 'thakurgaon', { highwayCode: 'N508', speedLimit: 75, bridge: 'ঢেপা ও কাঁটাজিউ সেতু (Dhepa River Bridge)', bridgeLatLon: [25.84, 88.54], toll: 40, name: 'Dinajpur–Birganj–Thakurgaon Highway', viaLatLon: [[25.84, 88.54]] }),
    edgeSpec('thakurgaon_boda', 'thakurgaon', 'boda_bazar', { highwayCode: 'N508', speedLimit: 75, bridge: 'টাঙ্গন সেতু (Tangon River Bridge)', bridgeLatLon: [26.12, 88.51], toll: 30, name: 'Thakurgaon–Bhulli–Boda Bazar N5 Link' }),
    edgeSpec('boda_panchagarh', 'boda_bazar', 'panchagarh', { highwayCode: 'N5', speedLimit: 75, bridge: 'করতোয়া সেতু (Panchagarh Karatoya Bridge)', bridgeLatLon: [26.29, 88.55], toll: 40, name: 'N5 Boda Bazar–Karatoya Bridge–Panchagarh', viaLatLon: [[26.29, 88.55]] }),

    // N6: Hatikumrul Mor -> Pabna / Natore -> Rajshahi -> Chapainawabganj -> Naogaon -> Joypurhat -> Bogura
    edgeSpec('sirajganj_natore', 'hatikumrul_mor', 'natore', { highwayCode: 'N6', speedLimit: 80, name: 'N6 Hatikumrul–Bonpara Express', viaLatLon: [[24.33, 89.26]] }),
    edgeSpec('natore_pabna', 'natore', 'pabna', { highwayCode: 'N6', speedLimit: 75, name: 'Bonpara–Dashuria–Pabna Highway', viaLatLon: [[24.18, 89.11]] }),
    edgeSpec('pabna_kushtia', 'pabna', 'kushtia', { highwayCode: 'N704', speedLimit: 75, bridge: 'Lalon Shah Bridge', bridgeLatLon: [24.0672, 89.0315], toll: 220, name: 'Ishwardi–Lalon Shah Bridge–Kushtia', viaLatLon: [[24.067, 89.031]] }),
    edgeSpec('natore_rajshahi', 'natore', 'rajshahi', { highwayCode: 'N6', speedLimit: 80, name: 'N6 Putia–Rajshahi Highway', viaLatLon: [[24.37, 88.83]] }),
    edgeSpec('bogura_rajshahi', 'bogura', 'naogaon', { highwayCode: 'R545', speedLimit: 75, name: 'Bogura–Dupchanchia–Naogaon Highway', viaLatLon: [[24.83, 89.15]] }),
    edgeSpec('naogaon_rajshahi', 'naogaon', 'rajshahi', { highwayCode: 'R685', speedLimit: 75, name: 'Naogaon–Manda–Mohanpur–Rajshahi', viaLatLon: [[24.59, 88.74]] }),
    edgeSpec('bogura_joypurhat', 'bogura', 'joypurhat', { highwayCode: 'R550', type: 'regional', speedLimit: 70, name: 'Bogura–Khetlal–Joypurhat Rd' }),
    edgeSpec('naogaon_joypurhat', 'naogaon', 'joypurhat', { highwayCode: 'R546', type: 'village', speedLimit: 60, name: 'Paharpur–Joypurhat Heritage Road' }),
    edgeSpec('rajshahi_chapai', 'rajshahi', 'chapainawabganj', { highwayCode: 'R680', speedLimit: 75, name: 'Rajshahi–Godagari–Chapainawabganj Padma Rd', viaLatLon: [[24.47, 88.39]] }),

    // N1: Sayedabad -> Narayanganj (Kanchpur) -> Cumilla -> Feni -> Chattogram -> Cox's Bazar -> Teknaf
    edgeSpec('sayedabad_narayanganj', 'sayedabad', 'narayanganj', { highwayCode: 'N1', speedLimit: 75, name: 'N1 Jatrabari–Kanchpur–Narayanganj', viaLatLon: [[23.70, 90.49]] }),
    edgeSpec('dhaka_cumilla', 'narayanganj', 'cumilla', { highwayCode: 'N1', speedLimit: 85, bridge: 'Meghna & Gomti Bridges', bridgeLatLon: [23.6062, 90.6164], toll: 280, name: 'N1 Dhaka–Chattogram 4-Lane Highway', viaLatLon: [[23.606, 90.616], [23.53, 90.76], [23.49, 90.98]] }),
    edgeSpec('cumilla_chandpur', 'cumilla', 'chandpur', { highwayCode: 'R140', type: 'regional', speedLimit: 65, name: 'Cumilla–Hajiganj–Chandpur Highway', viaLatLon: [[23.27, 90.89]] }),
    edgeSpec('cumilla_feni', 'cumilla', 'feni', { highwayCode: 'N1', speedLimit: 85, name: 'N1 Paduar Bazar–Chauddagram–Feni', viaLatLon: [[23.22, 91.29]] }),
    edgeSpec('feni_noakhali', 'feni', 'noakhali', { highwayCode: 'N104', type: 'regional', speedLimit: 70, name: 'Feni–Daganbhuiyan–Noakhali Maijdee', viaLatLon: [[22.94, 91.22]] }),
    edgeSpec('noakhali_lakshmipur', 'noakhali', 'lakshmipur', { highwayCode: 'R140', type: 'regional', speedLimit: 65, name: 'Chowmuhani–Lakshmipur Highway' }),
    edgeSpec('lakshmipur_chandpur', 'lakshmipur', 'chandpur', { highwayCode: 'R140', type: 'regional', speedLimit: 65, name: 'Lakshmipur–Raipur–Chandpur Rd' }),
    edgeSpec('cumilla_chittagong', 'feni', 'chittagong', { highwayCode: 'N1', speedLimit: 85, name: 'N1 Mirsharai–Sitakunda–Chattogram Highway', viaLatLon: [[22.78, 91.55], [22.61, 91.65], [22.46, 91.73]] }),
    edgeSpec('ctg_city_port', 'chittagong', 'ctg_port', { type: 'city', highwayCode: 'CTG', speedLimit: 50, name: 'Agrabad–Chattogram Port Access Rd' }),
    edgeSpec('chittagong_khagrachhari', 'chittagong', 'khagrachhari', { highwayCode: 'R160', type: 'regional', speedLimit: 60, name: 'Hathazari–Fatikchhari–Khagrachhari Hill Rd', viaLatLon: [[22.72, 91.81], [22.92, 91.89]] }),
    edgeSpec('chittagong_rangamati', 'chittagong', 'rangamati', { highwayCode: 'N106', type: 'regional', speedLimit: 60, name: 'Hathazari–Raozan–Rangamati Kaptai Rd', viaLatLon: [[22.52, 91.96]] }),
    edgeSpec('chittagong_bandarban', 'chittagong', 'bandarban', { highwayCode: 'N107', type: 'regional', speedLimit: 60, name: 'Keranihat–Bandarban Hill Highway', viaLatLon: [[22.14, 92.07]] }),
    edgeSpec('chittagong_coxsbazar', 'chittagong', 'coxsbazar', { highwayCode: 'N1', speedLimit: 80, bridge: 'Shah Amanat (Karnaphuli) Bridge', bridgeLatLon: [22.3095, 91.8505], toll: 180, name: "N1 Karnaphuli–Chakaria–Cox's Bazar", viaLatLon: [[22.309, 91.850], [22.02, 92.04], [21.76, 92.08]] }),
    edgeSpec('coxs_teknaf', 'coxsbazar', 'teknaf', { highwayCode: 'MarineDr', speedLimit: 75, name: "Cox's Bazar–Inani–Teknaf Marine Drive", viaLatLon: [[21.22, 92.04], [21.02, 92.16]] }),

    // N2: Narayanganj (Kanchpur) -> Narsingdi -> Bhairab Bridge -> Brahmanbaria -> Habiganj -> Moulvibazar -> Sylhet -> Sunamganj
    edgeSpec('narayanganj_narsingdi', 'narayanganj', 'narsingdi', { highwayCode: 'N2', speedLimit: 80, name: 'N2 Kanchpur–Bhulta–Narsingdi', viaLatLon: [[23.79, 90.58]] }),
    edgeSpec('dhaka_sylhet_village', 'gazipur', 'narsingdi', { highwayCode: 'R301', type: 'village', speedLimit: 55, name: 'Kaliganj–Ghorashal–Narsingdi Road' }),
    edgeSpec('narsingdi_bhairab', 'narsingdi', 'bhairab', { highwayCode: 'N2', speedLimit: 80, name: 'N2 Itakhola–Bhairab Highway', viaLatLon: [[23.98, 90.83]] }),
    edgeSpec('bhairab_kishoreganj', 'bhairab', 'kishoreganj', { highwayCode: 'R360', type: 'regional', speedLimit: 70, name: 'Bhairab–Kuliarchar–Kishoreganj Highway', viaLatLon: [[24.24, 90.88]] }),
    edgeSpec('bhairab_brahmanbaria', 'bhairab', 'brahmanbaria', { highwayCode: 'N2', speedLimit: 80, bridge: 'Syed Nazrul Islam (Bhairab) Bridge', bridgeLatLon: [24.0419, 90.9960], toll: 200, name: 'N2 Bhairab Bridge–Ashuganj–Brahmanbaria', viaLatLon: [[24.042, 90.996]] }),
    edgeSpec('cumilla_sylhet', 'cumilla', 'brahmanbaria', { highwayCode: 'N102', speedLimit: 75, name: 'Cumilla–Mainamati–Brahmanbaria Corridor', viaLatLon: [[23.69, 91.14]] }),
    edgeSpec('brahmanbaria_habiganj', 'brahmanbaria', 'habiganj', { highwayCode: 'N2', speedLimit: 80, name: 'N2 Sarail–Madhabpur–Shaistaganj–Habiganj', viaLatLon: [[24.16, 91.29], [24.28, 91.47]] }),
    edgeSpec('habiganj_moulvibazar', 'habiganj', 'moulvibazar', { highwayCode: 'N2', speedLimit: 80, name: 'N2 Mirpur–Sreemangal–Moulvibazar Tea Rd', viaLatLon: [[24.31, 91.73]] }),
    edgeSpec('moulvibazar_sylhet', 'moulvibazar', 'sylhet', { highwayCode: 'N2', speedLimit: 80, bridge: 'Keane / Shahjalal Bridge', bridgeLatLon: [24.8898, 91.8697], toll: 150, name: 'N2 Sherpur–Sylhet Tea Highway', viaLatLon: [[24.64, 91.68], [24.85, 91.84]] }),
    edgeSpec('sylhet_tea_road', 'sylhet', 'sylhet_tea', { type: 'regional', highwayCode: 'N2', speedLimit: 60, name: 'Airport Rd–Lakkatura Tea Gardens' }),
    edgeSpec('sylhet_sunamganj', 'sylhet', 'sunamganj', { highwayCode: 'R280', type: 'regional', speedLimit: 70, name: 'Sylhet–Gobindaganj–Sunamganj Haor Rd', viaLatLon: [[24.94, 91.64]] }),

    // N8: Sayedabad -> Munshiganj / Mawa -> Padma Bridge -> Madaripur / Shariatpur / Faridpur -> Barishal -> Patuakhali -> Kuakata
    edgeSpec('sayedabad_munshiganj', 'sayedabad', 'munshiganj', { highwayCode: 'R810', type: 'regional', speedLimit: 65, name: 'Postogola–Mukterpur Bridge–Munshiganj' }),
    edgeSpec('sayedabad_mawa', 'sayedabad', 'mawa_ghat', { highwayCode: 'N8', speedLimit: 90, name: 'N8 Dhaka–Mawa 6-Lane Expressway', viaLatLon: [[23.62, 90.34], [23.54, 90.29]] }),
    edgeSpec('dhaka_khulna', 'mawa_ghat', 'madaripur', { highwayCode: 'N8', speedLimit: 85, bridge: 'Padma Multipurpose Bridge', bridgeLatLon: [23.4460, 90.2625], toll: 450, name: 'Padma Multipurpose Bridge Express', viaLatLon: [[23.446, 90.262], [23.34, 90.12]] }),
    edgeSpec('mawa_shariatpur', 'mawa_ghat', 'shariatpur', { highwayCode: 'R860', type: 'regional', speedLimit: 70, name: 'Zajira Padma Landing–Shariatpur Rd', viaLatLon: [[23.36, 90.31]] }),
    edgeSpec('madaripur_shariatpur', 'madaripur', 'shariatpur', { highwayCode: 'R860', type: 'village', speedLimit: 55, name: 'Madaripur–Shariatpur Canal Rd' }),
    edgeSpec('madaripur_faridpur', 'madaripur', 'faridpur', { highwayCode: 'N8', speedLimit: 80, name: 'N8 Bhanga Interchange–Faridpur', viaLatLon: [[23.38, 89.98]] }),
    edgeSpec('madaripur_gopalganj', 'madaripur', 'gopalganj', { highwayCode: 'N805', speedLimit: 80, name: 'Bhanga–Muksudpur–Gopalganj Expressway', viaLatLon: [[23.22, 89.93]] }),
    edgeSpec('madaripur_barishal', 'madaripur', 'barishal', { highwayCode: 'N8', speedLimit: 80, name: 'N8 Tekerhat–Gournadi–Barishal Highway', viaLatLon: [[22.97, 90.23]] }),
    edgeSpec('barishal_bhola', 'barishal', 'bhola', { highwayCode: 'R890', type: 'regional', speedLimit: 60, ferry: true, bridge: 'Laharhat–Veduria Ferry', toll: 200, name: 'Barishal–Veduria–Bhola Ferry Crossing', viaLatLon: [[22.68, 90.51]] }),
    edgeSpec('barishal_jhalokati', 'barishal', 'jhalokati', { highwayCode: 'N8', speedLimit: 70, name: 'Barishal–Jhalokati Highway' }),
    edgeSpec('jhalokati_pirojpur', 'jhalokati', 'pirojpur', { highwayCode: 'R870', type: 'regional', speedLimit: 70, bridge: 'Bekutia Kocha Bridge', bridgeLatLon: [22.58, 90.04], toll: 120, name: 'Jhalokati–Bekutia Bridge–Pirojpur' }),
    edgeSpec('barishal_patuakhali', 'barishal', 'patuakhali', { highwayCode: 'N8', speedLimit: 80, bridge: 'Payra Bridge', bridgeLatLon: [22.46, 90.34], toll: 180, name: 'N8 Barishal–Payra Bridge–Patuakhali', viaLatLon: [[22.48, 90.34]] }),
    edgeSpec('patuakhali_barguna', 'patuakhali', 'barguna', { highwayCode: 'R880', type: 'regional', speedLimit: 65, name: 'Patuakhali–Mirzaganj–Barguna Rd' }),
    edgeSpec('patuakhali_kuakata', 'patuakhali', 'kuakata', { highwayCode: 'N8', speedLimit: 75, name: 'N8 Kalapara–Kuakata Sea Beach Highway', viaLatLon: [[22.01, 90.22]] }),

    // N7: Rajbari -> Faridpur -> Magura -> Jhenaidah -> Jashore -> Narail -> Khulna -> Bagerhat / Satkhira
    edgeSpec('rajbari_faridpur', 'rajbari', 'faridpur', { highwayCode: 'N7', speedLimit: 75, name: 'N7 Rajbari–Goalanda–Faridpur Highway' }),
    edgeSpec('faridpur_magura', 'faridpur', 'magura', { highwayCode: 'N7', speedLimit: 80, name: 'N7 Kamarkhali Bridge–Magura Highway', viaLatLon: [[23.54, 89.59]] }),
    edgeSpec('magura_jhenaidah', 'magura', 'jhenaidah', { highwayCode: 'N7', speedLimit: 80, name: 'N7 Magura–Jhenaidah Express' }),
    edgeSpec('jhenaidah_kushtia', 'jhenaidah', 'kushtia', { highwayCode: 'N704', speedLimit: 75, name: 'Jhenaidah–Shailkupa–Kushtia Highway' }),
    edgeSpec('jhenaidah_chuadanga', 'jhenaidah', 'chuadanga', { highwayCode: 'R745', type: 'regional', speedLimit: 70, name: 'Jhenaidah–Chuadanga Highway' }),
    edgeSpec('chuadanga_meherpur', 'chuadanga', 'meherpur', { highwayCode: 'R745', type: 'regional', speedLimit: 65, name: 'Chuadanga–Meherpur Mujibnagar Rd' }),
    edgeSpec('kushtia_meherpur', 'kushtia', 'meherpur', { highwayCode: 'R747', type: 'village', speedLimit: 60, name: 'Kushtia–Mirpur–Meherpur Road' }),
    edgeSpec('jhenaidah_jashore', 'jhenaidah', 'jashore', { highwayCode: 'N7', speedLimit: 80, name: 'N7 Kaliganj–Jashore Highway' }),
    edgeSpec('jashore_narail', 'jashore', 'narail', { highwayCode: 'N706', type: 'regional', speedLimit: 75, name: 'Jashore–Narail Highway' }),
    edgeSpec('narail_gopalganj', 'narail', 'gopalganj', { highwayCode: 'N805', speedLimit: 80, bridge: 'Kalna Madhumati Bridge', bridgeLatLon: [23.19, 89.64], toll: 150, name: 'Kalna Bridge–Gopalganj–Padma Link' }),
    edgeSpec('jashore_khulna', 'jashore', 'khulna', { highwayCode: 'N7', speedLimit: 80, name: 'N7 Noapara–Phultala–Khulna Highway', viaLatLon: [[23.02, 89.40]] }),
    edgeSpec('jashore_satkhira', 'jashore', 'satkhira', { highwayCode: 'R760', type: 'regional', speedLimit: 70, name: 'Jashore–Navaron–Satkhira Highway', viaLatLon: [[22.96, 89.03]] }),
    edgeSpec('khulna_satkhira', 'khulna', 'satkhira', { highwayCode: 'R760', type: 'regional', speedLimit: 70, name: 'Khulna–Dumuria–Tala–Satkhira Highway' }),
    edgeSpec('khulna_bagerhat', 'khulna', 'bagerhat', { highwayCode: 'N7', speedLimit: 75, bridge: 'Khan Jahan Ali (Rupsha) Bridge', bridgeLatLon: [22.7755, 89.5858], toll: 160, name: 'N7 Rupsha Bridge–Fakirhat–Bagerhat', viaLatLon: [[22.775, 89.586]] }),
    edgeSpec('bagerhat_gopalganj', 'bagerhat', 'gopalganj', { highwayCode: 'R770', type: 'regional', speedLimit: 75, name: 'Bagerhat–Mollahat–Gopalganj Highway' }),
    edgeSpec('bagerhat_pirojpur', 'bagerhat', 'pirojpur', { highwayCode: 'R770', type: 'regional', speedLimit: 65, name: 'Bagerhat–Kachua–Pirojpur Coastal Rd' })
  ];

  // Major Real River Polylines (WGS-84 coordinates) + Bay of Bengal shoreline
  const REAL_RIVERS = [
    {
      id: 'jamuna',
      name: 'Jamuna River',
      nameBn: 'যমুনা নদী',
      widthWorld: 76,
      points: [
        [25.72, 89.76], [25.35, 89.73], [24.95, 89.76], [24.62, 89.75],
        [24.40, 89.78], [24.12, 89.76], [23.82, 89.77]
      ]
    },
    {
      id: 'padma',
      name: 'Padma River',
      nameBn: 'পদ্মা নদী',
      widthWorld: 86,
      points: [
        [24.55, 88.24], [24.36, 88.58], [24.07, 89.03], [23.95, 89.42],
        [23.78, 89.78], [23.61, 90.02], [23.45, 90.26], [23.25, 90.62]
      ]
    },
    {
      id: 'meghna',
      name: 'Meghna River',
      nameBn: 'মেঘনা নদী',
      widthWorld: 72,
      points: [
        [24.05, 90.99], [23.82, 90.75], [23.61, 90.62], [23.42, 90.64],
        [23.23, 90.64], [22.90, 90.68], [22.45, 90.72]
      ]
    },
    {
      id: 'old_brahmaputra',
      name: 'Old Brahmaputra',
      nameBn: 'পুরাতন ব্রহ্মপুত্র',
      widthWorld: 36,
      points: [
        [25.18, 89.82], [24.94, 90.05], [24.75, 90.43], [24.46, 90.65], [24.05, 90.98]
      ]
    },
    {
      id: 'buriganga',
      name: 'Buriganga & Shitalakshya',
      nameBn: 'বুড়িগঙ্গা নদী',
      widthWorld: 24,
      points: [
        [23.78, 90.33], [23.73, 90.36], [23.70, 90.41], [23.64, 90.48], [23.56, 90.53]
      ]
    },
    {
      id: 'surma',
      name: 'Surma River',
      nameBn: 'সুরমা নদী',
      widthWorld: 30,
      points: [
        [24.92, 92.15], [24.89, 91.87], [24.96, 91.55], [25.07, 91.39], [24.72, 91.15]
      ]
    },
    {
      id: 'karnaphuli',
      name: 'Karnaphuli River',
      nameBn: 'কর্ণফুলী নদী',
      widthWorld: 38,
      points: [
        [22.52, 92.20], [22.41, 92.02], [22.31, 91.85], [22.29, 91.79], [22.22, 91.77]
      ]
    },
    {
      id: 'teesta',
      name: 'Teesta River',
      nameBn: 'তিস্তা নদী',
      widthWorld: 34,
      points: [
        [26.20, 89.03], [25.95, 89.22], [25.77, 89.42], [25.60, 89.66]
      ]
    },
    {
      id: 'rupsha',
      name: 'Rupsha–Passur River',
      nameBn: 'রূপসা-পশুর নদী',
      widthWorld: 34,
      points: [
        [22.86, 89.56], [22.775, 89.586], [22.48, 89.59], [22.12, 89.55]
      ]
    },
    {
      id: 'kirtonkhola',
      name: 'Kirtonkhola–Tentulia',
      nameBn: 'কীর্তনখোলা নদী',
      widthWorld: 38,
      points: [
        [22.74, 90.38], [22.66, 90.36], [22.46, 90.34], [22.10, 90.34]
      ]
    },
    {
      id: 'karatoya',
      name: 'Karatoya River',
      nameBn: 'করতোয়া নদী',
      widthWorld: 24,
      points: [
        [26.52, 88.56], [26.29, 88.55], [25.88, 88.95], [25.18, 89.38], [24.85, 89.38], [24.55, 89.46]
      ]
    },
    {
      id: 'atrai',
      name: 'Atrai River',
      nameBn: 'আত্রাই নদী',
      widthWorld: 22,
      points: [
        [26.28, 88.72], [26.12, 88.75], [25.71, 88.76], [25.12, 88.82], [24.65, 88.96]
      ]
    },
    {
      id: 'tangon',
      name: 'Tangon & Dhepa River',
      nameBn: 'টাঙ্গন ও ঢেপা নদী',
      widthWorld: 18,
      points: [
        [26.22, 88.45], [26.12, 88.51], [25.98, 88.47], [25.84, 88.54], [25.63, 88.62]
      ]
    },
    {
      id: 'ghaghat',
      name: 'Ghaghat River',
      nameBn: 'ঘাঘট নদী',
      widthWorld: 20,
      points: [
        [25.88, 89.15], [25.77, 89.08], [25.68, 89.26], [25.56, 89.29], [25.35, 89.54]
      ]
    },
    {
      id: 'phuljor_bangali',
      name: 'Bangali & Phuljor River',
      nameBn: 'বাঙালি ও ফুলজোড় নদী',
      widthWorld: 24,
      points: [
        [25.25, 89.52], [25.06, 89.38], [24.75, 89.48], [24.55, 89.46], [24.28, 89.58]
      ]
    },
    {
      id: 'bangshi_turag',
      name: 'Bangshi & Turag River',
      nameBn: 'বংশী ও তুরাগ নদী',
      widthWorld: 22,
      points: [
        [24.22, 90.06], [24.11, 90.10], [23.92, 90.26], [23.90, 90.34], [23.796, 90.318], [23.75, 90.34]
      ]
    },
    {
      id: 'dhaleshwari',
      name: 'Dhaleshwari River',
      nameBn: 'ধলেশ্বরী নদী',
      widthWorld: 30,
      points: [
        [24.30, 89.80], [23.90, 90.16], [23.72, 90.24], [23.56, 90.48], [23.52, 90.62]
      ]
    },
    {
      id: 'shitalakshya',
      name: 'Shitalakshya River',
      nameBn: 'শীতলক্ষ্যা নদী',
      widthWorld: 26,
      points: [
        [24.08, 90.62], [23.88, 90.56], [23.68, 90.51], [23.56, 90.53]
      ]
    },
    {
      id: 'gomti',
      name: 'Gomti River',
      nameBn: 'গোমতী নদী',
      widthWorld: 22,
      points: [
        [23.48, 91.32], [23.48, 91.16], [23.54, 90.88], [23.58, 90.70]
      ]
    },
    {
      id: 'madhumati',
      name: 'Madhumati River',
      nameBn: 'মধুমতী নদী',
      widthWorld: 28,
      points: [
        [23.70, 89.45], [23.48, 89.56], [23.19, 89.64], [22.88, 89.84]
      ]
    },
    {
      id: 'payra',
      name: 'Payra & Kocha River',
      nameBn: 'পায়রা ও কচা নদী',
      widthWorld: 30,
      points: [
        [22.66, 90.02], [22.58, 90.04], [22.46, 90.34], [22.18, 90.26]
      ]
    },
    {
      id: 'dharla',
      name: 'Dharla River',
      nameBn: 'ধরলা নদী',
      widthWorld: 26,
      points: [
        [26.05, 89.48], [25.86, 89.56], [25.79, 89.66], [25.68, 89.76]
      ]
    }
  ];

  // Bay of Bengal coastline polygon vertices (for 2D map & southern sea rendering)
  const BAY_COASTLINE_LATLON = [
    [21.65, 89.05], [21.75, 89.55], [21.81, 90.12], [21.95, 90.55],
    [22.25, 90.95], [22.60, 91.32], [22.35, 91.72], [21.95, 91.85],
    [21.43, 91.97], [20.85, 92.30]
  ];

  // Simplified real Bangladesh national outline polygon for the 2D Interactive Map
  const BANGLADESH_BORDER_LATLON = [
    [26.63, 88.40], [26.44, 88.95], [26.15, 89.60], [25.85, 89.88],
    [25.25, 89.84], [25.18, 90.65], [25.17, 91.50], [25.15, 92.35],
    [24.85, 92.50], [24.20, 92.20], [23.72, 91.35], [23.12, 91.95],
    [22.70, 92.45], [21.95, 92.62], [21.15, 92.32], [20.74, 92.33],
    [21.42, 91.96], [22.25, 91.78], [22.68, 91.35], [22.38, 90.80],
    [21.81, 90.12], [21.72, 89.10], [22.65, 88.92], [23.58, 88.58],
    [24.48, 88.06], [25.15, 88.78], [25.72, 88.14], [26.35, 88.24]
  ];

  // Build adjacency graph for Dijkstra shortest-road-path computation
  function buildAdjacency() {
    const adj = {};
    Object.keys(BANGLADESH_LOCATIONS).forEach((id) => { adj[id] = []; });
    ROAD_NETWORK_EDGES.forEach((e) => {
      const a = BANGLADESH_LOCATIONS[e.from];
      const b = BANGLADESH_LOCATIONS[e.to];
      if (!a || !b) return;
      const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
      adj[e.from].push({ to: e.to, weight: distKm, edge: e });
      adj[e.to].push({ to: e.from, weight: distKm, edge: e });
    });
    return adj;
  }

  const ADJACENCY = buildAdjacency();

  function findShortestRoadPath(startId, endId) {
    if (!BANGLADESH_LOCATIONS[startId] || !BANGLADESH_LOCATIONS[endId]) return null;
    if (startId === endId) return { stops: [startId], totalKm: 0, edges: [] };

    const dist = {};
    const prev = {};
    const prevEdge = {};
    const visited = new Set();
    Object.keys(BANGLADESH_LOCATIONS).forEach((k) => { dist[k] = Infinity; });
    dist[startId] = 0;

    const queue = [startId];
    while (queue.length > 0) {
      queue.sort((a, b) => dist[a] - dist[b]);
      const u = queue.shift();
      if (u === endId) break;
      if (visited.has(u)) continue;
      visited.add(u);

      const neighbors = ADJACENCY[u] || [];
      for (let i = 0; i < neighbors.length; i++) {
        const nb = neighbors[i];
        if (visited.has(nb.to)) continue;
        const alt = dist[u] + nb.weight;
        if (alt < dist[nb.to]) {
          dist[nb.to] = alt;
          prev[nb.to] = u;
          prevEdge[nb.to] = nb.edge;
          queue.push(nb.to);
        }
      }
    }

    if (!Number.isFinite(dist[endId])) return null;
    const stops = [];
    const edges = [];
    let cur = endId;
    while (cur) {
      stops.unshift(cur);
      if (prevEdge[cur]) edges.unshift(prevEdge[cur]);
      cur = prev[cur];
    }
    return {
      stops,
      edges,
      totalKm: Math.round(dist[endId] * 10) / 10
    };
  }

  function findNearestLocation(x, z) {
    let best = null;
    let bestDistSq = Infinity;
    const all = Object.values(BANGLADESH_LOCATIONS);
    for (let i = 0; i < all.length; i++) {
      const loc = all[i];
      const dx = loc.x - x;
      const dz = loc.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = loc;
      }
    }
    return { location: best, distUnits: Math.sqrt(bestDistSq) };
  }

  function searchRealLocations(query, divisionFilter, categoryFilter) {
    const q = (query || '').trim().toLowerCase();
    return Object.values(BANGLADESH_LOCATIONS).filter((loc) => {
      if (divisionFilter && divisionFilter !== 'all' && loc.division !== divisionFilter) return false;
      if (categoryFilter && categoryFilter !== 'all') {
        if (categoryFilter === 'district' && !loc.isDistrict) return false;
        if (categoryFilter === 'terminal' && !loc.isTerminal) return false;
        if (categoryFilter === 'landmark' && loc.category !== 'landmark') return false;
        if (categoryFilter === 'market' && !loc.hasMarket) return false;
      }
      if (!q) return true;
      const hay = [
        loc.nameEn,
        loc.nameBn,
        loc.division,
        loc.desc || '',
        ...(loc.upazilas || [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  global.BDGeoData = {
    ORIGIN_LAT,
    ORIGIN_LON,
    WORLD_SCALE,
    UNITS_PER_KM,
    DATA_SOURCES,
    BD_DIVISIONS,
    BANGLADESH_LOCATIONS,
    ROAD_NETWORK_EDGES,
    REAL_RIVERS,
    BAY_COASTLINE_LATLON,
    BANGLADESH_BORDER_LATLON,
    latLonToWorld,
    worldToLatLon,
    haversineKm,
    getElevationAtLatLon,
    getBiomeAtLatLon,
    findShortestRoadPath,
    findNearestLocation,
    searchRealLocations
  };
})(typeof window !== 'undefined' ? window : globalThis);
