(function (global) {
  'use strict';

  const {
    REPAIR_SERVICES,
    FUEL_PRICES,
    createDefaultParts,
    createDefaultMechanics,
    persistSave
  } = global.BDGameConfig;

  class BusMechanicsManager {
    constructor(save) {
      this.save = save;
      this.ensureState();
      this.lastTempWarning = 0;
      this.lastFatigueWarning = 0;
      this.lastFuelWarning = 0;
      this.lastTireWarning = 0;
    }

    ensureState() {
      if (!this.save.parts) this.save.parts = createDefaultParts();
      if (!this.save.mechanics) this.save.mechanics = createDefaultMechanics();
      if (typeof this.save.cleanliness !== 'number') this.save.cleanliness = 100;
      if (typeof this.save.fatigue !== 'number') this.save.fatigue = 0;
      if (!this.save.insurance) {
        this.save.insurance = { active: true, coveragePct: 70, claimsCount: 0, premiumCost: 2500 };
      }
      if (!Array.isArray(this.save.economyHistory)) this.save.economyHistory = [];
      if (!Array.isArray(this.save.maintenanceLog)) this.save.maintenanceLog = [];
      if (!Array.isArray(this.save.accidentReports)) this.save.accidentReports = [];
      this.syncOverallHealth();
    }

    syncOverallHealth() {
      const vals = Object.values(this.save.parts);
      const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
      this.save.health = Math.max(0, Math.min(100, Math.round(avg)));
      return this.save.health;
    }

    logEconomy(type, label, amount) {
      const entry = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type, // 'income' | 'expense' | 'claim'
        label,
        amount: Math.round(amount)
      };
      this.save.economyHistory.unshift(entry);
      if (this.save.economyHistory.length > 40) this.save.economyHistory.length = 40;
    }

    logMaintenance(label, cost) {
      this.save.maintenanceLog.unshift({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        label,
        cost: Math.round(cost)
      });
      if (this.save.maintenanceLog.length > 30) this.save.maintenanceLog.length = 30;
    }

    applyCollisionImpact(impactSeverity, relAngleRad, causeLabel) {
      const p = this.save.parts;
      const m = this.save.mechanics;
      const sev = Math.max(2, Math.min(25, impactSeverity));
      const dmgScale = sev * 1.45;
      const affected = [];

      // Determine directional hit zones (0 = front, PI = rear, +-PI/2 = sides)
      const absAng = Math.abs(relAngleRad || 0);
      if (absAng < 0.75) {
        p.frontBumper = Math.max(0, p.frontBumper - dmgScale * 1.3);
        p.headlights = Math.max(0, p.headlights - dmgScale * 0.9);
        p.windshield = Math.max(0, p.windshield - dmgScale * (sev > 8 ? 1.0 : 0.45));
        p.radiator = Math.max(0, p.radiator - dmgScale * 0.75);
        p.engine = Math.max(0, p.engine - dmgScale * 0.55);
        affected.push('Front Bumper', 'Headlights', 'Windshield', 'Radiator');
        if (sev > 9) m.coolantLevel = Math.max(0, m.coolantLevel - sev * 1.4);
      } else if (absAng > 2.35) {
        p.rearBumper = Math.max(0, p.rearBumper - dmgScale * 1.35);
        p.tailLights = Math.max(0, p.tailLights - dmgScale * 0.95);
        p.engine = Math.max(0, p.engine - dmgScale * 0.75);
        affected.push('Rear Bumper', 'Tail Lights', 'Engine');
      } else {
        p.bodyPanels = Math.max(0, p.bodyPanels - dmgScale * 1.15);
        p.doors = Math.max(0, p.doors - dmgScale * 0.7);
        p.sideWindows = Math.max(0, p.sideWindows - dmgScale * 0.65);
        p.tires = Math.max(0, p.tires - dmgScale * 0.75);
        p.suspension = Math.max(0, p.suspension - dmgScale * 0.7);
        affected.push('Body Panels', 'Doors', 'Side Windows', 'Tires', 'Suspension');
      }

      if (sev > 7) {
        m.tirePressure = Math.max(15, m.tirePressure - sev * 1.6);
        if (m.tirePressure < 42 || (sev > 13 && Math.random() < 0.45)) {
          m.punctured = true;
          affected.push('Punctured Tire');
        }
      }

      this.syncOverallHealth();
      const repairEstimate = Math.round(sev * 165);
      const report = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cause: causeLabel || 'Roadway Collision',
        severity: sev > 12 ? 'SEVERE' : sev > 6 ? 'MODERATE' : 'MINOR',
        parts: affected.join(', '),
        repairEstimate
      };
      this.save.accidentReports.unshift(report);
      if (this.save.accidentReports.length > 20) this.save.accidentReports.length = 20;
      persistSave(this.save);

      return {
        report,
        emergencyStopNeeded: sev > 13 || this.save.health <= 25
      };
    }

    update(dt, speedKmh, throttle, brake, rainActive, surfaceInfo, settings) {
      const p = this.save.parts;
      const m = this.save.mechanics;
      const moving = speedKmh > 1.5;

      // 1. Engine Temperature simulation
      const coolingEfficiency = (p.radiator / 100) * (m.coolantLevel / 100);
      const oilFrictionPenalty = m.oilLevel < 40 ? (40 - m.oilLevel) * 0.14 : 0;
      const targetTemp = 80 + throttle * 16 + (1 - coolingEfficiency) * 28 + oilFrictionPenalty + (p.engine < 60 ? 12 : 0);
      const tempRate = targetTemp > m.engineTemp ? 0.22 : 0.35;
      m.engineTemp = Math.max(65, Math.min(125, m.engineTemp + (targetTemp - m.engineTemp) * tempRate * dt));

      if (m.engineTemp > 110) {
        p.engine = Math.max(0, p.engine - 0.65 * dt);
      }

      // 2. Fluid, Brake & Tire Wear
      if (moving) {
        const roughFactor = surfaceInfo.isBrokenRoad ? 3.2 : surfaceInfo.surface === 'grass' ? 2.4 : surfaceInfo.onSpeedBump ? 2.6 : 1.0;
        const kmDelta = (speedKmh / 3600) * dt;
        m.tireWear = Math.max(0, m.tireWear - kmDelta * 1.15 * roughFactor);
        p.tires = Math.max(0, Math.min(p.tires, m.tireWear + 10));
        m.oilLevel = Math.max(0, m.oilLevel - kmDelta * 0.45);
        m.coolantLevel = Math.max(0, m.coolantLevel - kmDelta * (p.radiator < 70 ? 2.2 : 0.28));

        if (brake > 0) {
          m.brakeCondition = Math.max(10, m.brakeCondition - dt * 0.18 * (speedKmh / 60));
        }

        if (surfaceInfo.isBrokenRoad && speedKmh > 52) {
          p.suspension = Math.max(0, p.suspension - dt * 0.85);
          if (Math.random() < 0.015 * dt && !m.punctured) {
            m.punctured = true;
            m.tirePressure = 28;
          }
        }

        if (m.punctured) {
          m.tirePressure = Math.max(18, m.tirePressure - dt * 1.8);
        }

        // Cleanliness drops in rain, village roads, or grass
        const dirtRate = rainActive ? 0.55 : surfaceInfo.surface === 'grass' ? 1.4 : surfaceInfo.surface === 'village' ? 0.45 : 0.08;
        this.save.cleanliness = Math.max(0, this.save.cleanliness - dirtRate * dt);
      } else {
        // Alternator vs battery drain
        m.battery = Math.min(100, Math.max(0, m.battery + dt * 0.04));
      }

      if (moving) {
        m.battery = Math.min(100, m.battery + dt * 0.12);
      }

      // 3. Driver Fatigue System
      if (settings.fatigueOn) {
        if (moving) {
          this.save.fatigue = Math.min(100, this.save.fatigue + dt * 0.42);
        } else {
          this.save.fatigue = Math.max(0, this.save.fatigue - dt * 0.12);
        }
      } else {
        this.save.fatigue = 0;
      }

      this.syncOverallHealth();
    }

    getPhysicsModifiers(fuel) {
      const p = this.save.parts;
      const m = this.save.mechanics;
      const engineStalled =
        fuel <= 0.1 ||
        m.engineTemp >= 118 ||
        p.engine <= 10 ||
        m.battery <= 5;

      const engineHealth = (p.engine / 100) * (0.6 + 0.4 * (m.oilLevel / 100));
      const overheatPenalty = m.engineTemp > 104 ? 0.72 : 1.0;
      const tireGripPenalty = m.punctured ? 0.76 : 0.75 + 0.25 * (m.tirePressure / 100);
      const powerMult = Math.max(0.32, engineHealth * overheatPenalty * (m.punctured ? 0.78 : 1.0));
      const brakeMult = Math.max(0.38, (0.45 + 0.55 * (m.brakeCondition / 100)) * tireGripPenalty);
      const steerPull = (m.punctured ? 0.085 : 0) + (p.suspension < 60 ? (60 - p.suspension) * 0.0012 : 0);
      const suspMult = Math.max(0.4, 0.5 + 0.5 * (p.suspension / 100));
      const fatigueDrift = this.save.fatigue >= 75 ? (this.save.fatigue - 70) * 0.0022 : 0;

      return {
        engineStalled,
        powerMult,
        brakeMult,
        steerPull,
        suspMult,
        fatigueDrift
      };
    }

    getRepairCost(serviceId) {
      const svc = REPAIR_SERVICES.find((s) => s.id === serviceId);
      if (!svc) return 0;
      const p = this.save.parts;
      const m = this.save.mechanics;

      if (svc.id === 'brakes') {
        const missing = Math.max(0, 100 - m.brakeCondition);
        return missing < 1 ? 0 : Math.max(120, Math.round((missing / 100) * svc.baseCost));
      }
      if (svc.id === 'oil') {
        const missing = (100 - m.oilLevel) + (100 - m.coolantLevel) + (100 - m.battery) + Math.max(0, m.engineTemp - 88) * 1.5;
        return missing < 4 ? 0 : Math.max(150, Math.round((missing / 220) * svc.baseCost));
      }
      if (svc.id === 'tires') {
        const missing = (100 - p.tires) + (100 - m.tireWear) + (100 - m.tirePressure) + (m.punctured ? 45 : 0);
        return missing < 3 ? 0 : Math.max(180, Math.round((missing / 220) * svc.baseCost));
      }
      if (svc.parts === 'ALL') {
        const totalMissing = Object.values(p).reduce((acc, v) => acc + (100 - v), 0) + (100 - m.oilLevel) + (100 - m.coolantLevel) + (100 - m.brakeCondition) + (m.punctured ? 50 : 0);
        return totalMissing < 5 ? 0 : Math.max(300, Math.round((totalMissing / 1200) * svc.baseCost));
      }
      const avgMissing = svc.parts.reduce((acc, k) => acc + (100 - (p[k] ?? 100)), 0) / Math.max(1, svc.parts.length);
      return avgMissing < 1 ? 0 : Math.max(140, Math.round((avgMissing / 100) * svc.baseCost));
    }

    performRepair(serviceId, useInsurance) {
      const svc = REPAIR_SERVICES.find((s) => s.id === serviceId);
      if (!svc) return { ok: false, msg: 'Service unavailable.' };
      const rawCost = this.getRepairCost(serviceId);
      if (rawCost <= 0) return { ok: false, msg: `${svc.name} is already in top condition!` };

      let finalCost = rawCost;
      let covered = 0;
      if (useInsurance && this.save.insurance.active && rawCost >= 400) {
        covered = Math.round(rawCost * (this.save.insurance.coveragePct / 100));
        finalCost = rawCost - covered;
      }

      if (this.save.taka < finalCost) {
        return { ok: false, msg: `Need ৳ ${finalCost.toLocaleString()} for ${svc.name}!` };
      }

      this.save.taka -= finalCost;
      if (covered > 0) {
        this.save.insurance.claimsCount += 1;
        this.logEconomy('claim', `Insurance Claim (${svc.name})`, covered);
      }
      this.logEconomy('expense', svc.name, finalCost);
      this.logMaintenance(svc.name, finalCost);

      const p = this.save.parts;
      const m = this.save.mechanics;

      if (svc.id === 'brakes') {
        m.brakeCondition = 100;
      } else if (svc.id === 'oil') {
        m.oilLevel = 100;
        m.coolantLevel = 100;
        m.battery = 100;
        m.engineTemp = 82;
      } else if (svc.id === 'tires') {
        p.tires = 100;
        m.tireWear = 100;
        m.tirePressure = 100;
        m.punctured = false;
      } else if (svc.parts === 'ALL') {
        Object.keys(p).forEach((k) => { p[k] = 100; });
        Object.assign(m, createDefaultMechanics());
      } else {
        svc.parts.forEach((k) => { p[k] = 100; });
        if (svc.id === 'engine') {
          m.engineTemp = 82;
          m.coolantLevel = Math.max(m.coolantLevel, 90);
        }
      }

      this.syncOverallHealth();
      persistSave(this.save);
      return {
        ok: true,
        cost: finalCost,
        covered,
        msg: covered > 0
          ? `${svc.name} completed! Paid ৳${finalCost} (Insurance covered ৳${covered}).`
          : `${svc.name} completed (-৳ ${finalCost}).`
      };
    }

    calculateFuelCost(pctToAdd, fuelType) {
      const unitPrice = FUEL_PRICES[fuelType] || FUEL_PRICES.diesel;
      // 1% of bus tank ~ 0.14 unit scale for balanced mobile game economy
      return Math.max(0, Math.round(pctToAdd * (unitPrice * 0.14)));
    }

    refuel(pctToAdd, fuelType) {
      const needed = Math.min(pctToAdd, 100 - this.save.fuel);
      if (needed < 0.5) return { ok: false, msg: 'Fuel tank is already full!' };
      const cost = this.calculateFuelCost(needed, fuelType);
      if (this.save.taka < cost) return { ok: false, msg: `Need ৳ ${cost.toLocaleString()} for ${fuelType.toUpperCase()}!` };

      this.save.taka -= cost;
      this.save.fuel = Math.min(100, this.save.fuel + needed);
      this.logEconomy('expense', `${fuelType === 'petrol' ? 'Petrol' : 'Diesel'} Refuel (+${Math.round(needed)}%)`, cost);
      persistSave(this.save);
      return { ok: true, cost, added: Math.round(needed), msg: `Refueled +${Math.round(needed)}% ${fuelType.toUpperCase()} (-৳ ${cost}).` };
    }

    washBus() {
      const cost = 250;
      if (this.save.cleanliness >= 98) return { ok: false, msg: 'Coach exterior is already sparkling clean!' };
      if (this.save.taka < cost) return { ok: false, msg: 'Need ৳ 250 for High-Pressure Bus Wash!' };
      this.save.taka -= cost;
      this.save.cleanliness = 100;
      this.logEconomy('expense', 'Foam & Pressure Bus Wash', cost);
      this.logMaintenance('Exterior Foam Wash', cost);
      persistSave(this.save);
      return { ok: true, cost, msg: 'Bus washed & waxed to 100% shine (-৳ 250)!' };
    }

    restDriver(kind) {
      const opts = {
        tea: { label: 'Highway Cha & Rest', cost: 80, recover: 35 },
        meal: { label: 'Highway Restaurant Meal', cost: 220, recover: 65 },
        sleep: { label: 'Driver Rest Bunk (Full Nap)', cost: 350, recover: 100 }
      };
      const opt = opts[kind] || opts.tea;
      if (this.save.taka < opt.cost) return { ok: false, msg: `Need ৳ ${opt.cost} for ${opt.label}!` };
      this.save.taka -= opt.cost;
      this.save.fatigue = Math.max(0, this.save.fatigue - opt.recover);
      this.logEconomy('expense', opt.label, opt.cost);
      persistSave(this.save);
      return { ok: true, cost: opt.cost, msg: `${opt.label} complete! Driver fatigue now ${Math.round(this.save.fatigue)}%.` };
    }

    useEmergencyKit() {
      const cost = 450;
      if (this.save.taka < cost) return { ok: false, msg: 'Need ৳ 450 for Emergency Roadside Repair Kit!' };
      this.save.taka -= cost;
      const p = this.save.parts;
      const m = this.save.mechanics;
      m.punctured = false;
      m.tirePressure = Math.max(m.tirePressure, 82);
      m.coolantLevel = Math.max(m.coolantLevel, 75);
      m.oilLevel = Math.max(m.oilLevel, 70);
      m.battery = Math.max(m.battery, 75);
      m.engineTemp = Math.min(m.engineTemp, 88);
      p.engine = Math.max(p.engine, 65);
      p.radiator = Math.max(p.radiator, 65);
      p.tires = Math.max(p.tires, 65);
      p.headlights = Math.max(p.headlights, 65);
      this.syncOverallHealth();
      this.logEconomy('expense', 'Emergency Repair Kit', cost);
      this.logMaintenance('Roadside Emergency Patch', cost);
      persistSave(this.save);
      return { ok: true, cost, msg: 'Emergency patch applied! Tire sealed, coolant topped & engine cooled.' };
    }

    requestTowRecovery() {
      const cost = 900;
      if (this.save.taka < cost) return { ok: false, msg: 'Need ৳ 900 for Heavy Bus Tow Truck!' };
      this.save.taka -= cost;
      if (this.save.fuel < 20) this.save.fuel = 40;
      this.save.mechanics.engineTemp = 82;
      this.save.mechanics.battery = Math.max(this.save.mechanics.battery, 80);
      this.save.parts.engine = Math.max(this.save.parts.engine, 55);
      this.syncOverallHealth();
      this.logEconomy('expense', 'Heavy Tow Truck Service', cost);
      persistSave(this.save);
      return { ok: true, cost, msg: 'Tow truck recovered your bus to the nearest service bay (-৳ 900).' };
    }

    toggleInsurance() {
      const ins = this.save.insurance;
      if (ins.active) {
        ins.active = false;
        persistSave(this.save);
        return { ok: true, msg: 'Comprehensive Bus Insurance paused.' };
      }
      if (this.save.taka < ins.premiumCost) {
        return { ok: false, msg: `Need ৳ ${ins.premiumCost} to activate Insurance Policy!` };
      }
      this.save.taka -= ins.premiumCost;
      ins.active = true;
      this.logEconomy('expense', 'Comprehensive Bus Insurance Policy', ins.premiumCost);
      persistSave(this.save);
      return { ok: true, msg: '70% Accident & Repair Insurance activated!' };
    }
  }

  global.BDBusMechanics = BusMechanicsManager;
})(typeof window !== 'undefined' ? window : globalThis);
