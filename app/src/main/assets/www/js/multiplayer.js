(function (global) {
  'use strict';

  const { BUS_CATALOG, BANGLADESH_LOCATIONS, persistSave } = global.BDGameConfig;

  class BDMultiplayerManager {
    constructor(scene, save, company, onToast, onUIRefresh) {
      this.scene = scene;
      this.save = save;
      this.company = company;
      this.onToast = onToast;
      this.onUIRefresh = onUIRefresh;

      this.pending = new Map();
      this.reqCounter = 1;
      this.auth = { signedIn: false, uid: '', displayName: '', email: '' };
      this.friendsState = { incoming: [], outgoing: [] };
      this.roomsList = [];
      this.currentRoom = null;
      this.roomPlayers = [];
      this.chatMessages = [];
      this.leaderboardRows = [];
      this.leaderboardCategory = 'taka';
      this.competitionEntries = [];
      this.activeCompId = 'weekly_distance';

      this.remoteBuses = new Map();
      this.telemetryAccum = 0;
      this.convoyCompletedThisSession = false;
      this.convoyStatus = {
        active: false,
        leaderName: '',
        distanceToLeaderM: 0,
        followAngleDeg: 0,
        sharedProgressPct: 0
      };

      this.initBridge();
    }

    hasAndroidBridge() {
      return !!(global.AndroidBridge && typeof global.AndroidBridge.fbRequest === 'function');
    }

    initBridge() {
      global.onNativeBridgeResponse = (reqId, result) => {
        const resolver = this.pending.get(reqId);
        if (resolver) {
          this.pending.delete(reqId);
          resolver(result || { ok: false, error: 'Empty response' });
        }
      };

      global.onNativeFirebaseEvent = (eventName, payload) => {
        if (eventName === 'authState') {
          this.auth = {
            signedIn: !!payload.signedIn,
            uid: payload.uid || '',
            displayName: payload.displayName || '',
            email: payload.email || ''
          };
          if (this.auth.displayName && (!this.save.progression.driverName || this.save.progression.driverName === 'BD Captain')) {
            this.save.progression.driverName = this.auth.displayName;
          }
          if (this.auth.uid && !this.save.progression.friendCode) {
            const clean = this.auth.uid.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            this.save.progression.friendCode = `BD-${clean.slice(0, 6).padEnd(6, 'X')}`;
          }
          persistSave(this.save);
          if (this.auth.signedIn) {
            this.syncProfileToCloud(false);
          } else {
            this.clearRemoteBuses();
            this.currentRoom = null;
            this.roomPlayers = [];
            this.chatMessages = [];
          }
          if (this.onUIRefresh) this.onUIRefresh();
        } else if (eventName === 'friendRequests') {
          this.friendsState = {
            incoming: Array.isArray(payload.incoming) ? payload.incoming : [],
            outgoing: Array.isArray(payload.outgoing) ? payload.outgoing : []
          };
          if (this.onUIRefresh) this.onUIRefresh();
        } else if (eventName === 'roomUpdated') {
          this.currentRoom = payload;
          if (this.onUIRefresh) this.onUIRefresh();
        } else if (eventName === 'roomPlayers') {
          this.roomPlayers = Array.isArray(payload.players) ? payload.players : [];
          this.reconcileRemoteBuses();
          if (this.onUIRefresh) this.onUIRefresh();
        } else if (eventName === 'roomChat') {
          this.chatMessages = Array.isArray(payload.messages) ? payload.messages : [];
          if (this.onUIRefresh) this.onUIRefresh();
        } else if (eventName === 'roomLeft') {
          this.currentRoom = null;
          this.roomPlayers = [];
          this.chatMessages = [];
          this.clearRemoteBuses();
          if (this.onUIRefresh) this.onUIRefresh();
        }
      };

      if (this.hasAndroidBridge() && typeof global.AndroidBridge.getAuthSnapshot === 'function') {
        try {
          const snap = JSON.parse(global.AndroidBridge.getAuthSnapshot());
          if (snap && snap.signedIn) {
            this.auth = snap;
          }
        } catch (_) {}
      }
    }

    callBridge(action, payloadObj) {
      if (!this.hasAndroidBridge()) {
        return Promise.resolve({
          ok: false,
          offlinePreview: true,
          error: 'Online Firebase requires the Android APK signed in with Google.'
        });
      }
      return new Promise((resolve) => {
        const reqId = `req_${this.reqCounter++}_${Date.now()}`;
        const timer = setTimeout(() => {
          if (this.pending.has(reqId)) {
            this.pending.delete(reqId);
            resolve({ ok: false, error: 'Network request timed out.' });
          }
        }, 15000);
        this.pending.set(reqId, (res) => {
          clearTimeout(timer);
          resolve(res);
        });
        try {
          global.AndroidBridge.fbRequest(reqId, action, JSON.stringify(payloadObj || {}));
        } catch (err) {
          clearTimeout(timer);
          this.pending.delete(reqId);
          resolve({ ok: false, error: err.message || 'Native bridge error' });
        }
      });
    }

    async signInWithGoogle() {
      const res = await this.callBridge('signInGoogle', {});
      if (res.ok) {
        if (this.onToast) this.onToast(`✅ Signed in as ${res.displayName || 'BD Driver'}`);
        await this.syncProfileToCloud(false);
        await this.refreshRooms();
      } else if (!res.cancelled && this.onToast) {
        this.onToast(res.error || 'Google Sign-In unavailable');
      }
      return res;
    }

    async signOut() {
      await this.leaveRoom();
      const res = await this.callBridge('signOut', {});
      if (this.onToast) this.onToast('Signed out — Offline local save active.');
      return res;
    }

    buildProfilePayload() {
      const c = this.save.company;
      const p = this.save.progression;
      const acceptedFriends = [];
      this.friendsState.incoming.filter((r) => r.status === 'accepted').forEach((r) => acceptedFriends.push(r.senderUid));
      this.friendsState.outgoing.filter((r) => r.status === 'accepted').forEach((r) => acceptedFriends.push(r.targetUid));

      return {
        displayName: p.driverName || this.auth.displayName || 'BD Driver',
        companyName: c.name || 'Bangladesh Bus Co',
        companyColor: c.color || '#0c7c48',
        friendCode: p.friendCode || 'BD-LOCAL',
        level: p.level || 1,
        xp: p.xp || 0,
        taka: Math.round(this.save.taka || 0),
        distanceKm: Number((this.save.totalDistanceKm || 0).toFixed(2)),
        safeScore: Math.round(p.drivingRating || 96),
        missionsCompleted: this.save.tripsCompleted || 0,
        busesOwned: c.fleet.length || 1,
        companyRevenue: Math.round(c.revenueTotal || 0),
        convoyCompleted: p.convoysCompleted || 0,
        friends: Array.from(new Set(acceptedFriends)).slice(0, 50)
      };
    }

    async syncProfileToCloud(showMessage = true) {
      if (!this.auth.signedIn) {
        return { ok: false, error: 'Sign in with Google to enable Cloud Sync.' };
      }
      this.company.syncActiveBusState();
      const profileJson = JSON.stringify(this.buildProfilePayload());
      const saveJson = JSON.stringify(this.save);
      const res = await this.callBridge('syncAll', { profileJson, saveJson });
      if (res.ok && res.friendCode) {
        this.save.progression.friendCode = res.friendCode;
        persistSave(this.save);
      }
      if (showMessage && this.onToast) {
        this.onToast(res.ok ? '☁️ Company & progress synced to Cloud!' : (res.error || 'Cloud sync failed'));
      }
      return res;
    }

    async loadFromCloud() {
      if (!this.auth.signedIn) {
        return { ok: false, error: 'Sign in with Google to restore Cloud Save.' };
      }
      const res = await this.callBridge('loadSave', {});
      if (!res.ok) return res;
      if (!res.exists || !res.payloadJson) {
        return { ok: false, error: 'No cloud save found yet. Tap Sync Now first!' };
      }
      try {
        const parsed = JSON.parse(res.payloadJson);
        Object.assign(this.save, parsed);
        this.company.ensureInitialized();
        persistSave(this.save);
        if (this.onToast) this.onToast('☁️ Cloud Save restored! Balance & fleet updated.');
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Cloud save data invalid.' };
      }
    }

    async refreshLeaderboard(category) {
      if (category) this.leaderboardCategory = category;
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in to view online leaderboards.' };
      const res = await this.callBridge('leaderboard', { category: this.leaderboardCategory });
      if (res.ok) {
        this.leaderboardRows = Array.isArray(res.rows) ? res.rows : [];
      }
      return res;
    }

    async sendFriendRequest(friendCode) {
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in with Google to add friends.' };
      return this.callBridge('sendFriendReq', {
        friendCode,
        myName: this.save.progression.driverName || this.auth.displayName || 'BD Driver'
      });
    }

    async respondFriendRequest(reqId, accept) {
      const res = await this.callBridge('respondFriendReq', { reqId, accept });
      if (res.ok) await this.syncProfileToCloud(false);
      return res;
    }

    async refreshRooms() {
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in to browse live multiplayer rooms.' };
      const res = await this.callBridge('listRooms', {});
      if (res.ok) {
        this.roomsList = Array.isArray(res.rooms) ? res.rooms : [];
      }
      return res;
    }

    buildPlayerTelemetry(physics, busSpec, progressPct = 0) {
      return {
        displayName: this.save.progression.driverName || this.auth.displayName || 'BD Driver',
        companyName: this.save.company.name || 'Bangladesh Transport',
        companyColor: this.save.company.color || '#10b981',
        busId: busSpec ? busSpec.id : 'green_line',
        x: Number((physics ? physics.x : 0).toFixed(2)),
        y: Number((physics ? physics.y : 0.05).toFixed(2)),
        z: Number((physics ? physics.z : 0).toFixed(2)),
        yaw: Number((physics ? physics.yaw : 0).toFixed(3)),
        speedKmh: Number((physics ? physics.speedMs * 3.6 : 0).toFixed(1)),
        beamMode: physics ? physics.beamMode : 0,
        indLeft: !!(physics && physics.indLeft),
        indRight: !!(physics && physics.indRight),
        progressPct: Number((progressPct || 0).toFixed(1)),
        safeRating: Math.round(this.save.progression.drivingRating || 96)
      };
    }

    async createRoom({ title, mode, routeId, isPrivate, maxPlayers }, physics, busSpec) {
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in with Google to host a multiplayer room.' };
      this.convoyCompletedThisSession = false;
      const telemetry = this.buildPlayerTelemetry(physics, busSpec, 0);
      const res = await this.callBridge('createRoom', {
        title,
        hostName: telemetry.displayName,
        mode,
        routeId,
        isPrivate: !!isPrivate,
        maxPlayers: maxPlayers || 8,
        ...telemetry
      });
      if (res.ok && this.onToast) {
        this.onToast(`🌐 Room Created! Code: ${res.roomCode}`);
      }
      return res;
    }

    async joinRoom(idOrCode, physics, busSpec) {
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in with Google to join multiplayer rooms.' };
      this.convoyCompletedThisSession = false;
      const playerJson = JSON.stringify(this.buildPlayerTelemetry(physics, busSpec, 0));
      const res = await this.callBridge('joinRoom', { idOrCode, playerJson });
      if (res.ok && res.room) {
        this.currentRoom = res.room;
        if (this.onToast) this.onToast(`🌐 Joined ${res.room.title || 'Room'} (${res.room.roomCode})`);
      }
      return res;
    }

    async leaveRoom() {
      this.clearRemoteBuses();
      this.convoyStatus.active = false;
      if (!this.currentRoom) return { ok: true };
      return this.callBridge('leaveRoom', {});
    }

    async setConvoyLeader(leaderUid) {
      if (!this.currentRoom) return { ok: false, error: 'Not inside a room.' };
      return this.callBridge('updateRoom', {
        roomId: this.currentRoom.roomId,
        updatesJson: JSON.stringify({ leaderUid })
      });
    }

    async startConvoyRun() {
      if (!this.currentRoom) return { ok: false, error: 'Not inside a room.' };
      this.convoyCompletedThisSession = false;
      return this.callBridge('updateRoom', {
        roomId: this.currentRoom.roomId,
        updatesJson: JSON.stringify({ status: 'active', convoyProgress: 0 })
      });
    }

    async sendChat(text) {
      if (!this.currentRoom) return { ok: false, error: 'Join a room first to chat.' };
      return this.callBridge('sendChat', {
        roomId: this.currentRoom.roomId,
        senderName: this.save.progression.driverName || this.auth.displayName || 'BD Driver',
        text
      });
    }

    async submitCompetitions() {
      if (!this.auth.signedIn) return;
      const name = this.save.progression.driverName || this.auth.displayName || 'BD Driver';
      const compName = this.save.company.name || 'BD Transport';
      await this.callBridge('submitCompetition', {
        compId: 'weekly_distance',
        displayName: name,
        companyName: compName,
        score: Number((this.save.totalDistanceKm || 0).toFixed(1)),
        metricLabel: 'km'
      });
      await this.callBridge('submitCompetition', {
        compId: 'weekly_safe',
        displayName: name,
        companyName: compName,
        score: Math.round(this.save.progression.drivingRating || 96),
        metricLabel: '% safety'
      });
      await this.callBridge('submitCompetition', {
        compId: 'weekly_revenue',
        displayName: name,
        companyName: compName,
        score: Math.round(this.save.company.revenueTotal || 0),
        metricLabel: '৳ rev'
      });
      await this.callBridge('submitCompetition', {
        compId: 'weekly_convoy',
        displayName: name,
        companyName: compName,
        score: this.save.progression.convoysCompleted || 0,
        metricLabel: 'convoys'
      });
    }

    async fetchCompetition(compId) {
      this.activeCompId = compId || this.activeCompId;
      if (!this.auth.signedIn) return { ok: false, error: 'Sign in with Google to view competition rankings.' };
      const res = await this.callBridge('fetchCompetition', { compId: this.activeCompId });
      if (res.ok) {
        this.competitionEntries = Array.isArray(res.entries) ? res.entries : [];
      }
      return res;
    }

    clearRemoteBuses() {
      this.remoteBuses.forEach((entry) => {
        if (entry.rig && entry.rig.root) {
          this.scene.remove(entry.rig.root);
          if (entry.rig.dispose) entry.rig.dispose();
        }
      });
      this.remoteBuses.clear();
    }

    reconcileRemoteBuses() {
      if (!this.currentRoom) {
        this.clearRemoteBuses();
        return;
      }
      const seen = new Set();
      this.roomPlayers.forEach((p) => {
        if (!p.uid || p.uid === this.auth.uid) return;
        seen.add(p.uid);
        const isLeader = this.currentRoom.leaderUid === p.uid;
        let entry = this.remoteBuses.get(p.uid);
        if (!entry || entry.isLeader !== isLeader || entry.busId !== p.busId) {
          if (entry && entry.rig) {
            this.scene.remove(entry.rig.root);
            if (entry.rig.dispose) entry.rig.dispose();
          }
          const spec = BUS_CATALOG.find((b) => b.id === p.busId) || BUS_CATALOG[0];
          const rig = global.BDBusModel.createRemotePlayerBusMesh(
            spec,
            p.companyColor,
            p.displayName,
            p.companyName,
            isLeader
          );
          rig.root.position.set(p.x || 0, p.y || 0.05, p.z || 0);
          rig.root.rotation.y = p.yaw || 0;
          this.scene.add(rig.root);
          entry = { rig, busId: p.busId, isLeader, target: p };
          this.remoteBuses.set(p.uid, entry);
        } else {
          entry.target = p;
        }
      });

      Array.from(this.remoteBuses.keys()).forEach((uid) => {
        if (!seen.has(uid)) {
          const entry = this.remoteBuses.get(uid);
          if (entry && entry.rig) {
            this.scene.remove(entry.rig.root);
            if (entry.rig.dispose) entry.rig.dispose();
          }
          this.remoteBuses.delete(uid);
        }
      });
    }

    update(dt, blinkOn, physics, busSpec, isDriving, routeProgressPct) {
      if (!this.currentRoom) {
        this.convoyStatus.active = false;
        return;
      }

      // Smoothly interpolate all remote player 3D buses on highway
      this.remoteBuses.forEach((entry) => {
        const t = entry.target;
        const root = entry.rig.root;
        const lerpAlpha = Math.min(1, dt * 8);
        root.position.x += ((t.x || 0) - root.position.x) * lerpAlpha;
        root.position.y += ((t.y || 0.05) - root.position.y) * lerpAlpha;
        root.position.z += ((t.z || 0) - root.position.z) * lerpAlpha;
        let diff = (t.yaw || 0) - root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        root.rotation.y += diff * lerpAlpha;
        entry.rig.updateVisual(t, blinkOn);
      });

      // Convoy Tracking & Shared Progress
      if (this.currentRoom.mode === 'convoy') {
        const leader = this.roomPlayers.find((p) => p.uid === this.currentRoom.leaderUid);
        const avgProgress = this.roomPlayers.length
          ? this.roomPlayers.reduce((sum, p) => sum + (p.progressPct || 0), 0) / this.roomPlayers.length
          : (routeProgressPct || 0);
        let distM = 0;
        let angleDeg = 0;
        if (leader && leader.uid !== this.auth.uid && physics) {
          const dx = (leader.x || 0) - physics.x;
          const dz = (leader.z || 0) - physics.z;
          distM = Math.round(Math.hypot(dx, dz));
          const worldAngle = Math.atan2(dx, -dz);
          angleDeg = ((worldAngle - physics.yaw) * 180) / Math.PI;
        }
        this.convoyStatus = {
          active: true,
          leaderName: leader ? leader.displayName : this.currentRoom.hostName,
          isSelfLeader: this.currentRoom.leaderUid === this.auth.uid,
          distanceToLeaderM: distM,
          followAngleDeg: angleDeg,
          sharedProgressPct: Math.min(100, Math.round(avgProgress))
        };

        if (!this.convoyCompletedThisSession && routeProgressPct >= 98 && this.roomPlayers.length >= 1) {
          this.convoyCompletedThisSession = true;
          const reward = 4500 + this.roomPlayers.length * 750;
          this.save.taka += reward;
          this.save.progression.convoysCompleted = (this.save.progression.convoysCompleted || 0) + 1;
          this.company.awardXP(280);
          this.company.checkAchievements();
          persistSave(this.save);
          if (this.onToast) {
            this.onToast(`🚛 CONVOY COMPLETED! Shared Reward +৳ ${reward.toLocaleString()}`);
          }
          this.syncProfileToCloud(false);
        }
      } else {
        this.convoyStatus.active = false;
      }

      // Throttled live position broadcast to Firestore
      if (isDriving && this.auth.signedIn) {
        this.telemetryAccum += dt;
        if (this.telemetryAccum >= 0.28) {
          this.telemetryAccum = 0;
          const stateJson = JSON.stringify(this.buildPlayerTelemetry(physics, busSpec, routeProgressPct));
          this.callBridge('pushTelemetry', {
            roomId: this.currentRoom.roomId,
            stateJson
          });
        }
      }
    }

    getMinimapMarkers() {
      if (!this.currentRoom) return [];
      const markers = [];
      this.remoteBuses.forEach((entry, uid) => {
        markers.push({
          uid,
          x: entry.rig.root.position.x,
          z: entry.rig.root.position.z,
          isLeader: entry.isLeader
        });
      });
      return markers;
    }
  }

  global.BDMultiplayerManager = BDMultiplayerManager;
})(typeof window !== 'undefined' ? window : globalThis);
