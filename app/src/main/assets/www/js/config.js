(function (global) {
  'use strict';

  const BUS_CATALOG = [
    {
      id: 'green_line',
      name: 'Green Line Express',
      model: 'Scania K410 Double-Axle Coach',
      busType: 'Intercity',
      routeBn: 'ঢাকা - চট্টগ্রাম',
      routeEn: 'Dhaka - Chattogram',
      plateBn: 'ঢাকা মেট্রো-ব ১১-৪৮২৯',
      primaryColor: '#0c7c48',
      secondaryColor: '#f8fafc',
      stripeColor: '#dc2626',
      topSpeedKmh: 118,
      accelPower: 1.0,
      brakePower: 1.0,
      handling: 1.0,
      fuelCapacity: 100,
      seatCapacity: 28,
      price: 0
    },
    {
      id: 'hanif',
      name: 'Hanif Enterprise',
      model: 'Hino AK1J Classic Non-AC',
      busType: 'Non-AC',
      routeBn: 'ঢাকা - সিলেট',
      routeEn: 'Dhaka - Sylhet',
      plateBn: 'ঢাকা মেট্রো-ব ১৪-২২০৭',
      primaryColor: '#d9480f',
      secondaryColor: '#fff7ed',
      stripeColor: '#1e3a8a',
      topSpeedKmh: 112,
      accelPower: 1.05,
      brakePower: 0.96,
      handling: 1.08,
      fuelCapacity: 100,
      seatCapacity: 32,
      price: 0
    },
    {
      id: 'brtc_local',
      name: 'BRTC City Metro',
      model: 'Ashok Leyland City Local',
      busType: 'Local',
      routeBn: 'ঢাকা - গাজীপুর',
      routeEn: 'Dhaka - Gazipur',
      plateBn: 'ঢাকা মেট্রো-স ১১-০৮৪২',
      primaryColor: '#0284c7',
      secondaryColor: '#f0f9ff',
      stripeColor: '#facc15',
      topSpeedKmh: 96,
      accelPower: 1.02,
      brakePower: 1.04,
      handling: 1.12,
      fuelCapacity: 90,
      seatCapacity: 36,
      price: 8500
    },
    {
      id: 'ena',
      name: 'Ena Transport',
      model: 'Hyundai Universe AC Express',
      busType: 'AC',
      routeBn: 'ঢাকা - ময়মনসিংহ',
      routeEn: 'Dhaka - Mymensingh',
      plateBn: 'ঢাকা মেট্রো-ব ১৫-৭৭৩১',
      primaryColor: '#1d4ed8',
      secondaryColor: '#f1f5f9',
      stripeColor: '#f59e0b',
      topSpeedKmh: 124,
      accelPower: 1.12,
      brakePower: 1.05,
      handling: 1.04,
      fuelCapacity: 115,
      seatCapacity: 30,
      price: 12000
    },
    {
      id: 'shohagh',
      name: 'Shohagh Paribahan',
      model: 'Mercedes-Benz O500RS Luxury',
      busType: 'Luxury Coach',
      routeBn: 'ঢাকা - খুলনা',
      routeEn: 'Dhaka - Khulna',
      plateBn: 'ঢাকা মেট্রো-ব ১৯-৯১০৪',
      primaryColor: '#9f1239',
      secondaryColor: '#fff1f2',
      stripeColor: '#10b981',
      topSpeedKmh: 130,
      accelPower: 1.18,
      brakePower: 1.12,
      handling: 1.1,
      fuelCapacity: 120,
      seatCapacity: 28,
      price: 22000
    },
    {
      id: 'brtc_double',
      name: 'BRTC Double-Decker',
      model: 'Volvo B9TL Twin-Deck',
      busType: 'Double-Decker',
      routeBn: 'ঢাকা - কুমিল্লা',
      routeEn: 'Dhaka - Cumilla',
      plateBn: 'ঢাকা মেট্রো-ব ২১-৩৫০৮',
      primaryColor: '#b91c1c',
      secondaryColor: '#fef2f2',
      stripeColor: '#fbbf24',
      topSpeedKmh: 104,
      accelPower: 0.96,
      brakePower: 1.06,
      handling: 0.92,
      fuelCapacity: 135,
      seatCapacity: 48,
      isDoubleDecker: true,
      price: 36000
    },
    {
      id: 'desh_sleeper',
      name: 'Desh Travels Sleeper',
      model: 'MAN Lion Coach Night Sleeper',
      busType: 'Sleeper',
      routeBn: 'ঢাকা - কক্সবাজার',
      routeEn: "Dhaka - Cox's Bazar",
      plateBn: 'ঢাকা মেট্রো-ব ২৩-৬৪১২',
      primaryColor: '#4338ca',
      secondaryColor: '#eef2ff',
      stripeColor: '#34d399',
      topSpeedKmh: 128,
      accelPower: 1.16,
      brakePower: 1.1,
      handling: 1.05,
      fuelCapacity: 140,
      seatCapacity: 26,
      isSleeper: true,
      price: 44000
    },
    {
      id: 'dhaka_ev',
      name: 'Dhaka Green EV',
      model: 'BYD K9 Electric Coach',
      busType: 'Electric',
      routeBn: 'ঢাকা - রাজশাহী',
      routeEn: 'Dhaka - Rajshahi',
      plateBn: 'ঢাকা মেট্রো-ই ২৫-৯৯০১',
      primaryColor: '#059669',
      secondaryColor: '#ecfdf5',
      stripeColor: '#06b6d4',
      topSpeedKmh: 126,
      accelPower: 1.24,
      brakePower: 1.18,
      handling: 1.14,
      fuelCapacity: 150,
      seatCapacity: 34,
      isElectric: true,
      price: 52000
    },
    {
      id: 'scania_v8_titan',
      name: 'Bengal Titan V8 Express',
      model: 'Scania V8 Twin-Turbo 770HP',
      busType: 'V8 Super Coach',
      routeBn: 'ঢাকা - পঞ্চগড় - কক্সবাজার',
      routeEn: "Dhaka - Panchagarh - Cox's Bazar",
      plateBn: 'ঢাকা মেট্রো-ব ২৭-৭৭০০',
      primaryColor: '#0f172a',
      secondaryColor: '#f8fafc',
      stripeColor: '#f59e0b',
      topSpeedKmh: 162,
      accelPower: 1.54,
      brakePower: 1.26,
      handling: 1.18,
      fuelCapacity: 175,
      seatCapacity: 36,
      price: 58000
    }
  ];

  const Geo = global.BDGeoData || {};
  const BANGLADESH_LOCATIONS = Geo.BANGLADESH_LOCATIONS || {
    dhaka: { id: 'dhaka', nameEn: 'Dhaka', nameBn: 'ঢাকা টার্মিনাল', x: 0, z: 0, lat: 23.7776, lon: 90.4024, division: 'dhaka', isDistrict: true, isTerminal: true, hasMarket: true, hasMosque: true, hasHospital: true, hasSchool: true, ticketBase: 180, terminalCost: 22000 }
  };

  const ROAD_NETWORK_EDGES = Geo.ROAD_NETWORK_EDGES || [];

  function computeRouteStats(stops) {
    const list = Array.isArray(stops) ? stops : [];
    let totalKm = 0;
    let totalToll = 0;
    const bridges = [];
    let ferries = 0;
    const districtIds = [];
    const divisions = [];

    for (let i = 0; i < list.length; i++) {
      const loc = BANGLADESH_LOCATIONS[list[i]];
      if (loc) {
        if (loc.isDistrict && !districtIds.includes(loc.id)) districtIds.push(loc.id);
        if (loc.division && !divisions.includes(loc.division)) divisions.push(loc.division);
      }
      if (i < list.length - 1) {
        const aId = list[i];
        const bId = list[i + 1];
        const a = BANGLADESH_LOCATIONS[aId];
        const b = BANGLADESH_LOCATIONS[bId];
        if (a && b && Geo.haversineKm) {
          totalKm += Geo.haversineKm(a.lat, a.lon, b.lat, b.lon);
        } else if (a && b) {
          totalKm += Math.hypot(b.x - a.x, b.z - a.z) / 40;
        }
        const edge = ROAD_NETWORK_EDGES.find(
          (e) => (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId)
        );
        if (edge) {
          if (edge.toll) totalToll += edge.doubleToll ? edge.toll * 2 : edge.toll;
          if (edge.ferry) ferries += 1;
          if (edge.bridge && !bridges.includes(edge.bridge)) bridges.push(edge.bridge);
        }
      }
    }

    return {
      totalKm: Math.max(4, Math.round(totalKm)),
      totalToll: Math.round(totalToll),
      bridges,
      ferries,
      districtIds,
      divisions
    };
  }

  function buildCustomBangladeshMission(fromId, toId) {
    const fromLoc = BANGLADESH_LOCATIONS[fromId];
    const toLoc = BANGLADESH_LOCATIONS[toId];
    if (!fromLoc || !toLoc || fromId === toId) return null;

    const roadPath = Geo.findShortestRoadPath ? Geo.findShortestRoadPath(fromId, toId) : null;
    const stops = roadPath && Array.isArray(roadPath.stops) && roadPath.stops.length >= 2
      ? roadPath.stops
      : [fromId, toId];
    const stats = computeRouteStats(stops);
    const totalKm = roadPath && roadPath.totalKm ? Math.max(4, Math.round(roadPath.totalKm)) : stats.totalKm;
    const ticketPrice = Math.max(150, Math.min(2600, Math.round((85 + totalKm * 2.05) / 10) * 10));
    const rewardTaka = Math.max(2400, Math.round((1200 + totalKm * 36 + stats.totalToll * 1.4) / 100) * 100);
    const viaPreview = stops.length > 2
      ? stops.slice(1, Math.min(stops.length - 1, 5)).map((s) => (BANGLADESH_LOCATIONS[s] ? BANGLADESH_LOCATIONS[s].nameEn : s)).join(', ')
      : 'Direct Highway';
    const bridgeNote = stats.bridges.length
      ? ` • Bridges/Ferries: ${stats.bridges.slice(0, 2).join(', ')}${stats.bridges.length > 2 ? ` +${stats.bridges.length - 2}` : ''}`
      : '';

    return {
      id: `bd_mission_${fromId}_to_${toId}`,
      region: 'custom',
      highway: `${totalKm} km`,
      nameEn: `${fromLoc.nameEn} → ${toLoc.nameEn}`,
      nameBn: `${fromLoc.nameBn} থেকে ${toLoc.nameBn}`,
      stops,
      ticketPrice,
      rewardTaka,
      distKm: totalKm,
      totalToll: stats.totalToll,
      isCustomMission: true,
      desc: `Real ${totalKm} km Bangladesh mission (${stops.length} stops via ${viaPreview}${stops.length > 5 ? '…' : ''})${bridgeNote}.`
    };
  }

  const ROUTES_CATALOG = [
    // === NATIONAL FLAGSHIP & CROSS-COUNTRY EXPRESS MISSIONS ===
    { id: 'panchagarh_dhaka', region: 'national', highway: 'N5', nameEn: 'Panchagarh → Dhaka (N5 Jamuna Bridge)', nameBn: 'পঞ্চগড় থেকে ঢাকা (যমুনা সেতু)', stops: ['panchagarh', 'boda_bazar', 'nilphamari', 'saidpur_mor', 'rangpur', 'gaibandha', 'gobindaganj_bazar', 'bogura', 'hatikumrul_mor', 'sirajganj', 'elenga_mor', 'tangail', 'chandra_mor', 'savar', 'gabtoli', 'jatiya_sangsad', 'dhaka'], ticketPrice: 980, rewardTaka: 18500, desc: 'Real North Bengal N5 highway from Panchagarh via Boda Bazar, Saidpur Mor, Rangpur, Gobindaganj, Bogura, Hatikumrul, Bangabandhu Jamuna Bridge, Elenga, Chandra & Savar to Dhaka.' },
    { id: 'dhaka_panchagarh', region: 'national', highway: 'N5', nameEn: 'Dhaka → Panchagarh (N5 Jamuna Bridge)', nameBn: 'ঢাকা থেকে পঞ্চগড় (যমুনা সেতু)', stops: ['dhaka', 'jatiya_sangsad', 'gabtoli', 'savar', 'chandra_mor', 'tangail', 'elenga_mor', 'sirajganj', 'hatikumrul_mor', 'bogura', 'gobindaganj_bazar', 'gaibandha', 'rangpur', 'saidpur_mor', 'nilphamari', 'boda_bazar', 'panchagarh'], ticketPrice: 980, rewardTaka: 18500, desc: 'Full N5 North Bengal expedition from Dhaka across Turag, Bangshi, Jamuna, Phuljor, Karatoya, Ghaghat & Atrai bridges to Panchagarh.' },
    { id: 'teknaf_panchagarh', region: 'national', highway: 'Marine–N1–N5', nameEn: 'Teknaf → Panchagarh (Cross-Bangladesh Grand Tour)', nameBn: 'টেকনাফ থেকে পঞ্চগড় (সারা বাংলাদেশ গ্র্যান্ড ট্যুর)', stops: ['teknaf', 'coxsbazar', 'chittagong', 'feni', 'cumilla', 'narayanganj', 'sayedabad', 'kamalapur', 'dhaka', 'jatiya_sangsad', 'gabtoli', 'savar', 'chandra_mor', 'tangail', 'elenga_mor', 'sirajganj', 'hatikumrul_mor', 'bogura', 'gobindaganj_bazar', 'gaibandha', 'rangpur', 'saidpur_mor', 'nilphamari', 'boda_bazar', 'panchagarh'], ticketPrice: 1850, rewardTaka: 38000, desc: 'Ultimate All-Bangladesh coast-to-Himalayas expedition from Marine Drive Teknaf across Karnaphuli, Meghna & Jamuna Bridges to Panchagarh.' },
    { id: 'dhaka_coxs', region: 'national', highway: 'N1', nameEn: "Dhaka → Cox's Bazar (N1)", nameBn: 'ঢাকা থেকে কক্সবাজার', stops: ['sayedabad', 'narayanganj', 'cumilla', 'feni', 'chittagong', 'coxsbazar'], ticketPrice: 920, rewardTaka: 15500, desc: "Flagship N1 coastal run crossing Meghna & Karnaphuli Bridges to Cox's Bazar sea beach." },
    { id: 'dhaka_kuakata', region: 'national', highway: 'N8 Padma', nameEn: 'Padma Bridge → Barishal → Kuakata (N8)', nameBn: 'পদ্মা সেতু হয়ে কুয়াকাটা', stops: ['sayedabad', 'mawa_ghat', 'madaripur', 'barishal', 'patuakhali', 'kuakata'], ticketPrice: 780, rewardTaka: 13800, desc: 'Drive Dhaka–Mawa Expressway across the 6.15km Padma Multipurpose Bridge & Payra Bridge to Kuakata Sea Beach.' },
    { id: 'dhaka_khulna', region: 'national', highway: 'N8/N7', nameEn: 'Dhaka → Khulna (Padma–Kalna)', nameBn: 'ঢাকা থেকে খুলনা', stops: ['sayedabad', 'mawa_ghat', 'madaripur', 'gopalganj', 'narail', 'jashore', 'khulna'], ticketPrice: 650, rewardTaka: 11500, desc: 'Cross Padma Bridge & Kalna Madhumati Bridge via Gopalganj & Jashore to Khulna Sonadanga Terminal.' },
    { id: 'dhaka_rajshahi', region: 'national', highway: 'N5/N6', nameEn: 'Dhaka → Rajshahi (N5/N6)', nameBn: 'ঢাকা থেকে রাজশাহী', stops: ['gabtoli', 'savar', 'chandra_mor', 'tangail', 'elenga_mor', 'sirajganj', 'hatikumrul_mor', 'natore', 'rajshahi'], ticketPrice: 640, rewardTaka: 11200, desc: 'Cross Bangabandhu Jamuna Bridge, Hatikumrul Mor and N6 Bonpara highway to Padma-side Rajshahi.' },
    { id: 'dhaka_sylhet', region: 'national', highway: 'N2', nameEn: 'Dhaka → Sylhet (N2)', nameBn: 'ঢাকা থেকে সিলেট', stops: ['sayedabad', 'narayanganj', 'narsingdi', 'bhairab', 'brahmanbaria', 'habiganj', 'moulvibazar', 'sylhet'], ticketPrice: 560, rewardTaka: 9800, desc: 'Real N2 highway via Bhairab Bridge, Sreemangal tea hills & Keane Bridge to Sylhet.' },

    // === DHAKA DIVISION MISSIONS ===
    { id: 'dhaka_tangail', region: 'dhaka', highway: 'N4', nameEn: 'Dhaka → Tangail (N4)', nameBn: 'ঢাকা থেকে টাঙ্গাইল', stops: ['dhaka', 'gazipur', 'chandra_mor', 'tangail'], ticketPrice: 260, rewardTaka: 3800, desc: 'Express service through Gazipur & Chandra Tri-Mor junction to Tangail.' },
    { id: 'padma_south_loop', region: 'dhaka', highway: 'N8/N7/N5', nameEn: 'Munshiganj → Padma → Shariatpur → Faridpur → Rajbari Ferry', nameBn: 'মুন্সিগঞ্জ-পদ্মা-শরীয়তপুর-ফরিদপুর-রাজবাড়ী ফেরি', stops: ['munshiganj', 'sayedabad', 'mawa_ghat', 'shariatpur', 'madaripur', 'faridpur', 'rajbari', 'manikganj', 'savar', 'gabtoli'], ticketPrice: 740, rewardTaka: 13200, desc: 'Complete Padma River basin circuit crossing Padma Bridge and Paturia–Daulatdia Ferry through 6 Dhaka Division districts.' },
    { id: 'dhaka_kishoreganj_haor', region: 'dhaka', highway: 'N2/R360', nameEn: 'Dhaka → Narsingdi → Bhairab → Kishoreganj', nameBn: 'ঢাকা থেকে কিশোরগঞ্জ হাওর এক্সপ্রেস', stops: ['sayedabad', 'narayanganj', 'narsingdi', 'bhairab', 'kishoreganj'], ticketPrice: 360, rewardTaka: 5800, desc: 'Cross Kanchpur & Bhairab Meghna corridor north toward Kishoreganj Haor gateway.' },
    { id: 'dhaka_fuel_service', region: 'dhaka', highway: 'Metro', nameEn: 'Refueling & Metro Express', nameBn: 'ঢাকা মেট্রো ও জ্বালানি সার্ভিস', stops: ['sadarghat', 'sayedabad', 'kamalapur', 'dhaka', 'gazipur'], ticketPrice: 250, rewardTaka: 4800, requiresRefuel: true, desc: 'Depart Sadarghat river port through Kamalapur & Mohakhali! Refuel at a Petrol Pump before Gazipur.' },

    // === CHATTOGRAM DIVISION & HILL TRACTS MISSIONS ===
    { id: 'dhaka_chittagong', region: 'chattogram', highway: 'N1', nameEn: 'Dhaka → Chattogram (N1)', nameBn: 'ঢাকা থেকে চট্টগ্রাম', stops: ['sayedabad', 'narayanganj', 'cumilla', 'feni', 'chittagong'], ticketPrice: 580, rewardTaka: 9500, desc: 'Cross Meghna Bridge toll plaza, Cumilla & Feni Mohipal Flyover to Chattogram Port city.' },
    { id: 'dhaka_cumilla', region: 'chattogram', highway: 'N1', nameEn: 'Dhaka → Cumilla (N1)', nameBn: 'ঢাকা থেকে কুমিল্লা', stops: ['sayedabad', 'narayanganj', 'cumilla'], ticketPrice: 280, rewardTaka: 4200, desc: 'N1 intercity express across Meghna & Gomti Bridges to Cumilla.' },
    { id: 'coxs_teknaf_marine', region: 'chattogram', highway: 'N1/Marine Dr', nameEn: "Chattogram Port → Cox's Bazar → Teknaf Marine Drive", nameBn: 'চট্টগ্রাম বন্দর → কক্সবাজার → টেকনাফ মেরিন ড্রাইভ', stops: ['ctg_port', 'chittagong', 'coxsbazar', 'teknaf'], ticketPrice: 680, rewardTaka: 11200, desc: 'Scenic coastal drive from Chattogram Port across Karnaphuli Bridge and Bay of Bengal Marine Drive to Teknaf.' },
    { id: 'ctg_bandarban_rangamati', region: 'chattogram', highway: 'N107/N106', nameEn: 'Bandarban → Chattogram → Rangamati (Hill Tracts)', nameBn: 'বান্দরবান → চট্টগ্রাম → রাঙ্গামাটি পাহাড়ি মিশন', stops: ['bandarban', 'chittagong', 'rangamati'], ticketPrice: 440, rewardTaka: 7600, desc: 'Climb winding Chattogram Hill Tracts mountain highways connecting Bandarban hills and Kaptai Lake Rangamati.' },
    { id: 'ctg_khagrachhari', region: 'chattogram', highway: 'R160', nameEn: 'Chattogram Port → Khagrachhari Valley', nameBn: 'চট্টগ্রাম → খাগড়াছড়ি পাহাড়ি পথ', stops: ['ctg_port', 'chittagong', 'khagrachhari'], ticketPrice: 360, rewardTaka: 6200, desc: 'Navigate Hathazari–Fatikchhari hill valley highway up to Khagrachhari.' },
    { id: 'meghna_estuary_loop', region: 'chattogram', highway: 'R140/N104', nameEn: 'Chandpur → Lakshmipur → Noakhali → Feni → Cumilla', nameBn: 'চাঁদপুর-লক্ষ্মীপুর-নোয়াখালী-ফেনী-কুমিল্লা', stops: ['chandpur', 'lakshmipur', 'noakhali', 'feni', 'cumilla'], ticketPrice: 450, rewardTaka: 7900, desc: 'Complete southeastern estuary circuit linking Padma–Meghna river port Chandpur through Noakhali & Feni to Cumilla.' },

    // === RAJSHAHI DIVISION MISSIONS ===
    { id: 'rajshahi_mango_barind', region: 'rajshahi', highway: 'R680/R685', nameEn: 'Chapainawabganj → Rajshahi → Naogaon → Joypurhat → Bogura', nameBn: 'চাঁপাইনবাবগঞ্জ-রাজশাহী-নওগাঁ-জয়পুরহাট-বগুড়া', stops: ['chapainawabganj', 'rajshahi', 'naogaon', 'joypurhat', 'bogura'], ticketPrice: 520, rewardTaka: 8900, desc: 'Barind Tract & Padma heritage run from Mango Capital Chapainawabganj through Paharpur Naogaon & Joypurhat to Bogura.' },
    { id: 'pabna_lalon_kushtia', region: 'rajshahi', highway: 'N6/N704', nameEn: 'Sirajganj → Natore → Pabna → Lalon Shah Bridge → Kushtia', nameBn: 'সিরাজগঞ্জ-নাটোর-পাবনা-লালন শাহ সেতু-কুষ্টিয়া', stops: ['sirajganj', 'hatikumrul_mor', 'natore', 'pabna', 'kushtia'], ticketPrice: 480, rewardTaka: 8200, desc: 'Drive across Hatikumrul Golchottor, Bonpara, Pabna and cross the iconic Lalon Shah Bridge over Padma to Kushtia.' },

    // === RANGPUR DIVISION MISSIONS ===
    { id: 'dhaka_rangpur', region: 'rangpur', highway: 'N5', nameEn: 'Dhaka → Bogura → Rangpur (N5)', nameBn: 'ঢাকা থেকে রংপুর', stops: ['gabtoli', 'savar', 'chandra_mor', 'tangail', 'elenga_mor', 'sirajganj', 'hatikumrul_mor', 'bogura', 'gobindaganj_bazar', 'gaibandha', 'rangpur'], ticketPrice: 700, rewardTaka: 12400, desc: 'North Bengal N5 trunk route across Jamuna Bridge, Hatikumrul, Bogura & Gobindaganj to Rangpur.' },
    { id: 'rangpur_dinajpur_panchagarh', region: 'rangpur', highway: 'N5/N508', nameEn: 'Rangpur → Dinajpur → Thakurgaon → Panchagarh', nameBn: 'রংপুর-দিনাজপুর-ঠাকুরগাঁও-পঞ্চগড় উত্তরবঙ্গ', stops: ['rangpur', 'saidpur_mor', 'dinajpur', 'thakurgaon', 'boda_bazar', 'panchagarh'], ticketPrice: 460, rewardTaka: 7800, desc: 'Northwestern corridor via Dashmail Mor, Kantajew Dinajpur, Thakurgaon & Boda Bazar to Panchagarh.' },
    { id: 'rangpur_teesta_kurigram', region: 'rangpur', highway: 'N509/R570', nameEn: 'Rangpur → Teesta Bridge → Lalmonirhat → Kurigram', nameBn: 'রংপুর-তিস্তা সেতু-লালমনিরহাট-ধরলা সেতু-কুড়িগ্রাম', stops: ['rangpur', 'lalmonirhat', 'kurigram'], ticketPrice: 280, rewardTaka: 4900, desc: 'Cross both the Teesta Road Bridge and Dharla River Bridge serving northernmost border towns.' },

    // === KHULNA DIVISION MISSIONS ===
    { id: 'sundarbans_western_border', region: 'khulna', highway: 'N7/R760', nameEn: 'Bagerhat → Khulna → Satkhira → Jashore → Chuadanga → Meherpur', nameBn: 'বাগেরহাট-খুলনা-সাতক্ষীরা-যশোর-চুয়াডাঙ্গা-মেহেরপুর', stops: ['bagerhat', 'khulna', 'satkhira', 'jashore', 'jhenaidah', 'chuadanga', 'meherpur'], ticketPrice: 660, rewardTaka: 11800, desc: 'Full western Khulna Division run from Sundarbans gateway Bagerhat across Rupsha Bridge through Satkhira & Jashore to Meherpur.' },
    { id: 'faridpur_magura_kushtia', region: 'khulna', highway: 'N7/N704', nameEn: 'Faridpur → Magura → Jhenaidah → Kushtia', nameBn: 'ফরিদপুর-মাগুরা-ঝিনাইদহ-কুষ্টিয়া', stops: ['faridpur', 'magura', 'jhenaidah', 'kushtia'], ticketPrice: 360, rewardTaka: 6200, desc: 'Cross Kamarkhali Madhumati Bridge via Magura & Jhenaidah to cultural city Kushtia.' },

    // === BARISHAL DIVISION MISSIONS ===
    { id: 'barishal_khulna_coastal', region: 'barishal', highway: 'N7/R870/R890', nameEn: 'Khulna → Pirojpur (Bekutia Bridge) → Jhalokati → Barishal → Bhola Ferry', nameBn: 'খুলনা-পিরোজপুর-ঝালকাঠি-বরিশাল-ভোলা ফেরি', stops: ['khulna', 'bagerhat', 'pirojpur', 'jhalokati', 'barishal', 'bhola'], ticketPrice: 540, rewardTaka: 9600, desc: 'Southern river-delta route across Rupsha & Bekutia Kocha Bridges and the Veduria–Bhola island river ferry.' },
    { id: 'barishal_barguna_kuakata', region: 'barishal', highway: 'N8/R880', nameEn: 'Barishal → Payra Bridge → Patuakhali → Barguna', nameBn: 'বরিশাল-পায়রা সেতু-পটুয়াখালী-বরগুনা', stops: ['barishal', 'patuakhali', 'barguna'], ticketPrice: 290, rewardTaka: 5100, desc: 'Southern coastal service crossing Payra Bridge to Patuakhali & Barguna.' },

    // === SYLHET DIVISION MISSIONS ===
    { id: 'sylhet_haor_express', region: 'sylhet', highway: 'N2/R280', nameEn: 'Brahmanbaria → Habiganj → Moulvibazar → Sylhet → Sunamganj Haor', nameBn: 'ব্রাহ্মণবাড়িয়া-হবিগঞ্জ-মৌলভীবাজার-সিলেট-সুনামগঞ্জ হাওর', stops: ['brahmanbaria', 'habiganj', 'moulvibazar', 'sylhet', 'sunamganj'], ticketPrice: 510, rewardTaka: 9100, desc: 'N2 tea-hill journey across Keane Bridge to Sylhet and westward across Surma plains to Sunamganj Tanguar Haor gateway.' },
    { id: 'sylhet_tea_circuit', region: 'sylhet', highway: 'N2', nameEn: 'Moulvibazar → Sylhet → Lakkatura Tea Gardens', nameBn: 'মৌলভীবাজার → সিলেট → লাক্কাতুরা চা-বাগান', stops: ['moulvibazar', 'sylhet', 'sylhet_tea'], ticketPrice: 270, rewardTaka: 4600, desc: 'Scenic tea valley climb from Moulvibazar over Surma Keane Bridge into Lakkatura terraced tea hills.' },

    // === MYMENSINGH DIVISION MISSIONS ===
    { id: 'dhaka_mymensingh', region: 'mymensingh', highway: 'N3', nameEn: 'Dhaka → Mymensingh (N3)', nameBn: 'ঢাকা থেকে ময়মনসিংহ', stops: ['dhaka', 'gazipur', 'mymensingh'], ticketPrice: 320, rewardTaka: 4800, desc: 'Real N3 corridor north from Mohakhali via Gazipur & Bhaluka to Mymensingh Brahmaputra riverfront.' },
    { id: 'mymensingh_dhaka', region: 'mymensingh', highway: 'N4/N3', nameEn: 'Mymensingh → Dhaka (N4/N3)', nameBn: 'ময়মনসিংহ থেকে ঢাকা', stops: ['mymensingh', 'tangail', 'chandra_mor', 'gazipur', 'dhaka'], ticketPrice: 350, rewardTaka: 5400, desc: 'Depart Mymensingh through Madhupur forest, Tangail & Chandra Tri-Mor to Dhaka.' },
    { id: 'mymensingh_garo_hills', region: 'mymensingh', highway: 'N4/R460/R370', nameEn: 'Tangail → Jamalpur → Sherpur → Mymensingh → Netrokona', nameBn: 'টাঙ্গাইল-জামালপুর-শেরপুর-ময়মনসিংহ-নেত্রকোণা', stops: ['tangail', 'jamalpur', 'sherpur', 'mymensingh', 'netrokona'], ticketPrice: 440, rewardTaka: 7600, desc: 'Complete all 4 Mymensingh Division districts from Madhupur–Jamalpur & Garo Hills Sherpur to Old Brahmaputra & Birishiri Netrokona.' }
  ];

  const PAINT_PALETTE = [
    { name: 'Emerald BD', hex: '#0c7c48' },
    { name: 'Hanif Vermilion', hex: '#d9480f' },
    { name: 'Ena Royal Blue', hex: '#1d4ed8' },
    { name: 'Shohagh Crimson', hex: '#9f1239' },
    { name: 'Padma Teal', hex: '#0f766e' },
    { name: 'Mustard Gold', hex: '#ca8a04' },
    { name: 'Pearl Silver', hex: '#475569' },
    { name: 'Night Violet', hex: '#6d28d9' }
  ];

  const UPGRADE_DEFINITIONS = [
    { id: 'engine', name: 'V8 Twin-Turbo Power Engine', desc: '+12% Top Speed & +18% Torque per level', maxLevel: 5, baseCost: 3500 },
    { id: 'brakes', name: 'Pneumatic ABS Brakes', desc: '+14% Stopping Power', maxLevel: 3, baseCost: 3500 },
    { id: 'suspension', name: 'Highway Air Suspension', desc: '+12% Corner Grip & Stability', maxLevel: 3, baseCost: 3200 },
    { id: 'tank', name: 'Auxiliary Fuel Tank', desc: '+20% Fuel Efficiency', maxLevel: 3, baseCost: 2800 }
  ];

  const REPAIR_SERVICES = [
    { id: 'engine', name: 'Engine & Radiator Overhaul', parts: ['engine', 'radiator'], baseCost: 1400 },
    { id: 'tires', name: 'Tire Replacement & Inflation', parts: ['tires'], baseCost: 1100 },
    { id: 'body', name: 'Body Panels & Bumpers Repair', parts: ['frontBumper', 'rearBumper', 'bodyPanels', 'doors'], baseCost: 1200 },
    { id: 'windshield', name: 'Windshield & Side Glass', parts: ['windshield', 'sideWindows'], baseCost: 950 },
    { id: 'lights', name: 'Headlights & Tail Lights', parts: ['headlights', 'tailLights'], baseCost: 650 },
    { id: 'brakes', name: 'Brake Pads & Air Line Service', parts: [], baseCost: 850 },
    { id: 'suspension', name: 'Air Suspension Alignment', parts: ['suspension'], baseCost: 950 },
    { id: 'oil', name: 'Engine Oil, Coolant & Battery', parts: [], baseCost: 600 },
    { id: 'full', name: 'Complete Full Coach Service', parts: 'ALL', baseCost: 3200 }
  ];

  const FUEL_PRICES = { diesel: 105, petrol: 125 };

  // Phase 5 Catalogs
  const COMPANY_LOGOS = ['🦅', '🐅', '🌿', '👑', '⚡', '🌉', '🚌', '🛡️'];

  const COMPANY_FACILITIES = {
    office: [
      { level: 1, name: 'Sayedabad Booking Counter', maxRoutes: 3, cost: 0 },
      { level: 2, name: 'Mohakhali Regional Office', maxRoutes: 6, cost: 18000 },
      { level: 3, name: 'Motijheel Transport HQ Tower', maxRoutes: 12, cost: 45000 }
    ],
    garage: [
      { level: 1, name: '2-Bay Roadside Depot', maxFleet: 3, repairDiscount: 0, cost: 0 },
      { level: 2, name: 'Tejgaon Fleet Maintenance Yard', maxFleet: 6, repairDiscount: 15, cost: 22000 },
      { level: 3, name: 'Gazipur Automated Mega Garage', maxFleet: 12, repairDiscount: 30, cost: 52000 }
    ]
  };

  const STAFF_CANDIDATES = [
    { id: 'st_rafiq', name: 'Md. Rafiqul Islam', role: 'driver', roleLabel: 'Bus Driver', experience: 7, skill: 88, dailySalary: 850, hireFee: 2500 },
    { id: 'st_sohel', name: 'Sohel Rana', role: 'driver', roleLabel: 'Bus Driver', experience: 4, skill: 78, dailySalary: 680, hireFee: 1800 },
    { id: 'st_kamal', name: 'Kamal Hossain', role: 'driver', roleLabel: 'Bus Driver', experience: 10, skill: 95, dailySalary: 1100, hireFee: 3600 },
    { id: 'st_rubel', name: 'Rubel Mia', role: 'assistant', roleLabel: 'Assistant Driver', experience: 3, skill: 76, dailySalary: 450, hireFee: 1100 },
    { id: 'st_faruk', name: 'Faruk Ahmed', role: 'conductor', roleLabel: 'Conductor', experience: 5, skill: 84, dailySalary: 520, hireFee: 1400 },
    { id: 'st_jamil', name: 'Jamil Uddin', role: 'conductor', roleLabel: 'Conductor', experience: 8, skill: 92, dailySalary: 640, hireFee: 1900 },
    { id: 'st_sumon', name: 'Sumon Barua', role: 'mechanic', roleLabel: 'Mechanic', experience: 6, skill: 89, dailySalary: 720, hireFee: 2200 },
    { id: 'st_nasrin', name: 'Nasrin Sultana', role: 'manager', roleLabel: 'Office Manager', experience: 9, skill: 94, dailySalary: 980, hireFee: 3200 }
  ];

  const LOAN_OFFERS = [
    { id: 'loan_starter', name: 'Working Capital Micro-Loan', principal: 20000, interestPct: 12, dailyPayment: 2800 },
    { id: 'loan_fleet', name: 'Fleet Expansion Credit', principal: 60000, interestPct: 15, dailyPayment: 6900 },
    { id: 'loan_terminal', name: 'Terminal Infrastructure Bond', principal: 140000, interestPct: 18, dailyPayment: 13800 }
  ];

  const ACHIEVEMENTS_CATALOG = [
    { id: 'ach_first_trip', title: 'First Intercity Run', desc: 'Complete 1 route mission', reward: 2000, check: (s) => s.tripsCompleted >= 1 },
    { id: 'ach_company', title: 'Transport Founder', desc: 'Customize your own bus company', reward: 2500, check: (s) => s.company && s.company.created },
    { id: 'ach_fleet3', title: 'Growing Fleet', desc: 'Own 3 buses in your company fleet', reward: 5000, check: (s) => s.company && s.company.fleet.length >= 3 },
    { id: 'ach_terminal', title: 'Terminal Tycoon', desc: 'Own a regional bus terminal', reward: 6000, check: (s) => s.company && Object.values(s.company.terminals || {}).some((t) => t.owned) },
    { id: 'ach_distance50', title: 'Bengal Highway Veteran', desc: 'Drive 50 km across Bangladesh', reward: 4500, check: (s) => s.totalDistanceKm >= 50 },
    { id: 'ach_convoy', title: 'Convoy Commander', desc: 'Complete a multiplayer convoy run', reward: 5500, check: (s) => s.progression && s.progression.convoysCompleted >= 1 },
    { id: 'ach_bd_16', title: 'Bangladesh Explorer', desc: 'Visit 16 districts across Bangladesh', reward: 8000, check: (s) => Array.isArray(s.visitedDistricts) && s.visitedDistricts.length >= 16 },
    { id: 'ach_bd_64', title: '64 Districts Legend', desc: 'Visit all 64 districts of Bangladesh', reward: 30000, check: (s) => Array.isArray(s.visitedDistricts) && s.visitedDistricts.length >= 64 }
  ];

  const WEEKLY_COMPETITIONS = [
    { id: 'weekly_distance', title: 'Bengal Highway Marathon', desc: 'Total kilometers driven across intercity corridors', metricLabel: 'km', rewardTaka: 10000 },
    { id: 'weekly_safe', title: 'Zero-Incident Safe Driver', desc: 'Highest driving safety rating on active routes', metricLabel: '% safety', rewardTaka: 8500 },
    { id: 'weekly_revenue', title: 'Top Transport Mogul', desc: 'Highest total transport company revenue earned', metricLabel: '৳ rev', rewardTaka: 12000 },
    { id: 'weekly_convoy', title: 'Convoy Teamwork Cup', desc: 'Most synchronized online convoy runs completed', metricLabel: 'convoys', rewardTaka: 9500 }
  ];

  const QUALITY_PRESETS = {
    low: { maxPixelRatio: 1.0, shadows: false, shadowMapSize: 512, fogFar: 280, streamRadius: 430, trafficCount: 14, treeDensity: 0.55, shadowQuality: 'off', reflectionQuality: 'low', textureQuality: 'low', particles: 0.35, targetFps: 30 },
    medium: { maxPixelRatio: 1.35, shadows: true, shadowMapSize: 1024, fogFar: 420, streamRadius: 620, trafficCount: 20, treeDensity: 0.85, shadowQuality: 'medium', reflectionQuality: 'medium', textureQuality: 'medium', particles: 0.65, targetFps: 45 },
    high: { maxPixelRatio: 1.85, shadows: true, shadowMapSize: 2048, fogFar: 580, streamRadius: 820, trafficCount: 26, treeDensity: 1.0, shadowQuality: 'high', reflectionQuality: 'high', textureQuality: 'high', particles: 0.9, targetFps: 60 },
    ultra: { maxPixelRatio: 2.2, shadows: true, shadowMapSize: 2048, fogFar: 740, streamRadius: 1050, trafficCount: 32, treeDensity: 1.0, shadowQuality: 'high', reflectionQuality: 'high', textureQuality: 'high', particles: 1.0, targetFps: 60 }
  };

  const TIME_PRESETS = {
    early_morning: { label: 'Early Morning', clock: 5.3, skyTop: '#1e293b', skyBottom: '#93c5fd', fogColor: '#cbd5e1', sunColor: '#fed7aa', sunIntensity: 0.55, hemiSky: '#93c5fd', hemiGround: '#1e3a2f', hemiIntensity: 0.48, isDark: true },
    sunrise: { label: 'Sunrise', clock: 6.4, skyTop: '#3b82f6', skyBottom: '#fdba74', fogColor: '#fed7aa', sunColor: '#ffedd5', sunIntensity: 0.98, hemiSky: '#fed7aa', hemiGround: '#365314', hemiIntensity: 0.65, isDark: false },
    morning: { label: 'Morning', clock: 9.2, skyTop: '#38bdf8', skyBottom: '#e0f2fe', fogColor: '#d9eef7', sunColor: '#fffbeb', sunIntensity: 1.28, hemiSky: '#bae6fd', hemiGround: '#3d5e3a', hemiIntensity: 0.74, isDark: false },
    afternoon: { label: 'Afternoon', clock: 14.0, skyTop: '#1d4ed8', skyBottom: '#bae6fd', fogColor: '#bfe3f7', sunColor: '#fffbeb', sunIntensity: 1.48, hemiSky: '#e0f2fe', hemiGround: '#3b6633', hemiIntensity: 0.82, isDark: false },
    golden_hour: { label: 'Golden Hour', clock: 17.1, skyTop: '#1e3a8a', skyBottom: '#fbbf24', fogColor: '#fde68a', sunColor: '#fcd34d', sunIntensity: 1.2, hemiSky: '#fde68a', hemiGround: '#422006', hemiIntensity: 0.68, isDark: false },
    sunset: { label: 'Sunset', clock: 18.2, skyTop: '#312e81', skyBottom: '#f97316', fogColor: '#d97757', sunColor: '#fb923c', sunIntensity: 0.88, hemiSky: '#fdba74', hemiGround: '#2f293b', hemiIntensity: 0.54, isDark: true },
    evening: { label: 'Evening', clock: 19.6, skyTop: '#0f172a', skyBottom: '#334155', fogColor: '#1e293b', sunColor: '#93c5fd', sunIntensity: 0.42, hemiSky: '#475569', hemiGround: '#0f172a', hemiIntensity: 0.4, isDark: true },
    night: { label: 'Midnight', clock: 23.5, skyTop: '#020617', skyBottom: '#0f172a', fogColor: '#091122', sunColor: '#bae6fd', sunIntensity: 0.34, hemiSky: '#334155', hemiGround: '#08100d', hemiIntensity: 0.34, isDark: true }
  };

  const WEATHER_PRESETS = {
    sunny: { id: 'sunny', name: 'Sunny', icon: '☀️', rainIntensity: 0, windStrength: 0.14, fogScale: 1.0, fogParticles: 0.0, dustIntensity: 0.18, cloudCover: 0.25, darkness: 0, gripFactor: 1.0, thunder: false, fogWarning: null },
    cloudy: { id: 'cloudy', name: 'Cloudy', icon: '⛅', rainIntensity: 0, windStrength: 0.28, fogScale: 0.85, fogParticles: 0.10, dustIntensity: 0.25, cloudCover: 0.72, darkness: 0.18, gripFactor: 0.98, thunder: false, fogWarning: null },
    dusty: { id: 'dusty', name: 'Dusty Wind', icon: '💨', rainIntensity: 0, windStrength: 0.88, fogScale: 0.48, fogParticles: 0.15, dustIntensity: 1.0, cloudCover: 0.45, darkness: 0.16, gripFactor: 0.90, thunder: false, fogWarning: '💨 DUSTY HIGHWAY WIND — REDUCED VISIBILITY' },
    light_rain: { id: 'light_rain', name: 'Light Rain', icon: '🌦️', rainIntensity: 0.42, windStrength: 0.38, fogScale: 0.72, fogParticles: 0.22, dustIntensity: 0.0, cloudCover: 0.84, darkness: 0.28, gripFactor: 0.84, thunder: false, fogWarning: null },
    heavy_rain: { id: 'heavy_rain', name: 'Heavy Rain', icon: '🌧️', rainIntensity: 0.88, windStrength: 0.65, fogScale: 0.54, fogParticles: 0.42, dustIntensity: 0.0, cloudCover: 0.96, darkness: 0.42, gripFactor: 0.73, thunder: false, fogWarning: '🌧️ HEAVY RAIN — WET ASPHALT & REDUCED GRIP' },
    thunderstorm: { id: 'thunderstorm', name: 'Thunderstorm', icon: '⛈️', rainIntensity: 1.0, windStrength: 0.95, fogScale: 0.42, fogParticles: 0.55, dustIntensity: 0.0, cloudCover: 1.0, darkness: 0.58, gripFactor: 0.66, thunder: true, fogWarning: '⛈️ THUNDERSTORM — STRONG WINDS & LOW VISIBILITY' },
    fog: { id: 'fog', name: 'Highway Fog', icon: '🌫️', rainIntensity: 0, windStrength: 0.14, fogScale: 0.24, fogParticles: 0.92, dustIntensity: 0.0, cloudCover: 0.55, darkness: 0.22, gripFactor: 0.92, thunder: false, fogWarning: '🌫️ DENSE HIGHWAY FOG — TURN ON HEADLIGHTS & SLOW DOWN' },
    winter_mist: { id: 'winter_mist', name: 'Winter Mist', icon: '❄️', rainIntensity: 0, windStrength: 0.20, fogScale: 0.18, fogParticles: 1.0, dustIntensity: 0.0, cloudCover: 0.65, darkness: 0.26, gripFactor: 0.88, thunder: false, fogWarning: '🌫️ WINTER MIST ALERT — REDUCE SPEED BELOW 50 KM/H' }
  };

  const STORAGE_KEY = 'bd_bus_sim_ultimate_v3';

  function createDefaultParts() {
    return {
      frontBumper: 100, rearBumper: 100, windshield: 100, sideWindows: 100,
      headlights: 100, tailLights: 100, doors: 100, tires: 100,
      engine: 100, radiator: 100, suspension: 100, bodyPanels: 100
    };
  }

  function createDefaultMechanics() {
    return {
      tirePressure: 100, tireWear: 100, punctured: false, engineTemp: 82,
      oilLevel: 100, coolantLevel: 100, battery: 100, brakeCondition: 100
    };
  }

  function createDefaultCompany(unlockedIds) {
    const baseBuses = Array.isArray(unlockedIds) && unlockedIds.length ? unlockedIds : ['green_line', 'hanif'];
    return {
      created: false,
      name: 'Bengal Express Transport',
      logo: '🦅',
      color: '#0c7c48',
      slogan: 'Safe & Reliable Intercity Travel',
      officeLevel: 1,
      garageLevel: 1,
      reputation: 74,
      level: 1,
      revenueTotal: 0,
      dayNumber: 1,
      fleet: baseBuses.map((bid, i) => ({
        uid: `fleet_${bid}_${i + 1}`,
        busId: bid,
        nickname: `${(BUS_CATALOG.find((b) => b.id === bid) || BUS_CATALOG[0]).name} #${i + 1}`,
        paint: (BUS_CATALOG.find((b) => b.id === bid) || BUS_CATALOG[0]).primaryColor,
        condition: 100,
        fuel: 100,
        assignedDriverId: null,
        assignedRouteId: null,
        rentalActive: false,
        totalIncome: 0,
        mileageKm: 0
      })),
      staff: [],
      customRoutes: [],
      terminals: {},
      loans: [],
      dailyReports: []
    };
  }

  function createDefaultProgression() {
    return {
      driverName: 'BD Captain',
      friendCode: '',
      xp: 0,
      level: 1,
      drivingRating: 96,
      convoysCompleted: 0,
      achievements: [],
      lastDailyClaimDate: '',
      dailyStreak: 0
    };
  }

  function createDefaultSave() {
    return {
      taka: 28000,
      totalDistanceKm: 0,
      tripsCompleted: 0,
      selectedBusId: 'green_line',
      selectedFleetUid: 'fleet_green_line_1',
      selectedRouteId: 'dhaka_mymensingh',
      unlockedBuses: ['green_line', 'hanif'],
      customColors: {},
      upgrades: { engine: 0, brakes: 0, suspension: 0, tank: 0 },
      health: 100,
      fuel: 100,
      cleanliness: 100,
      fatigue: 0,
      parts: createDefaultParts(),
      mechanics: createDefaultMechanics(),
      insurance: { active: true, coveragePct: 70, claimsCount: 0, premiumCost: 2500 },
      economyHistory: [],
      maintenanceLog: [],
      accidentReports: [],
      completedRouteIds: [],
      visitedDistricts: [],
      company: createDefaultCompany(['green_line', 'hanif']),
      progression: createDefaultProgression(),
      settings: {
        quality: 'medium',
        transmission: 'auto',
        timeOfDay: 'afternoon',
        dayCycleMode: 'auto',
        clockHours: 14.0,
        weather: 'sunny',
        weatherMode: 'auto',
        shadowQuality: 'medium',
        reflectionQuality: 'medium',
        textureQuality: 'medium',
        drawDistance: 1.0,
        weatherEffects: true,
        fpsLimit: 60,
        soundOn: true,
        volume: 80,
        showFps: true,
        sensitivity: 1.0,
        fatigueOn: true,
        robberyOn: true
      }
    };
  }

  function loadSave() {
    const def = createDefaultSave();
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      const mergedSettings = { ...def.settings, ...(parsed.settings || {}) };
      if (mergedSettings.weather === 'clear') mergedSettings.weather = 'sunny';
      if (mergedSettings.weather === 'rainy') mergedSettings.weather = 'heavy_rain';
      if (!WEATHER_PRESETS[mergedSettings.weather]) mergedSettings.weather = 'sunny';
      const unlocked = Array.isArray(parsed.unlockedBuses) ? parsed.unlockedBuses : def.unlockedBuses;
      const defComp = createDefaultCompany(unlocked);
      const mergedCompany = {
        ...defComp,
        ...(parsed.company || {}),
        fleet: Array.isArray(parsed.company && parsed.company.fleet) && parsed.company.fleet.length
          ? parsed.company.fleet
          : defComp.fleet,
        staff: Array.isArray(parsed.company && parsed.company.staff) ? parsed.company.staff : [],
        customRoutes: Array.isArray(parsed.company && parsed.company.customRoutes) ? parsed.company.customRoutes : [],
        terminals: (parsed.company && parsed.company.terminals) || {},
        loans: Array.isArray(parsed.company && parsed.company.loans) ? parsed.company.loans : [],
        dailyReports: Array.isArray(parsed.company && parsed.company.dailyReports) ? parsed.company.dailyReports.slice(0, 20) : []
      };
      return {
        ...def,
        ...parsed,
        upgrades: { ...def.upgrades, ...(parsed.upgrades || {}) },
        customColors: { ...(parsed.customColors || {}) },
        parts: { ...def.parts, ...(parsed.parts || {}) },
        mechanics: { ...def.mechanics, ...(parsed.mechanics || {}) },
        insurance: { ...def.insurance, ...(parsed.insurance || {}) },
        company: mergedCompany,
        progression: { ...def.progression, ...(parsed.progression || {}) },
        settings: mergedSettings,
        unlockedBuses: unlocked,
        economyHistory: Array.isArray(parsed.economyHistory) ? parsed.economyHistory.slice(0, 40) : [],
        maintenanceLog: Array.isArray(parsed.maintenanceLog) ? parsed.maintenanceLog.slice(0, 30) : [],
        accidentReports: Array.isArray(parsed.accidentReports) ? parsed.accidentReports.slice(0, 20) : [],
        completedRouteIds: Array.isArray(parsed.completedRouteIds) ? parsed.completedRouteIds : [],
        visitedDistricts: Array.isArray(parsed.visitedDistricts) ? parsed.visitedDistricts : []
      };
    } catch (_) {
      return def;
    }
  }

  function persistSave(save) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
      }
    } catch (_) {}
  }

  global.BDGameConfig = {
    BUS_CATALOG,
    BANGLADESH_LOCATIONS,
    ROAD_NETWORK_EDGES,
    ROUTES_CATALOG,
    PAINT_PALETTE,
    UPGRADE_DEFINITIONS,
    REPAIR_SERVICES,
    FUEL_PRICES,
    COMPANY_LOGOS,
    COMPANY_FACILITIES,
    STAFF_CANDIDATES,
    LOAN_OFFERS,
    ACHIEVEMENTS_CATALOG,
    WEEKLY_COMPETITIONS,
    QUALITY_PRESETS,
    TIME_PRESETS,
    WEATHER_PRESETS,
    createDefaultParts,
    createDefaultMechanics,
    createDefaultCompany,
    createDefaultProgression,
    computeRouteStats,
    buildCustomBangladeshMission,
    loadSave,
    persistSave
  };
})(typeof window !== 'undefined' ? window : globalThis);
