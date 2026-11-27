(function (global) {
  'use strict';

  const {
    BUS_CATALOG,
    BANGLADESH_LOCATIONS,
    PAINT_PALETTE,
    COMPANY_LOGOS,
    COMPANY_FACILITIES,
    STAFF_CANDIDATES,
    LOAN_OFFERS,
    ACHIEVEMENTS_CATALOG,
    WEEKLY_COMPETITIONS,
    persistSave
  } = global.BDGameConfig;

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  class BDPhase5UI {
    constructor(game) {
      this.game = game;
      this.companyTab = 'profile';
      this.terminalsTab = 'routes';
      this.economyTab = 'reports';
      this.onlineTab = 'account';
      this.bindTabs();
    }

    bindTabs() {
      const wireStrip = (stripId, setter, renderer) => {
        const el = document.getElementById(stripId);
        if (!el) return;
        el.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            el.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            setter(btn.getAttribute('data-tab'));
            renderer();
          });
        });
      };

      wireStrip('company-tabs', (t) => { this.companyTab = t; }, () => this.renderCompanyModal());
      wireStrip('terminals-tabs', (t) => { this.terminalsTab = t; }, () => this.renderTerminalsModal());
      wireStrip('economy-tabs', (t) => { this.economyTab = t; }, () => this.renderEconomyModal());
      wireStrip('online-tabs', (t) => { this.onlineTab = t; }, () => this.renderOnlineModal(true));
    }

    renderCompanyModal() {
      const g = this.game;
      const c = g.save.company;
      const body = document.getElementById('company-tab-body');
      document.getElementById('company-modal-title').textContent = `${c.logo || '🦅'} ${c.name || 'MY TRANSPORT COMPANY'}`;
      document.getElementById('company-modal-sub').textContent =
        `Balance: ৳${Math.round(g.save.taka).toLocaleString()} • Reputation: ${c.reputation}% • Co. Level ${c.level} • Fleet: ${c.fleet.length}/${g.company.getGarageConfig().maxFleet}`;

      if (this.companyTab === 'profile') {
        const office = g.company.getOfficeConfig();
        const garage = g.company.getGarageConfig();
        const nextOffice = COMPANY_FACILITIES.office.find((o) => o.level === office.level + 1);
        const nextGarage = COMPANY_FACILITIES.garage.find((gr) => gr.level === garage.level + 1);

        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🏢 Company Identity</h3>
              <label class="p5-muted">Company Name</label>
              <input id="p5-comp-name" class="p5-input" maxlength="48" value="${escHtml(c.name)}" />
              <label class="p5-muted">Company Slogan</label>
              <input id="p5-comp-slogan" class="p5-input" maxlength="64" value="${escHtml(c.slogan)}" />
              <label class="p5-muted">Company Logo</label>
              <div class="logo-picker" id="p5-logo-picker">
                ${COMPANY_LOGOS.map((lg) => `<button type="button" class="logo-chip ${c.logo === lg ? 'active' : ''}" data-logo="${lg}">${lg}</button>`).join('')}
              </div>
              <label class="p5-muted">Brand Color</label>
              <div class="paint-swatches" id="p5-comp-colors">
                ${PAINT_PALETTE.map((p) => `<button type="button" class="paint-dot ${(c.color || '').toLowerCase() === p.hex.toLowerCase() ? 'active' : ''}" style="background:${p.hex}" data-color="${p.hex}" title="${p.name}"></button>`).join('')}
              </div>
              <button id="p5-save-company" class="btn btn-primary" style="margin-top:6px;">SAVE COMPANY PROFILE</button>
            </div>
            <div class="p5-card">
              <h3>🏛️ Facilities &amp; Operations</h3>
              <div class="p5-row"><span>Office: <b>${office.name}</b></span><span class="badge-pill">Lv ${office.level} (Max ${office.maxRoutes} Routes)</span></div>
              ${nextOffice
                ? `<button id="p5-upg-office" class="btn btn-secondary">Upgrade to ${nextOffice.name} (৳ ${nextOffice.cost.toLocaleString()})</button>`
                : '<div class="badge-pill">Office Max Level</div>'}
              <hr style="border-color:rgba(255,255,255,0.1);margin:4px 0;"/>
              <div class="p5-row"><span>Garage: <b>${garage.name}</b></span><span class="badge-pill badge-amber">Lv ${garage.level} (${garage.maxFleet} Buses)</span></div>
              <small>Repair Discount: ${garage.repairDiscount}% • Revenue Total: ৳${Math.round(c.revenueTotal || 0).toLocaleString()}</small>
              ${nextGarage
                ? `<button id="p5-upg-garage" class="btn btn-secondary">Upgrade to ${nextGarage.name} (৳ ${nextGarage.cost.toLocaleString()})</button>`
                : '<div class="badge-pill">Garage Max Level</div>'}
            </div>
          </div>
        `;

        let chosenLogo = c.logo || '🦅';
        let chosenColor = c.color || '#0c7c48';
        body.querySelectorAll('#p5-logo-picker .logo-chip').forEach((btn) => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('#p5-logo-picker .logo-chip').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            chosenLogo = btn.getAttribute('data-logo');
          });
        });
        body.querySelectorAll('#p5-comp-colors .paint-dot').forEach((btn) => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('#p5-comp-colors .paint-dot').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            chosenColor = btn.getAttribute('data-color');
          });
        });
        document.getElementById('p5-save-company').addEventListener('click', () => {
          const res = g.company.customizeCompany({
            name: document.getElementById('p5-comp-name').value,
            slogan: document.getElementById('p5-comp-slogan').value,
            logo: chosenLogo,
            color: chosenColor
          });
          g.showToast(res.msg);
          if (res.ok) {
            g.refreshMenuStats();
            this.renderCompanyModal();
          }
        });
        const upgOffBtn = document.getElementById('p5-upg-office');
        if (upgOffBtn) upgOffBtn.addEventListener('click', () => {
          const res = g.company.upgradeFacility('office');
          g.showToast(res.msg);
          this.renderCompanyModal();
        });
        const upgGarBtn = document.getElementById('p5-upg-garage');
        if (upgGarBtn) upgGarBtn.addEventListener('click', () => {
          const res = g.company.upgradeFacility('garage');
          g.showToast(res.msg);
          this.renderCompanyModal();
        });
        return;
      }

      if (this.companyTab === 'fleet') {
        const drivers = c.staff.filter((s) => s.role === 'driver');
        const allRoutes = g.company.getAllRoutes();
        body.innerHTML = `<div class="p5-grid">${c.fleet.map((bus) => {
          const spec = BUS_CATALOG.find((b) => b.id === bus.busId) || BUS_CATALOG[0];
          const isActive = g.save.selectedFleetUid === bus.uid;
          return `
            <div class="p5-card" style="${isActive ? 'border-color:#34d399' : ''}">
              <div class="p5-row">
                <h3>${escHtml(bus.nickname)}</h3>
                <span class="badge-pill ${bus.rentalActive ? 'badge-blue' : ''}">${bus.rentalActive ? 'CHARTER RENT' : spec.busType}</span>
              </div>
              <small>Cond: <b>${Math.round(bus.condition)}%</b> • Fuel: <b>${Math.round(bus.fuel)}%</b> • Income: <b>৳${Math.round(bus.totalIncome || 0).toLocaleString()}</b></small>
              <div class="p5-row">
                <select class="p5-select p5-assign-driver" data-uid="${bus.uid}" style="flex:1">
                  <option value="">-- Assign Driver --</option>
                  ${drivers.map((d) => `<option value="${d.id}" ${bus.assignedDriverId === d.id ? 'selected' : ''}>${escHtml(d.name)} (Skill ${d.skill})</option>`).join('')}
                </select>
                <select class="p5-select p5-assign-route" data-uid="${bus.uid}" style="flex:1">
                  <option value="">-- Assign Route --</option>
                  ${allRoutes.map((r) => `<option value="${r.id}" ${bus.assignedRouteId === r.id ? 'selected' : ''}>${escHtml(r.nameEn)}</option>`).join('')}
                </select>
              </div>
              <div class="p5-row">
                <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'} p5-drive-bus" data-uid="${bus.uid}" style="padding:5px 9px;font-size:11px;">${isActive ? '✓ Active' : 'Drive'}</button>
                <button class="btn btn-secondary p5-rep-bus" data-uid="${bus.uid}" style="padding:5px 9px;font-size:11px;">Repair</button>
                <button class="btn btn-secondary p5-fuel-bus" data-uid="${bus.uid}" style="padding:5px 9px;font-size:11px;">Refuel</button>
                <button class="btn btn-secondary p5-rent-bus" data-uid="${bus.uid}" style="padding:5px 9px;font-size:11px;">${bus.rentalActive ? 'End Rent' : 'Rent Out'}</button>
                <button class="btn btn-danger p5-sell-bus" data-uid="${bus.uid}" style="padding:5px 9px;font-size:11px;">Sell</button>
              </div>
            </div>
          `;
        }).join('')}</div>`;

        body.querySelectorAll('.p5-drive-bus').forEach((btn) => btn.addEventListener('click', () => {
          const res = g.company.selectFleetBus(btn.getAttribute('data-uid'));
          if (res.ok) {
            g.spawnPlayerBus();
            g.refreshMenuStats();
          }
          g.showToast(res.msg);
          this.renderCompanyModal();
        }));
        body.querySelectorAll('.p5-rep-bus').forEach((btn) => btn.addEventListener('click', () => {
          g.showToast(g.company.serviceFleetBus(btn.getAttribute('data-uid'), 'repair').msg);
          this.renderCompanyModal();
        }));
        body.querySelectorAll('.p5-fuel-bus').forEach((btn) => btn.addEventListener('click', () => {
          g.showToast(g.company.serviceFleetBus(btn.getAttribute('data-uid'), 'refuel').msg);
          this.renderCompanyModal();
        }));
        body.querySelectorAll('.p5-rent-bus').forEach((btn) => btn.addEventListener('click', () => {
          g.showToast(g.company.toggleRentBus(btn.getAttribute('data-uid')).msg);
          this.renderCompanyModal();
        }));
        body.querySelectorAll('.p5-sell-bus').forEach((btn) => btn.addEventListener('click', () => {
          const res = g.company.sellFleetBus(btn.getAttribute('data-uid'));
          if (res.ok) { g.spawnPlayerBus(); g.refreshMenuStats(); }
          g.showToast(res.msg);
          this.renderCompanyModal();
        }));
        body.querySelectorAll('.p5-assign-driver').forEach((sel) => sel.addEventListener('change', () => {
          g.showToast(g.company.assignBusDriver(sel.getAttribute('data-uid'), sel.value).msg);
        }));
        body.querySelectorAll('.p5-assign-route').forEach((sel) => sel.addEventListener('change', () => {
          g.showToast(g.company.assignBusRoute(sel.getAttribute('data-uid'), sel.value).msg);
        }));
        return;
      }

      if (this.companyTab === 'buy') {
        body.innerHTML = `<div class="p5-grid">${BUS_CATALOG.map((bus) => {
          const price = Math.max(6000, bus.price || 10000);
          return `
            <div class="p5-card">
              <div class="bus-swatch-strip" style="background:linear-gradient(90deg,${bus.primaryColor},${bus.stripeColor})"></div>
              <div class="p5-row"><h3>${bus.name}</h3><span class="badge-pill badge-amber">${bus.busType}</span></div>
              <small>${bus.model} • ${bus.seatCapacity} Seats • ${bus.topSpeedKmh} km/h</small>
              <button class="btn btn-primary p5-buy-bus" data-id="${bus.id}" style="margin-top:4px;">BUY TO FLEET (৳ ${price.toLocaleString()})</button>
            </div>
          `;
        }).join('')}</div>`;
        body.querySelectorAll('.p5-buy-bus').forEach((btn) => btn.addEventListener('click', () => {
          const res = g.company.buyBusToFleet(btn.getAttribute('data-id'));
          if (res.ok) {
            g.sound.playChime();
            g.spawnPlayerBus();
            g.refreshMenuStats();
          }
          g.showToast(res.msg);
          this.renderCompanyModal();
        }));
        return;
      }

      // Staff Tab
      const hiredIds = new Set(c.staff.map((s) => s.id));
      body.innerHTML = `
        <div class="p5-grid">
          <div class="p5-card">
            <h3>👷 Hired Staff Roster (${c.staff.length})</h3>
            ${c.staff.length === 0 ? '<small>No employees hired yet. Hire drivers, conductors &amp; mechanics on the right!</small>' : c.staff.map((s) => `
              <div class="p5-card" style="padding:7px 9px;">
                <div class="p5-row"><b>${escHtml(s.name)}</b><span class="badge-pill">${s.roleLabel}</span></div>
                <small>Skill: ${s.skill} • Salary: ৳${s.dailySalary}/day • Shift: ${s.shift}</small>
                <div class="p5-row">
                  <button class="btn btn-secondary p5-shift-staff" data-id="${s.id}" style="padding:4px 8px;font-size:10px;">Change Shift</button>
                  <button class="btn btn-danger p5-fire-staff" data-id="${s.id}" style="padding:4px 8px;font-size:10px;">Release</button>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="p5-card">
            <h3>📋 Recruitment Market</h3>
            ${STAFF_CANDIDATES.filter((cand) => !hiredIds.has(cand.id)).map((cand) => `
              <div class="p5-card" style="padding:7px 9px;">
                <div class="p5-row"><b>${cand.name}</b><span class="badge-pill badge-amber">${cand.roleLabel}</span></div>
                <small>Exp: ${cand.experience} yrs • Skill: ${cand.skill} • Wage: ৳${cand.dailySalary}/day</small>
                <button class="btn btn-primary p5-hire-staff" data-id="${cand.id}" style="padding:5px 9px;font-size:11px;">HIRE (৳ ${cand.hireFee.toLocaleString()})</button>
              </div>
            `).join('') || '<small>All available transport specialists are hired!</small>'}
          </div>
        </div>
      `;
      body.querySelectorAll('.p5-hire-staff').forEach((btn) => btn.addEventListener('click', () => {
        const res = g.company.hireStaff(btn.getAttribute('data-id'));
        if (res.ok) g.sound.playChime();
        g.showToast(res.msg);
        this.renderCompanyModal();
      }));
      body.querySelectorAll('.p5-fire-staff').forEach((btn) => btn.addEventListener('click', () => {
        g.showToast(g.company.fireStaff(btn.getAttribute('data-id')).msg);
        this.renderCompanyModal();
      }));
      body.querySelectorAll('.p5-shift-staff').forEach((btn) => btn.addEventListener('click', () => {
        g.showToast(g.company.cycleStaffShift(btn.getAttribute('data-id')).msg);
        this.renderCompanyModal();
      }));
    }

    renderTerminalsModal() {
      const g = this.game;
      const c = g.save.company;
      const body = document.getElementById('terminals-tab-body');

      if (this.terminalsTab === 'routes') {
        const locs = Object.values(BANGLADESH_LOCATIONS).slice().sort((a, b) => a.nameEn.localeCompare(b.nameEn));
        const dhakaIdx = locs.findIndex((l) => l.id === 'dhaka');
        const ctgIdx = locs.findIndex((l) => l.id === 'chittagong');
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🗓️ Create Scheduled Company Route</h3>
              <label class="p5-muted">Start Terminal / District</label>
              <select id="p5-rt-from" class="p5-select">${locs.map((l, idx) => `<option value="${l.id}" ${idx === (dhakaIdx >= 0 ? dhakaIdx : 0) ? 'selected' : ''}>${l.nameEn} (${l.division})</option>`).join('')}</select>
              <label class="p5-muted">Destination District / Hub</label>
              <select id="p5-rt-to" class="p5-select">${locs.map((l, idx) => `<option value="${l.id}" ${idx === (ctgIdx >= 0 ? ctgIdx : 1) ? 'selected' : ''}>${l.nameEn} (${l.division})</option>`).join('')}</select>
              <div class="p5-row">
                <div style="flex:1"><label class="p5-muted">Departure</label><input id="p5-rt-time" class="p5-input" style="width:100%" value="08:30 AM" /></div>
                <div style="flex:1"><label class="p5-muted">Fare (৳)</label><input id="p5-rt-fare" class="p5-input" type="number" style="width:100%" value="420" min="120" max="2500" /></div>
              </div>
              <label class="p5-muted">Assign Bus</label>
              <select id="p5-rt-bus" class="p5-select">${c.fleet.map((f) => `<option value="${f.uid}">${escHtml(f.nickname)}</option>`).join('')}</select>
              <button id="p5-create-route" class="btn btn-primary" style="margin-top:6px;">CREATE ROUTE SCHEDULE</button>
            </div>
            <div class="p5-card">
              <h3>🚌 Company Routes (${c.customRoutes.length}/${g.company.getOfficeConfig().maxRoutes})</h3>
              ${c.customRoutes.length === 0 ? '<small>No custom routes yet. Connect any of 64 districts &amp; terminals on the left!</small>' : c.customRoutes.map((r) => `
                <div class="p5-card" style="padding:7px 9px;">
                  <div class="p5-row"><b>${escHtml(r.nameEn)}</b><span class="badge-pill">${r.departureTime} • ৳${r.ticketPrice}</span></div>
                  <small>${r.distKm || 60} km • Est: ৳${(r.estimatedIncome || 0).toLocaleString()}/trip • Cap: ${r.capacity} pax</small>
                  <div class="p5-row">
                    <button class="btn btn-primary p5-drive-custom-rt" data-id="${r.id}" style="padding:4px 9px;font-size:10px;">Drive Route</button>
                    <button class="btn btn-secondary p5-tog-custom-rt" data-id="${r.id}" style="padding:4px 9px;font-size:10px;">${r.active ? 'Active' : 'Paused'}</button>
                    <button class="btn btn-danger p5-del-custom-rt" data-id="${r.id}" style="padding:4px 9px;font-size:10px;">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        document.getElementById('p5-create-route').addEventListener('click', () => {
          const res = g.company.createCustomRoute({
            fromId: document.getElementById('p5-rt-from').value,
            toId: document.getElementById('p5-rt-to').value,
            departureTime: document.getElementById('p5-rt-time').value,
            ticketPrice: document.getElementById('p5-rt-fare').value,
            busUid: document.getElementById('p5-rt-bus').value
          });
          if (res.ok) g.sound.playChime();
          g.showToast(res.msg);
          this.renderTerminalsModal();
        });
        body.querySelectorAll('.p5-drive-custom-rt').forEach((btn) => btn.addEventListener('click', () => {
          const rt = c.customRoutes.find((r) => r.id === btn.getAttribute('data-id'));
          if (rt) {
            document.getElementById('terminals-modal').classList.add('hidden');
            g.startRouteMission(rt);
          }
        }));
        body.querySelectorAll('.p5-tog-custom-rt').forEach((btn) => btn.addEventListener('click', () => {
          g.showToast(g.company.toggleCustomRoute(btn.getAttribute('data-id')).msg);
          this.renderTerminalsModal();
        }));
        body.querySelectorAll('.p5-del-custom-rt').forEach((btn) => btn.addEventListener('click', () => {
          g.showToast(g.company.deleteCustomRoute(btn.getAttribute('data-id')).msg);
          this.renderTerminalsModal();
        }));
        return;
      }

      // Bus Terminals Tab (filterable across 8 Divisions & major hubs)
      const activeDivFilter = this.terminalDivFilter || 'terminals';
      const Geo = global.BDGeoData;
      const divs = Geo ? Geo.BD_DIVISIONS : [];
      const terminals = Object.values(BANGLADESH_LOCATIONS).filter((l) => {
        if (activeDivFilter === 'terminals') return l.isTerminal || l.id === 'gazipur' || l.id === 'cumilla';
        return l.division === activeDivFilter && (l.isDistrict || l.isTerminal);
      });
      body.innerHTML = `
        <div class="p5-row" style="margin-bottom:8px;">
          <small>Filter Terminals &amp; District Counters across all 8 Divisions:</small>
          <select id="p5-term-div-filter" class="p5-select">
            <option value="terminals" ${activeDivFilter === 'terminals' ? 'selected' : ''}>Major Intercity Terminals</option>
            ${divs.map((d) => `<option value="${d.id}" ${activeDivFilter === d.id ? 'selected' : ''}>${d.nameEn} Division (${d.nameBn})</option>`).join('')}
          </select>
        </div>
        <div class="p5-grid">${terminals.map((loc) => {
        const st = g.company.getTerminalState(loc.id);
        return `
          <div class="p5-card">
            <div class="p5-row"><h3>${loc.nameEn} (${loc.nameBn})</h3><span class="badge-pill ${st.owned ? '' : 'badge-amber'}">${st.owned ? 'OWNED' : 'FOR SALE'}</span></div>
            ${st.owned ? `
              <small>Cleanliness: <b>${st.cleanLvl}%</b> • Pax Satisfaction: <b>${st.satisfaction}%</b></small>
              <small>Parking Lv${st.parkingLvl} • Waiting Lv${st.waitingLvl} • Counters Lv${st.counterLvl} • Board Lv${st.boardLvl} • Staff Lv${st.staffLvl}</small>
              <div class="p5-row">
                <button class="btn btn-secondary p5-term-upg" data-loc="${loc.id}" data-key="parkingLvl" style="padding:4px 7px;font-size:10px;">+Parking</button>
                <button class="btn btn-secondary p5-term-upg" data-loc="${loc.id}" data-key="waitingLvl" style="padding:4px 7px;font-size:10px;">+Lounge</button>
                <button class="btn btn-secondary p5-term-upg" data-loc="${loc.id}" data-key="counterLvl" style="padding:4px 7px;font-size:10px;">+Counters</button>
                <button class="btn btn-secondary p5-term-upg" data-loc="${loc.id}" data-key="boardLvl" style="padding:4px 7px;font-size:10px;">+Display</button>
                <button class="btn btn-primary p5-term-clean" data-loc="${loc.id}" style="padding:4px 7px;font-size:10px;">Clean (৳450)</button>
              </div>
            ` : `
              <small>${loc.lat.toFixed(2)}°N, ${loc.lon.toFixed(2)}°E • Earn daily terminal fees.</small>
              <button class="btn btn-primary p5-buy-term" data-loc="${loc.id}">BUY TERMINAL (৳ ${(loc.terminalCost || 20000).toLocaleString()})</button>
            `}
          </div>
        `;
      }).join('')}</div>`;
      const termDivSel = document.getElementById('p5-term-div-filter');
      if (termDivSel) {
        termDivSel.addEventListener('change', () => {
          this.terminalDivFilter = termDivSel.value;
          this.renderTerminalsModal();
        });
      }
      body.querySelectorAll('.p5-buy-term').forEach((btn) => btn.addEventListener('click', () => {
        const res = g.company.buyTerminal(btn.getAttribute('data-loc'));
        if (res.ok) { g.sound.playChime(); g.refreshMenuStats(); }
        g.showToast(res.msg);
        this.renderTerminalsModal();
      }));
      body.querySelectorAll('.p5-term-upg').forEach((btn) => btn.addEventListener('click', () => {
        g.showToast(g.company.upgradeTerminalFacility(btn.getAttribute('data-loc'), btn.getAttribute('data-key')).msg);
        this.renderTerminalsModal();
      }));
      body.querySelectorAll('.p5-term-clean').forEach((btn) => btn.addEventListener('click', () => {
        g.showToast(g.company.cleanTerminal(btn.getAttribute('data-loc')).msg);
        this.renderTerminalsModal();
      }));
    }

    renderEconomyModal() {
      const g = this.game;
      const c = g.save.company;
      const p = g.save.progression;
      const body = document.getElementById('economy-tab-body');
      document.getElementById('economy-modal-sub').textContent =
        `Balance: ৳${Math.round(g.save.taka).toLocaleString()} • Day ${c.dayNumber} • Level ${p.level} (${p.xp} XP)`;

      if (this.economyTab === 'reports') {
        body.innerHTML = `
          <div class="p5-row" style="margin-bottom:8px;">
            <span class="badge-pill">Total Company Revenue: ৳${Math.round(c.revenueTotal || 0).toLocaleString()}</span>
            <button id="p5-close-day-btn" class="btn btn-primary">📊 Close Business Day &amp; Generate Report</button>
          </div>
          <div class="p5-grid">
            ${(c.dailyReports || []).slice(0, 6).map((r) => `
              <div class="p5-card">
                <div class="p5-row"><h3>Day ${r.day} Financial Statement</h3><span class="badge-pill ${r.netProfit >= 0 ? '' : 'badge-amber'}">Net: ${r.netProfit >= 0 ? '+' : ''}৳${r.netProfit.toLocaleString()}</span></div>
                <small>Tickets: +৳${r.ticketIncome} • Rentals: +৳${r.rentalIncome} • Terminals: +৳${r.terminalIncome}</small>
                <small>Salaries: -৳${r.salaries} • Fuel/Tolls: -৳${r.fuel + r.tolls} • Loans/Fees: -৳${r.loanPayments + r.terminalFees + r.insurance}</small>
              </div>
            `).join('') || '<div class="p5-card"><small>No daily reports yet. Assign drivers/routes or click "Close Business Day" above!</small></div>'}
          </div>
        `;
        document.getElementById('p5-close-day-btn').addEventListener('click', () => {
          const rep = g.company.runBusinessDayCycle();
          g.sound.playChime();
          g.refreshMenuStats();
          g.showToast(`Day ${rep.day} Settled: Net ${rep.netProfit >= 0 ? '+' : ''}৳ ${rep.netProfit.toLocaleString()}`);
          this.renderEconomyModal();
        });
        return;
      }

      if (this.economyTab === 'loans') {
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🏦 Active Business Loans (${c.loans.length}/2)</h3>
              ${c.loans.length === 0 ? '<small>Debt-free! Take an expansion loan on the right if needed.</small>' : c.loans.map((l) => `
                <div class="p5-card" style="padding:7px 9px;">
                  <b>${escHtml(l.name)}</b>
                  <small>Remaining: ৳${l.remaining.toLocaleString()} • Daily Installment: ৳${l.dailyPayment.toLocaleString()}</small>
                  <button class="btn btn-primary p5-repay-loan" data-id="${l.id}" style="padding:4px 9px;font-size:11px;">Pay Off Full Balance</button>
                </div>
              `).join('')}
            </div>
            <div class="p5-card">
              <h3>💳 Bangladesh Transport Credit</h3>
              ${LOAN_OFFERS.map((o) => `
                <div class="p5-card" style="padding:7px 9px;">
                  <div class="p5-row"><b>${o.name}</b><span class="badge-pill badge-amber">+৳${o.principal.toLocaleString()}</span></div>
                  <small>Interest: ${o.interestPct}% • Daily Repay: ৳${o.dailyPayment.toLocaleString()}</small>
                  <button class="btn btn-secondary p5-take-loan" data-id="${o.id}" style="padding:5px 9px;font-size:11px;">TAKE LOAN</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        body.querySelectorAll('.p5-take-loan').forEach((btn) => btn.addEventListener('click', () => {
          const res = g.company.takeLoan(btn.getAttribute('data-id'));
          if (res.ok) g.refreshMenuStats();
          g.showToast(res.msg);
          this.renderEconomyModal();
        }));
        body.querySelectorAll('.p5-repay-loan').forEach((btn) => btn.addEventListener('click', () => {
          const res = g.company.repayLoan(btn.getAttribute('data-id'));
          if (res.ok) g.refreshMenuStats();
          g.showToast(res.msg);
          this.renderEconomyModal();
        }));
        return;
      }

      // Progression & Achievements Tab
      const nextXp = Math.pow(p.level, 2) * 250;
      const pct = Math.min(100, Math.round((p.xp / Math.max(1, nextXp)) * 100));
      body.innerHTML = `
        <div class="p5-grid">
          <div class="p5-card">
            <h3>🎖️ Captain Progression &amp; Daily Bonus</h3>
            <small>Driver Level: <b>Lv ${p.level}</b> (${p.xp}/${nextXp} XP)</small>
            <div class="bar-track"><div class="bar-fill bar-green" style="width:${pct}%"></div></div>
            <small>Driving Skill Rating: <b>${Math.round(p.drivingRating || 96)}%</b> • Convoys Completed: <b>${p.convoysCompleted || 0}</b> • Login Streak: <b>${p.dailyStreak || 0}d</b></small>
            <button id="p5-claim-daily" class="btn btn-primary" style="margin-top:6px;">🎁 CLAIM DAILY LOGIN REWARD</button>
          </div>
          <div class="p5-card">
            <h3>🏆 Career Achievements (${(p.achievements || []).length}/${ACHIEVEMENTS_CATALOG.length})</h3>
            ${ACHIEVEMENTS_CATALOG.map((a) => {
              const unlocked = (p.achievements || []).includes(a.id);
              return `
                <div class="lb-row ${unlocked ? 'me' : ''}">
                  <span><b>${unlocked ? '✅' : '🔒'} ${a.title}</b><br/><small>${a.desc}</small></span>
                  <span class="badge-pill ${unlocked ? '' : 'badge-amber'}">+৳${a.reward.toLocaleString()}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      document.getElementById('p5-claim-daily').addEventListener('click', () => {
        const res = g.company.claimDailyReward();
        if (res.ok) { g.sound.playChime(); g.refreshMenuStats(); }
        g.showToast(res.msg);
        this.renderEconomyModal();
      });
    }

    async renderOnlineModal(triggerFetch = false) {
      const g = this.game;
      const mp = g.multiplayer;
      const body = document.getElementById('online-tab-body');
      const statusEl = document.getElementById('online-auth-status');
      statusEl.textContent = mp.auth.signedIn
        ? `🟢 Connected as ${mp.auth.displayName || 'BD Driver'} (${mp.auth.email || 'Google Account'}) • Friend Code: ${g.save.progression.friendCode || 'Syncing'}`
        : '⚪ Offline Local Mode • Sign in with Google for Cloud Save, Multiplayer & Convoy';

      if (this.onlineTab === 'account') {
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>👤 Online Driver Account</h3>
              <label class="p5-muted">Driver Display Name</label>
              <input id="p5-driver-name" class="p5-input" maxlength="40" value="${escHtml(g.save.progression.driverName || mp.auth.displayName || 'BD Captain')}" />
              <small>Your Friend Code: <b>${escHtml(g.save.progression.friendCode || 'Sign in to generate')}</b></small>
              <div class="p5-row" style="margin-top:4px;">
                ${mp.auth.signedIn
                  ? `<button id="p5-signout-btn" class="btn btn-danger">Sign Out</button>`
                  : `<button id="p5-google-signin" class="btn btn-primary">🔵 Sign in with Google</button>`}
                <button id="p5-save-drivername" class="btn btn-secondary">Save Name</button>
              </div>
            </div>
            <div class="p5-card">
              <h3>☁️ Cross-Device Cloud Save</h3>
              <small>Synchronizes your Taka, Company, Fleet, Staff, Custom Routes, Terminals, XP &amp; Achievements securely to Firestore.</small>
              <div class="p5-row" style="margin-top:6px;">
                <button id="p5-cloud-push" class="btn btn-primary">☁️ Sync Now</button>
                <button id="p5-cloud-pull" class="btn btn-secondary">⬇️ Restore Cloud Save</button>
              </div>
            </div>
          </div>
        `;
        document.getElementById('p5-save-drivername').addEventListener('click', () => {
          const val = document.getElementById('p5-driver-name').value.trim().slice(0, 40);
          if (val.length >= 2) {
            g.save.progression.driverName = val;
            persistSave(g.save);
            mp.syncProfileToCloud(false);
            g.showToast(`Driver name set to ${val}`);
          }
        });
        const signInBtn = document.getElementById('p5-google-signin');
        if (signInBtn) signInBtn.addEventListener('click', async () => {
          await mp.signInWithGoogle();
          this.renderOnlineModal(false);
        });
        const signOutBtn = document.getElementById('p5-signout-btn');
        if (signOutBtn) signOutBtn.addEventListener('click', async () => {
          await mp.signOut();
          this.renderOnlineModal(false);
        });
        document.getElementById('p5-cloud-push').addEventListener('click', async () => {
          const res = await mp.syncProfileToCloud(true);
          if (!res.ok) g.showToast(res.error);
          this.renderOnlineModal(false);
        });
        document.getElementById('p5-cloud-pull').addEventListener('click', async () => {
          const res = await mp.loadFromCloud();
          if (res.ok) { g.spawnPlayerBus(); g.refreshMenuStats(); }
          else g.showToast(res.error);
          this.renderOnlineModal(false);
        });
        return;
      }

      if (this.onlineTab === 'rooms') {
        if (mp.currentRoom) {
          const r = mp.currentRoom;
          const isHost = r.hostUid === mp.auth.uid;
          body.innerHTML = `
            <div class="p5-grid">
              <div class="p5-card">
                <div class="p5-row"><h3>${escHtml(r.title)}</h3><span class="badge-pill badge-blue">Code: ${escHtml(r.roomCode)}</span></div>
                <small>Mode: <b>${r.mode.toUpperCase()}</b> • Route: <b>${r.routeId}</b> • Players: <b>${mp.roomPlayers.length}/${r.maxPlayers}</b></small>
                <div class="p5-row">
                  <button id="p5-drive-room" class="btn btn-primary">🚌 Drive in This Session</button>
                  ${isHost ? '<button id="p5-start-convoy" class="btn btn-secondary">🚦 Start Convoy</button>' : ''}
                  <button id="p5-leave-room" class="btn btn-danger">Leave Room</button>
                </div>
                <h3 style="margin-top:6px;">👥 Online Drivers</h3>
                ${mp.roomPlayers.map((pl) => `
                  <div class="lb-row ${pl.uid === mp.auth.uid ? 'me' : ''}">
                    <span>${r.leaderUid === pl.uid ? '👑 ' : '🚌 '}<b>${escHtml(pl.displayName)}</b> <small>(${Math.round(pl.speedKmh || 0)} km/h • ${Math.round(pl.progressPct || 0)}%)</small></span>
                    ${isHost && pl.uid !== r.leaderUid ? `<button class="btn btn-secondary p5-make-leader" data-uid="${pl.uid}" style="padding:3px 7px;font-size:10px;">Set Leader</button>` : ''}
                  </div>
                `).join('')}
              </div>
              <div class="p5-card">
                <h3>💬 Multiplayer Room Chat</h3>
                <div class="chat-box" id="p5-chat-box">
                  ${mp.chatMessages.map((m) => `<div class="chat-msg"><b>${escHtml(m.senderName)}:</b> ${escHtml(m.text)}</div>`).join('') || '<small>No messages yet. Say Salam to your convoy!</small>'}
                </div>
                <div class="p5-row">
                  <input id="p5-chat-input" class="p5-input" style="flex:1" maxlength="200" placeholder="Type convoy message..." />
                  <button id="p5-send-chat" class="btn btn-primary">Send</button>
                </div>
              </div>
            </div>
          `;
          document.getElementById('p5-drive-room').addEventListener('click', () => {
            document.getElementById('online-modal').classList.add('hidden');
            if (g.mode === 'menu') {
              const allRoutes = g.company.getAllRoutes();
              const rt = allRoutes.find((x) => x.id === r.routeId) || allRoutes[0];
              if (r.mode === 'convoy' || r.mode === 'competition') g.startRouteMission(rt);
              else g.startFreeDrive();
            } else {
              g.paused = false;
            }
          });
          const startBtn = document.getElementById('p5-start-convoy');
          if (startBtn) startBtn.addEventListener('click', async () => {
            await mp.startConvoyRun();
            g.showToast('🚦 Convoy Rollout Active!');
          });
          document.getElementById('p5-leave-room').addEventListener('click', async () => {
            await mp.leaveRoom();
            this.renderOnlineModal(false);
          });
          body.querySelectorAll('.p5-make-leader').forEach((btn) => btn.addEventListener('click', () => {
            mp.setConvoyLeader(btn.getAttribute('data-uid'));
          }));
          document.getElementById('p5-send-chat').addEventListener('click', async () => {
            const inp = document.getElementById('p5-chat-input');
            const txt = inp.value.trim();
            if (!txt) return;
            inp.value = '';
            const res = await mp.sendChat(txt);
            if (!res.ok) g.showToast(res.error);
          });
          return;
        }

        if (triggerFetch && mp.auth.signedIn) {
          await mp.refreshRooms();
        }
        const allRoutes = g.company.getAllRoutes();
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🚛 Create Multiplayer / Convoy Room</h3>
              <input id="p5-room-title" class="p5-input" maxlength="50" value="${escHtml(g.save.company.name)} Highway Convoy" />
              <div class="p5-row">
                <select id="p5-room-mode" class="p5-select" style="flex:1">
                  <option value="convoy">🚛 Convoy Mode</option>
                  <option value="free">🛣️ Free Highway</option>
                  <option value="competition">🏁 Route Race</option>
                </select>
                <select id="p5-room-route" class="p5-select" style="flex:1">
                  ${allRoutes.map((rt) => `<option value="${rt.id}">${escHtml(rt.nameEn)}</option>`).join('')}
                </select>
              </div>
              <label class="p5-muted"><input type="checkbox" id="p5-room-priv" /> Private Room (Invite Code Only)</label>
              <button id="p5-create-room" class="btn btn-primary">CREATE &amp; ENTER ROOM</button>
              <hr style="border-color:rgba(255,255,255,0.1);margin:4px 0;" />
              <div class="p5-row">
                <input id="p5-join-code" class="p5-input" style="flex:1" placeholder="Enter 6-digit Room Code..." />
                <button id="p5-join-code-btn" class="btn btn-secondary">Join Code</button>
              </div>
            </div>
            <div class="p5-card">
              <div class="p5-row"><h3>🌐 Active Public Sessions</h3><button id="p5-refresh-rooms" class="btn btn-secondary" style="padding:4px 8px;font-size:10px;">↻ Refresh</button></div>
              ${mp.roomsList.filter((rm) => !rm.isPrivate).map((rm) => `
                <div class="lb-row">
                  <span><b>${escHtml(rm.title)}</b><br/><small>${rm.mode.toUpperCase()} • Host: ${escHtml(rm.hostName)} • Code: ${rm.roomCode}</small></span>
                  <button class="btn btn-primary p5-join-room-btn" data-id="${rm.roomId}" style="padding:5px 9px;font-size:11px;">Join</button>
                </div>
              `).join('') || `<small>${mp.auth.signedIn ? 'No active public rooms yet. Create one on the left!' : 'Sign in with Google on Account tab to browse live Firestore rooms.'}</small>`}
            </div>
          </div>
        `;
        document.getElementById('p5-create-room').addEventListener('click', async () => {
          const res = await mp.createRoom({
            title: document.getElementById('p5-room-title').value,
            mode: document.getElementById('p5-room-mode').value,
            routeId: document.getElementById('p5-room-route').value,
            isPrivate: document.getElementById('p5-room-priv').checked,
            maxPlayers: 8
          }, g.physics, g.getSelectedBusSpec());
          if (!res.ok) g.showToast(res.error);
          this.renderOnlineModal(false);
        });
        document.getElementById('p5-join-code-btn').addEventListener('click', async () => {
          const res = await mp.joinRoom(document.getElementById('p5-join-code').value, g.physics, g.getSelectedBusSpec());
          if (!res.ok) g.showToast(res.error);
          this.renderOnlineModal(false);
        });
        document.getElementById('p5-refresh-rooms').addEventListener('click', () => this.renderOnlineModal(true));
        body.querySelectorAll('.p5-join-room-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const res = await mp.joinRoom(btn.getAttribute('data-id'), g.physics, g.getSelectedBusSpec());
          if (!res.ok) g.showToast(res.error);
          this.renderOnlineModal(false);
        }));
        return;
      }

      if (this.onlineTab === 'friends') {
        const inc = mp.friendsState.incoming || [];
        const out = mp.friendsState.outgoing || [];
        const accepted = [
          ...inc.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.senderUid, name: r.senderName })),
          ...out.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.targetUid, name: r.targetName }))
        ];
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🤝 Add Online Friend</h3>
              <small>Your Friend Code: <b>${escHtml(g.save.progression.friendCode || 'Sign in first')}</b></small>
              <div class="p5-row">
                <input id="p5-friend-code-inp" class="p5-input" style="flex:1" placeholder="Friend Code (e.g. BD-AB12CD)" />
                <button id="p5-send-friend-req" class="btn btn-primary">Send Request</button>
              </div>
              <h3 style="margin-top:6px;">📩 Incoming Requests</h3>
              ${inc.filter((r) => r.status === 'pending').map((r) => `
                <div class="lb-row">
                  <span><b>${escHtml(r.senderName)}</b></span>
                  <span>
                    <button class="btn btn-primary p5-acc-req" data-id="${r.id}" style="padding:3px 8px;font-size:10px;">Accept</button>
                    <button class="btn btn-danger p5-dec-req" data-id="${r.id}" style="padding:3px 8px;font-size:10px;">Decline</button>
                  </span>
                </div>
              `).join('') || '<small>No pending friend requests.</small>'}
            </div>
            <div class="p5-card">
              <h3>👥 Friends List (${accepted.length})</h3>
              ${accepted.map((f) => `
                <div class="lb-row">
                  <span>🟢 <b>${escHtml(f.name)}</b></span>
                  <span class="badge-pill">Friend</span>
                </div>
              `).join('') || '<small>Accepted friends appear here. Share your room code for convoy driving!</small>'}
            </div>
          </div>
        `;
        document.getElementById('p5-send-friend-req').addEventListener('click', async () => {
          const res = await mp.sendFriendRequest(document.getElementById('p5-friend-code-inp').value);
          g.showToast(res.ok ? `Friend request sent to ${res.targetName}!` : res.error);
          this.renderOnlineModal(false);
        });
        body.querySelectorAll('.p5-acc-req').forEach((btn) => btn.addEventListener('click', async () => {
          await mp.respondFriendRequest(btn.getAttribute('data-id'), true);
          this.renderOnlineModal(false);
        }));
        body.querySelectorAll('.p5-dec-req').forEach((btn) => btn.addEventListener('click', async () => {
          await mp.respondFriendRequest(btn.getAttribute('data-id'), false);
          this.renderOnlineModal(false);
        }));
        return;
      }

      if (this.onlineTab === 'competitions') {
        if (triggerFetch && mp.auth.signedIn) {
          await mp.fetchCompetition(mp.activeCompId);
        }
        body.innerHTML = `
          <div class="p5-grid">
            <div class="p5-card">
              <h3>🏁 Weekly Online Challenges</h3>
              ${WEEKLY_COMPETITIONS.map((cp) => `
                <div class="p5-card" style="padding:7px 9px;${mp.activeCompId === cp.id ? 'border-color:#34d399' : ''}">
                  <div class="p5-row"><b>${cp.title}</b><span class="badge-pill badge-amber">Prize: ৳${cp.rewardTaka.toLocaleString()}</span></div>
                  <small>${cp.desc}</small>
                  <button class="btn btn-secondary p5-pick-comp" data-id="${cp.id}" style="padding:4px 8px;font-size:10px;">View Rankings</button>
                </div>
              `).join('')}
              <button id="p5-submit-comp" class="btn btn-primary">📤 Submit My Live Scores</button>
            </div>
            <div class="p5-card">
              <h3>🏆 Challenge Standings</h3>
              ${mp.competitionEntries.map((e, i) => `
                <div class="lb-row ${e.userId === mp.auth.uid ? 'me' : ''}">
                  <span><b>#${i + 1} ${escHtml(e.displayName)}</b> <small>(${escHtml(e.companyName)})</small></span>
                  <b>${Math.round(e.score * 10) / 10} ${escHtml(e.metricLabel)}</b>
                </div>
              `).join('') || `<small>${mp.auth.signedIn ? 'No entries submitted yet for this event.' : 'Sign in with Google to compete online!'}</small>`}
            </div>
          </div>
        `;
        body.querySelectorAll('.p5-pick-comp').forEach((btn) => btn.addEventListener('click', () => {
          mp.activeCompId = btn.getAttribute('data-id');
          this.renderOnlineModal(true);
        }));
        document.getElementById('p5-submit-comp').addEventListener('click', async () => {
          if (!mp.auth.signedIn) return g.showToast('Sign in with Google first!');
          await mp.submitCompetitions();
          g.showToast('🏁 Competition scores submitted!');
          this.renderOnlineModal(true);
        });
        return;
      }

      // Leaderboards Tab
      if (triggerFetch && mp.auth.signedIn) {
        await mp.refreshLeaderboard(mp.leaderboardCategory);
      }
      const cats = [
        ['taka', 'Cash Balance (৳)'],
        ['companyRevenue', 'Company Revenue'],
        ['busesOwned', 'Buses Owned'],
        ['distanceKm', 'Distance Driven'],
        ['safeScore', 'Safe Driver Score'],
        ['missionsCompleted', 'Missions Completed'],
        ['level', 'Player Level'],
        ['convoyCompleted', 'Convoy Wins']
      ];
      body.innerHTML = `
        <div class="p5-row" style="margin-bottom:8px;">
          <select id="p5-lb-cat" class="p5-select">
            ${cats.map(([k, lbl]) => `<option value="${k}" ${mp.leaderboardCategory === k ? 'selected' : ''}>${lbl}</option>`).join('')}
          </select>
          <button id="p5-lb-refresh" class="btn btn-secondary">↻ Refresh Rankings</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;max-height:240px;overflow-y:auto;">
          ${mp.leaderboardRows.map((row, idx) => `
            <div class="lb-row ${row.userId === mp.auth.uid ? 'me' : ''}">
              <span><b>#${idx + 1} ${escHtml(row.displayName)}</b> <small>(${escHtml(row.companyName || 'Independent')})</small></span>
              <b>${Math.round((row[mp.leaderboardCategory] || 0) * 10) / 10}</b>
            </div>
          `).join('') || `<small>${mp.auth.signedIn ? 'No leaderboard players synced yet. Tap Sync Now on Account tab!' : 'Sign in with Google to load live global leaderboards.'}</small>`}
        </div>
      `;
      document.getElementById('p5-lb-cat').addEventListener('change', (e) => {
        mp.leaderboardCategory = e.target.value;
        this.renderOnlineModal(true);
      });
      document.getElementById('p5-lb-refresh').addEventListener('click', () => this.renderOnlineModal(true));
    }
  }

  global.BDPhase5UI = BDPhase5UI;
})(typeof window !== 'undefined' ? window : globalThis);
