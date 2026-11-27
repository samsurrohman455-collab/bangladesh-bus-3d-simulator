(function (global) {
  'use strict';

  const {
    BUS_CATALOG,
    BANGLADESH_LOCATIONS,
    ROUTES_CATALOG,
    COMPANY_FACILITIES,
    STAFF_CANDIDATES,
    LOAN_OFFERS,
    ACHIEVEMENTS_CATALOG,
    createDefaultCompany,
    createDefaultProgression,
    persistSave
  } = global.BDGameConfig;

  class BDCompanyManager {
    constructor(save, mechanics) {
      this.save = save;
      this.mechanics = mechanics;
      this.dayTimer = 0;
      this.ensureInitialized();
    }

    ensureInitialized() {
      if (!this.save.company) {
        this.save.company = createDefaultCompany(this.save.unlockedBuses);
      }
      if (!this.save.progression) {
        this.save.progression = createDefaultProgression();
      }
      if (!Array.isArray(this.save.company.fleet) || this.save.company.fleet.length === 0) {
        this.save.company.fleet = createDefaultCompany(this.save.unlockedBuses).fleet;
      }
      if (!this.save.selectedFleetUid && this.save.company.fleet.length > 0) {
        const match = this.save.company.fleet.find((f) => f.busId === this.save.selectedBusId) || this.save.company.fleet[0];
        this.save.selectedFleetUid = match.uid;
      }
    }

    getActiveFleetBus() {
      return (
        this.save.company.fleet.find((f) => f.uid === this.save.selectedFleetUid) ||
        this.save.company.fleet.find((f) => f.busId === this.save.selectedBusId) ||
        this.save.company.fleet[0]
      );
    }

    syncActiveBusState() {
      const active = this.getActiveFleetBus();
      if (!active) return;
      active.condition = Math.max(0, Math.min(100, Math.round(this.save.health)));
      active.fuel = Math.max(0, Math.min(100, Math.round(this.save.fuel)));
      active.paint = this.save.customColors[active.busId] || active.paint;
    }

    getOfficeConfig() {
      const lvl = this.save.company.officeLevel || 1;
      return COMPANY_FACILITIES.office.find((o) => o.level === lvl) || COMPANY_FACILITIES.office[0];
    }

    getGarageConfig() {
      const lvl = this.save.company.garageLevel || 1;
      return COMPANY_FACILITIES.garage.find((g) => g.level === lvl) || COMPANY_FACILITIES.garage[0];
    }

    customizeCompany({ name, logo, color, slogan }) {
      const c = this.save.company;
      const cleanName = (name || '').trim().slice(0, 48);
      if (cleanName.length < 2) {
        return { ok: false, msg: 'Company name must be at least 2 characters.' };
      }
      c.name = cleanName;
      if (logo) c.logo = logo;
      if (color) c.color = color;
      if (slogan !== undefined) c.slogan = (slogan || '').trim().slice(0, 64) || c.slogan;
      c.created = true;
      this.checkAchievements();
      persistSave(this.save);
      return { ok: true, msg: `${c.logo} ${c.name} identity updated!` };
    }

    upgradeFacility(kind) {
      const c = this.save.company;
      const list = COMPANY_FACILITIES[kind];
      const curLvl = kind === 'office' ? (c.officeLevel || 1) : (c.garageLevel || 1);
      const next = list.find((f) => f.level === curLvl + 1);
      if (!next) return { ok: false, msg: `${kind.toUpperCase()} is already at maximum level!` };
      if (this.save.taka < next.cost) {
        return { ok: false, msg: `Need ৳ ${next.cost.toLocaleString()} to upgrade to ${next.name}.` };
      }
      this.save.taka -= next.cost;
      if (kind === 'office') c.officeLevel = next.level;
      else c.garageLevel = next.level;
      c.reputation = Math.min(100, (c.reputation || 70) + 4);
      this.mechanics.logEconomy('expense', `Company ${kind} upgrade: ${next.name}`, next.cost);
      this.awardXP(180);
      persistSave(this.save);
      return { ok: true, msg: `Upgraded to ${next.name}!` };
    }

    buyBusToFleet(busId) {
      const spec = BUS_CATALOG.find((b) => b.id === busId);
      if (!spec) return { ok: false, msg: 'Unknown bus model.' };
      const garage = this.getGarageConfig();
      if (this.save.company.fleet.length >= garage.maxFleet) {
        return { ok: false, msg: `Garage capacity full (${garage.maxFleet} buses). Upgrade Garage first!` };
      }
      const price = Math.max(6000, spec.price || 10000);
      if (this.save.taka < price) {
        return { ok: false, msg: `Need ৳ ${price.toLocaleString()} to buy ${spec.name}.` };
      }
      this.save.taka -= price;
      if (!this.save.unlockedBuses.includes(busId)) {
        this.save.unlockedBuses.push(busId);
      }
      const uid = `fleet_${busId}_${Date.now().toString(36).slice(-4)}`;
      const entry = {
        uid,
        busId,
        nickname: `${spec.name} #${this.save.company.fleet.length + 1}`,
        paint: spec.primaryColor,
        condition: 100,
        fuel: 100,
        assignedDriverId: null,
        assignedRouteId: null,
        rentalActive: false,
        totalIncome: 0,
        mileageKm: 0
      };
      this.save.company.fleet.push(entry);
      this.save.selectedBusId = busId;
      this.save.selectedFleetUid = uid;
      this.save.health = 100;
      this.save.fuel = 100;
      this.mechanics.logEconomy('expense', `Purchased ${spec.name} (${spec.busType})`, price);
      this.awardXP(220);
      this.checkAchievements();
      persistSave(this.save);
      return { ok: true, entry, msg: `Added ${spec.name} (${spec.busType}) to your fleet!` };
    }

    sellFleetBus(fleetUid) {
      const fleet = this.save.company.fleet;
      if (fleet.length <= 1) {
        return { ok: false, msg: 'You must keep at least 1 active bus in your company!' };
      }
      const idx = fleet.findIndex((f) => f.uid === fleetUid);
      if (idx === -1) return { ok: false, msg: 'Bus not found.' };
      const item = fleet[idx];
      const spec = BUS_CATALOG.find((b) => b.id === item.busId) || BUS_CATALOG[0];
      const baseVal = Math.max(7000, spec.price || 11000);
      const resale = Math.round(baseVal * 0.65 * (0.5 + 0.5 * ((item.condition || 100) / 100)));
      fleet.splice(idx, 1);
      this.save.taka += resale;
      if (this.save.selectedFleetUid === fleetUid) {
        this.selectFleetBus(fleet[0].uid);
      }
      this.mechanics.logEconomy('income', `Sold Fleet Bus: ${item.nickname}`, resale);
      persistSave(this.save);
      return { ok: true, msg: `Sold ${item.nickname} for +৳ ${resale.toLocaleString()}` };
    }

    selectFleetBus(fleetUid) {
      this.syncActiveBusState();
      const target = this.save.company.fleet.find((f) => f.uid === fleetUid);
      if (!target) return { ok: false, msg: 'Fleet bus not found.' };
      this.save.selectedFleetUid = target.uid;
      this.save.selectedBusId = target.busId;
      this.save.health = target.condition ?? 100;
      this.save.fuel = target.fuel ?? 100;
      if (target.paint) {
        this.save.customColors[target.busId] = target.paint;
      }
      persistSave(this.save);
      return { ok: true, bus: target, msg: `Active Bus switched to ${target.nickname}` };
    }

    toggleRentBus(fleetUid) {
      const bus = this.save.company.fleet.find((f) => f.uid === fleetUid);
      if (!bus) return { ok: false, msg: 'Bus not found.' };
      if (bus.uid === this.save.selectedFleetUid && !bus.rentalActive) {
        return { ok: false, msg: 'Switch to another active bus before renting out this coach!' };
      }
      bus.rentalActive = !bus.rentalActive;
      if (bus.rentalActive) {
        bus.assignedRouteId = null;
      }
      persistSave(this.save);
      return {
        ok: true,
        msg: bus.rentalActive
          ? `${bus.nickname} listed for daily charter rental income!`
          : `${bus.nickname} returned from charter rental.`
      };
    }

    serviceFleetBus(fleetUid, kind) {
      const bus = this.save.company.fleet.find((f) => f.uid === fleetUid);
      if (!bus) return { ok: false, msg: 'Bus not found.' };
      const discount = 1 - (this.getGarageConfig().repairDiscount || 0) / 100;
      if (kind === 'repair') {
        const missing = Math.max(0, 100 - (bus.condition || 100));
        if (missing <= 1) return { ok: false, msg: `${bus.nickname} is already in top condition.` };
        const cost = Math.round(missing * 32 * discount);
        if (this.save.taka < cost) return { ok: false, msg: `Need ৳ ${cost} to repair ${bus.nickname}.` };
        this.save.taka -= cost;
        bus.condition = 100;
        if (bus.uid === this.save.selectedFleetUid) this.save.health = 100;
        this.mechanics.logEconomy('expense', `Fleet Repair: ${bus.nickname}`, cost);
        persistSave(this.save);
        return { ok: true, msg: `${bus.nickname} repaired to 100% (-৳ ${cost})` };
      } else {
        const missing = Math.max(0, 100 - (bus.fuel || 100));
        if (missing <= 1) return { ok: false, msg: `${bus.nickname} fuel tank is already full.` };
        const cost = Math.round(missing * 95);
        if (this.save.taka < cost) return { ok: false, msg: `Need ৳ ${cost} to refuel ${bus.nickname}.` };
        this.save.taka -= cost;
        bus.fuel = 100;
        if (bus.uid === this.save.selectedFleetUid) this.save.fuel = 100;
        this.mechanics.logEconomy('expense', `Fleet Refuel: ${bus.nickname}`, cost);
        persistSave(this.save);
        return { ok: true, msg: `${bus.nickname} refueled to 100% (-৳ ${cost})` };
      }
    }

    assignBusDriver(fleetUid, staffId) {
      const bus = this.save.company.fleet.find((f) => f.uid === fleetUid);
      if (!bus) return { ok: false, msg: 'Bus not found.' };
      if (!staffId) {
        bus.assignedDriverId = null;
        persistSave(this.save);
        return { ok: true, msg: `Unassigned driver from ${bus.nickname}.` };
      }
      // Unassign driver from any previous bus
      this.save.company.fleet.forEach((f) => {
        if (f.assignedDriverId === staffId) f.assignedDriverId = null;
      });
      bus.assignedDriverId = staffId;
      bus.rentalActive = false;
      persistSave(this.save);
      const staff = this.save.company.staff.find((s) => s.id === staffId);
      return { ok: true, msg: `Assigned ${staff ? staff.name : 'Driver'} to ${bus.nickname}` };
    }

    assignBusRoute(fleetUid, routeId) {
      const bus = this.save.company.fleet.find((f) => f.uid === fleetUid);
      if (!bus) return { ok: false, msg: 'Bus not found.' };
      bus.assignedRouteId = routeId || null;
      if (routeId) bus.rentalActive = false;
      persistSave(this.save);
      return { ok: true, msg: routeId ? `Assigned route schedule to ${bus.nickname}` : 'Route cleared.' };
    }

    hireStaff(candidateId) {
      const cand = STAFF_CANDIDATES.find((c) => c.id === candidateId);
      if (!cand) return { ok: false, msg: 'Staff candidate not found.' };
      if (this.save.company.staff.some((s) => s.id === candidateId)) {
        return { ok: false, msg: `${cand.name} is already on your payroll.` };
      }
      if (this.save.taka < cand.hireFee) {
        return { ok: false, msg: `Need ৳ ${cand.hireFee.toLocaleString()} signing bonus to hire ${cand.name}.` };
      }
      this.save.taka -= cand.hireFee;
      this.save.company.staff.push({
        ...cand,
        shift: 'Morning (07:00)',
        satisfaction: 88,
        performance: cand.skill
      });
      this.mechanics.logEconomy('expense', `Hired ${cand.roleLabel}: ${cand.name}`, cand.hireFee);
      this.awardXP(90);
      persistSave(this.save);
      return { ok: true, msg: `Hired ${cand.name} (${cand.roleLabel})!` };
    }

    fireStaff(staffId) {
      const idx = this.save.company.staff.findIndex((s) => s.id === staffId);
      if (idx === -1) return { ok: false, msg: 'Staff not found.' };
      const [removed] = this.save.company.staff.splice(idx, 1);
      this.save.company.fleet.forEach((f) => {
        if (f.assignedDriverId === staffId) f.assignedDriverId = null;
      });
      persistSave(this.save);
      return { ok: true, msg: `Released ${removed.name} from staff roster.` };
    }

    cycleStaffShift(staffId) {
      const s = this.save.company.staff.find((x) => x.id === staffId);
      if (!s) return { ok: false, msg: 'Employee not found.' };
      const shifts = ['Morning (07:00)', 'Afternoon (14:00)', 'Night Coach (22:00)'];
      const next = shifts[(shifts.indexOf(s.shift) + 1) % shifts.length];
      s.shift = next;
      persistSave(this.save);
      return { ok: true, msg: `${s.name} scheduled for ${next}` };
    }

    createCustomRoute({ fromId, toId, departureTime, ticketPrice, busUid }) {
      const office = this.getOfficeConfig();
      if (this.save.company.customRoutes.length >= office.maxRoutes) {
        return { ok: false, msg: `Office permits max ${office.maxRoutes} custom routes. Upgrade Company Office!` };
      }
      if (!fromId || !toId || fromId === toId) {
        return { ok: false, msg: 'Select two different terminals for your route.' };
      }
      const fromLoc = BANGLADESH_LOCATIONS[fromId];
      const toLoc = BANGLADESH_LOCATIONS[toId];
      const Geo = global.BDGeoData;
      const roadPath = Geo && Geo.findShortestRoadPath ? Geo.findShortestRoadPath(fromId, toId) : null;
      const fallbackKm = Geo && Geo.haversineKm
        ? Geo.haversineKm(fromLoc.lat, fromLoc.lon, toLoc.lat, toLoc.lon)
        : Math.hypot(toLoc.x - fromLoc.x, toLoc.z - fromLoc.z) * 0.025;
      const distKm = Math.max(5, Math.round(roadPath ? roadPath.totalKm : fallbackKm));
      const stops = roadPath && roadPath.stops.length >= 2 ? roadPath.stops : [fromId, toId];
      const price = Math.max(120, Math.min(2500, parseInt(ticketPrice, 10) || 350));
      const bus = this.save.company.fleet.find((f) => f.uid === busUid) || this.save.company.fleet[0];
      const spec = BUS_CATALOG.find((b) => b.id === bus.busId) || BUS_CATALOG[0];
      const estIncome = Math.round(spec.seatCapacity * 0.72 * price);
      const routeId = `custom_${fromId}_${toId}_${Date.now().toString(36).slice(-4)}`;
      const route = {
        id: routeId,
        nameEn: `${fromLoc.nameEn} → ${toLoc.nameEn}`,
        nameBn: `${fromLoc.nameBn} → ${toLoc.nameBn}`,
        stops,
        departureTime: departureTime || '08:30 AM',
        ticketPrice: price,
        rewardTaka: Math.round(estIncome * 0.55),
        capacity: spec.seatCapacity,
        estimatedIncome: estIncome,
        distKm,
        active: true,
        desc: `Real GPS Route (${distKm} km • ${stops.length} stops) • Departs ${departureTime || '08:30 AM'} • Est ৳${estIncome.toLocaleString()}/trip`
      };
      this.save.company.customRoutes.push(route);
      if (bus) bus.assignedRouteId = routeId;
      this.awardXP(110);
      persistSave(this.save);
      return { ok: true, route, msg: `Created ${distKm} km route ${route.nameEn} (${stops.length} stops)` };
    }

    toggleCustomRoute(routeId) {
      const r = this.save.company.customRoutes.find((x) => x.id === routeId);
      if (!r) return { ok: false, msg: 'Route not found.' };
      r.active = !r.active;
      persistSave(this.save);
      return { ok: true, msg: `${r.nameEn} is now ${r.active ? 'ACTIVE' : 'PAUSED'}` };
    }

    deleteCustomRoute(routeId) {
      this.save.company.customRoutes = this.save.company.customRoutes.filter((x) => x.id !== routeId);
      this.save.company.fleet.forEach((f) => {
        if (f.assignedRouteId === routeId) f.assignedRouteId = null;
      });
      persistSave(this.save);
      return { ok: true, msg: 'Custom route deleted.' };
    }

    getAllRoutes() {
      return [...ROUTES_CATALOG, ...(this.save.company.customRoutes || [])];
    }

    getTerminalState(locId) {
      if (!this.save.company.terminals[locId]) {
        this.save.company.terminals[locId] = {
          owned: false,
          parkingLvl: 1,
          waitingLvl: 1,
          counterLvl: 1,
          boardLvl: 1,
          cleanLvl: 85,
          staffLvl: 1,
          satisfaction: 78
        };
      }
      return this.save.company.terminals[locId];
    }

    buyTerminal(locId) {
      const loc = BANGLADESH_LOCATIONS[locId];
      if (!loc) return { ok: false, msg: 'Location not found.' };
      const st = this.getTerminalState(locId);
      if (st.owned) return { ok: false, msg: `You already own ${loc.nameEn} Terminal.` };
      const cost = loc.terminalCost || 20000;
      if (this.save.taka < cost) {
        return { ok: false, msg: `Need ৳ ${cost.toLocaleString()} to purchase ${loc.nameEn} Terminal.` };
      }
      this.save.taka -= cost;
      st.owned = true;
      st.cleanLvl = 95;
      st.satisfaction = 86;
      this.mechanics.logEconomy('expense', `Purchased ${loc.nameEn} Bus Terminal`, cost);
      this.awardXP(300);
      this.checkAchievements();
      persistSave(this.save);
      return { ok: true, msg: `Congratulations! You now own ${loc.nameEn} Bus Terminal!` };
    }

    upgradeTerminalFacility(locId, key) {
      const loc = BANGLADESH_LOCATIONS[locId];
      const st = this.getTerminalState(locId);
      if (!st.owned) return { ok: false, msg: 'Purchase this terminal first.' };
      const cur = st[key] || 1;
      if (cur >= 5) return { ok: false, msg: 'Facility already at Level 5!' };
      const cost = 3500 * cur;
      if (this.save.taka < cost) return { ok: false, msg: `Need ৳ ${cost.toLocaleString()} to upgrade.` };
      this.save.taka -= cost;
      st[key] = cur + 1;
      st.satisfaction = Math.min(100, Math.round(70 + (st.parkingLvl + st.waitingLvl + st.counterLvl + st.boardLvl + st.staffLvl) * 1.6 + (st.cleanLvl - 50) * 0.2));
      this.mechanics.logEconomy('expense', `${loc.nameEn} Terminal Upgrade`, cost);
      this.awardXP(100);
      persistSave(this.save);
      return { ok: true, msg: `Upgraded ${loc.nameEn} Terminal (Satisfaction: ${st.satisfaction}%)` };
    }

    cleanTerminal(locId) {
      const st = this.getTerminalState(locId);
      if (!st.owned) return { ok: false, msg: 'Purchase terminal first.' };
      const cost = 450;
      if (this.save.taka < cost) return { ok: false, msg: 'Need ৳ 450 for terminal sanitation crew.' };
      this.save.taka -= cost;
      st.cleanLvl = 100;
      st.satisfaction = Math.min(100, st.satisfaction + 8);
      this.mechanics.logEconomy('expense', 'Terminal Cleaning Crew', cost);
      persistSave(this.save);
      return { ok: true, msg: 'Terminal cleaned to 100%! Passenger satisfaction boosted.' };
    }

    takeLoan(offerId) {
      const offer = LOAN_OFFERS.find((l) => l.id === offerId);
      if (!offer) return { ok: false, msg: 'Loan offer not found.' };
      if (this.save.company.loans.length >= 2) {
        return { ok: false, msg: 'Repay an existing loan before taking a third loan!' };
      }
      const totalRepay = Math.round(offer.principal * (1 + offer.interestPct / 100));
      this.save.taka += offer.principal;
      this.save.company.loans.push({
        id: `${offer.id}_${Date.now().toString(36).slice(-4)}`,
        name: offer.name,
        principal: offer.principal,
        remaining: totalRepay,
        dailyPayment: offer.dailyPayment
      });
      this.mechanics.logEconomy('income', `Bank Loan Disbursed: ${offer.name}`, offer.principal);
      persistSave(this.save);
      return { ok: true, msg: `Received +৳ ${offer.principal.toLocaleString()} loan! (Total repay: ৳${totalRepay.toLocaleString()})` };
    }

    repayLoan(loanId) {
      const idx = this.save.company.loans.findIndex((l) => l.id === loanId);
      if (idx === -1) return { ok: false, msg: 'Loan not found.' };
      const loan = this.save.company.loans[idx];
      if (this.save.taka < loan.remaining) {
        return { ok: false, msg: `Need ৳ ${loan.remaining.toLocaleString()} to pay off ${loan.name}.` };
      }
      this.save.taka -= loan.remaining;
      this.save.company.loans.splice(idx, 1);
      this.mechanics.logEconomy('expense', `Loan Settled: ${loan.name}`, loan.remaining);
      persistSave(this.save);
      return { ok: true, msg: `Paid off ${loan.name} in full!` };
    }

    runBusinessDayCycle() {
      const c = this.save.company;
      const routes = this.getAllRoutes();
      const hasManager = c.staff.some((s) => s.role === 'manager');
      const hasMechanic = c.staff.some((s) => s.role === 'mechanic');
      const hasConductor = c.staff.some((s) => s.role === 'conductor');

      let ticketIncome = 0;
      let rentalIncome = 0;
      let terminalIncome = 0;
      let fuelCost = 0;
      let tollCost = 0;
      let repairCost = 0;

      // 1. Automated Fleet Operations (Scheduled buses + Rental buses)
      c.fleet.forEach((bus) => {
        const spec = BUS_CATALOG.find((b) => b.id === bus.busId) || BUS_CATALOG[0];
        if (bus.rentalActive) {
          const rent = Math.round((1300 + (spec.price || 8000) * 0.04) * (0.85 + (c.reputation / 200)));
          rentalIncome += rent;
          bus.totalIncome = (bus.totalIncome || 0) + rent;
          bus.condition = Math.max(40, (bus.condition || 100) - 2);
          return;
        }
        if (bus.assignedDriverId && bus.assignedRouteId && bus.condition > 30 && bus.fuel > 15) {
          const route = routes.find((r) => r.id === bus.assignedRouteId);
          const driver = c.staff.find((s) => s.id === bus.assignedDriverId);
          if (route && driver) {
            const skillMult = (driver.skill / 85) * (hasConductor ? 1.12 : 1.0) * (hasManager ? 1.08 : 1.0);
            const pax = Math.round(spec.seatCapacity * 0.72 * skillMult);
            const rev = Math.round(pax * (route.ticketPrice || 300));
            const fuelSpend = spec.isElectric ? 380 : Math.round(620 + spec.seatCapacity * 14);
            const toll = route.stops.length > 2 ? 320 : 120;
            const wear = hasMechanic ? 2.5 : 4.5;
            bus.condition = Math.max(25, Math.round(bus.condition - wear));
            bus.fuel = Math.max(10, Math.round(bus.fuel - (spec.isElectric ? 12 : 22)));
            bus.mileageKm = Math.round((bus.mileageKm || 0) + (route.distKm || 65));
            bus.totalIncome = (bus.totalIncome || 0) + rev;
            ticketIncome += rev;
            fuelCost += fuelSpend;
            tollCost += toll;
            if (bus.fuel <= 25) {
              const autoRefuel = (100 - bus.fuel) * 90;
              fuelCost += autoRefuel;
              bus.fuel = 100;
            }
            if (bus.condition < 55 && hasMechanic) {
              const autoRep = 750;
              repairCost += autoRep;
              bus.condition = 92;
            }
          }
        }
      });

      // 2. Owned Bus Terminals Income
      Object.keys(c.terminals || {}).forEach((locId) => {
        const t = c.terminals[locId];
        if (!t.owned) return;
        const lvls = (t.parkingLvl || 1) + (t.waitingLvl || 1) + (t.counterLvl || 1) + (t.boardLvl || 1) + (t.staffLvl || 1);
        const satMult = Math.max(0.5, (t.satisfaction || 75) / 80);
        terminalIncome += Math.round((650 + lvls * 260) * satMult);
        t.cleanLvl = Math.max(40, (t.cleanLvl || 90) - 6);
        t.satisfaction = Math.max(45, Math.min(100, Math.round(65 + lvls * 1.6 + (t.cleanLvl - 55) * 0.25)));
      });

      // 3. Salaries, Insurance, Terminal Fees, Loans
      const salaries = c.staff.reduce((sum, s) => sum + (s.dailySalary || 600), 0);
      const insuranceCost = this.save.insurance && this.save.insurance.active ? 450 : 0;
      const terminalFees = c.fleet.length * 180;

      let loanPayments = 0;
      for (let i = c.loans.length - 1; i >= 0; i--) {
        const loan = c.loans[i];
        const pay = Math.min(loan.remaining, loan.dailyPayment);
        loanPayments += pay;
        loan.remaining -= pay;
        if (loan.remaining <= 0) c.loans.splice(i, 1);
      }

      const grossIncome = ticketIncome + rentalIncome + terminalIncome;
      const totalExpense = fuelCost + tollCost + repairCost + salaries + insuranceCost + terminalFees + loanPayments;
      const netProfit = grossIncome - totalExpense;

      this.save.taka = Math.max(0, Math.round(this.save.taka + netProfit));
      c.revenueTotal = Math.round((c.revenueTotal || 0) + grossIncome);
      c.dayNumber = (c.dayNumber || 1) + 1;
      if (netProfit > 0) {
        c.reputation = Math.min(100, (c.reputation || 70) + 1);
      }

      const report = {
        day: c.dayNumber - 1,
        ticketIncome,
        rentalIncome,
        terminalIncome,
        salaries,
        fuel: fuelCost,
        tolls: tollCost,
        repairs: repairCost,
        insurance: insuranceCost,
        terminalFees,
        loanPayments,
        netProfit
      };
      c.dailyReports.unshift(report);
      if (c.dailyReports.length > 20) c.dailyReports.length = 20;

      if (grossIncome > 0) this.mechanics.logEconomy('income', `Day ${report.day} Fleet & Terminal Revenue`, grossIncome);
      if (totalExpense > 0) this.mechanics.logEconomy('expense', `Day ${report.day} Salaries, Fuel & Loans`, totalExpense);
      this.awardXP(60);
      this.checkAchievements();
      persistSave(this.save);
      return report;
    }

    simulateTick(dt, isDriving) {
      if (!isDriving) return null;
      this.dayTimer += dt;
      if (this.dayTimer >= 75) {
        this.dayTimer = 0;
        return this.runBusinessDayCycle();
      }
      return null;
    }

    awardXP(xpAmount) {
      const p = this.save.progression;
      p.xp = Math.max(0, Math.round((p.xp || 0) + xpAmount));
      const newLevel = Math.max(1, Math.floor(Math.sqrt(p.xp / 250)) + 1);
      const leveledUp = newLevel > (p.level || 1);
      p.level = newLevel;
      this.save.company.level = Math.max(1, Math.floor(newLevel / 2) + (this.save.company.created ? 1 : 0));
      return leveledUp ? newLevel : 0;
    }

    checkAchievements() {
      const p = this.save.progression;
      if (!Array.isArray(p.achievements)) p.achievements = [];
      const newlyUnlocked = [];
      ACHIEVEMENTS_CATALOG.forEach((ach) => {
        if (!p.achievements.includes(ach.id) && ach.check(this.save)) {
          p.achievements.push(ach.id);
          this.save.taka += ach.reward;
          this.mechanics.logEconomy('income', `Achievement: ${ach.title}`, ach.reward);
          newlyUnlocked.push(ach);
        }
      });
      return newlyUnlocked;
    }

    claimDailyReward() {
      const p = this.save.progression;
      const today = new Date().toISOString().slice(0, 10);
      if (p.lastDailyClaimDate === today) {
        return { ok: false, msg: 'Today’s daily reward has already been claimed. Come back tomorrow!' };
      }
      p.dailyStreak = (p.dailyStreak || 0) + 1;
      p.lastDailyClaimDate = today;
      const bonus = 1500 + Math.min(7, p.dailyStreak) * 600;
      this.save.taka += bonus;
      this.awardXP(150);
      this.mechanics.logEconomy('income', `Daily Login Reward (Day ${p.dailyStreak})`, bonus);
      persistSave(this.save);
      return { ok: true, msg: `🎁 Claimed Day ${p.dailyStreak} Reward: +৳ ${bonus.toLocaleString()} & +150 XP!` };
    }
  }

  global.BDCompanyManager = BDCompanyManager;
})(typeof window !== 'undefined' ? window : globalThis);
