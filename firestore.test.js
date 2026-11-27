const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_uid_001";
const BOB_UID = "bob_uid_002";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function validProfile(uid, ts) {
  return {
    userId: uid,
    displayName: "Tariq Express",
    companyName: "Padma Paribahan",
    companyColor: "#16A34A",
    friendCode: "BD-7841",
    level: 3,
    xp: 2450,
    taka: 65000,
    distanceKm: 142.5,
    safeScore: 96.5,
    missionsCompleted: 8,
    busesOwned: 3,
    companyRevenue: 112000,
    convoyCompleted: 2,
    friends: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

function validRoom(hostUid, ts) {
  return {
    roomCode: "DHK902",
    hostUid,
    hostName: "Tariq Express",
    title: "Dhaka - Cox's Bazar Convoy",
    isPrivate: false,
    mode: "convoy",
    routeId: "dhaka_coxs",
    leaderUid: hostUid,
    convoyProgress: 12.5,
    maxPlayers: 8,
    status: "open",
    createdAt: ts,
    updatedAt: ts,
  };
}

function validRoomPlayer(uid, ts) {
  return {
    uid,
    displayName: "Tariq Express",
    companyName: "Padma Paribahan",
    companyColor: "#16A34A",
    busId: "green_line",
    x: 4.5,
    y: 0.2,
    z: -420.0,
    yaw: 0.05,
    speedKmh: 78.4,
    beamMode: 1,
    indLeft: false,
    indRight: false,
    progressPct: 35.0,
    safeRating: 97.0,
    updatedAt: ts,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated requests are denied across all collections", async () => {
  const unauth = testEnv.unauthenticatedContext().firestore();
  const ts = new Date(Date.now() - 2000);
  await assertFails(unauth.collection("users").get());
  await assertFails(unauth.collection("users").doc(ALICE_UID).set(validProfile(ALICE_UID, ts)));
  await assertFails(unauth.collection("rooms").get());
  await assertFails(unauth.collection("friend_requests").where("targetUid", "==", ALICE_UID).get());
});

test("User profile create, partial update, immutable guards, and cross-user isolation", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).set(validProfile(ALICE_UID, created))
  );

  // Valid partial update
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).update({
      taka: 82000,
      busesOwned: 4,
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Immutable createdAt cannot change
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      createdAt: new Date(Date.now() - 500),
      updatedAt: new Date(Date.now() - 500),
    })
  );

  // Future timestamp rejected
  await assertFails(
    bobDb.collection("users").doc(BOB_UID).set(validProfile(BOB_UID, new Date(Date.now() + 60000)))
  );

  // Cross-user write rejected, read allowed for leaderboard
  await assertSucceeds(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(bobDb.collection("users").doc(ALICE_UID).update({ taka: 999999, updatedAt: new Date(Date.now() - 1000) }));
});

test("Cloud save is strictly private to owner", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const ts = new Date(Date.now() - 5000);

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("cloud_saves").doc("state").set({
      ownerUid: ALICE_UID,
      payloadJson: JSON.stringify({ companyName: "Padma Paribahan", taka: 50000 }),
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    })
  );

  // Non-state save ID rejected
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).collection("cloud_saves").doc("other").set({
      ownerUid: ALICE_UID,
      payloadJson: "{}",
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    })
  );

  // Bob cannot read or write Alice's cloud save
  await assertFails(bobDb.collection("users").doc(ALICE_UID).collection("cloud_saves").doc("state").get());
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("cloud_saves").doc("state").update({
      payloadJson: "{}",
      updatedAt: new Date(Date.now() - 1000),
    })
  );
});

test("Friend requests enforce sender/target queries and target-only accept", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const ts = new Date(Date.now() - 5000);

  await assertSucceeds(aliceDb.collection("friend_requests").doc("req_1").get());

  await assertSucceeds(
    aliceDb.collection("friend_requests").doc("req_1").set({
      senderUid: ALICE_UID,
      senderName: "Tariq",
      targetUid: BOB_UID,
      targetName: "Karim",
      status: "pending",
      createdAt: ts,
      updatedAt: ts,
    })
  );

  // Self-invite fails
  await assertFails(
    aliceDb.collection("friend_requests").doc("req_self").set({
      senderUid: ALICE_UID,
      senderName: "Tariq",
      targetUid: ALICE_UID,
      targetName: "Tariq",
      status: "pending",
      createdAt: ts,
      updatedAt: ts,
    })
  );

  // Unfiltered query rejected; filtered query succeeds
  await assertFails(bobDb.collection("friend_requests").get());
  await assertSucceeds(bobDb.collection("friend_requests").where("targetUid", "==", BOB_UID).get());

  // Sender cannot accept own request; target can accept
  await assertFails(
    aliceDb.collection("friend_requests").doc("req_1").update({
      status: "accepted",
      updatedAt: new Date(Date.now() - 1000),
    })
  );
  await assertSucceeds(
    bobDb.collection("friend_requests").doc("req_1").update({
      status: "accepted",
      updatedAt: new Date(Date.now() - 1000),
    })
  );
});

test("Multiplayer rooms, realtime player state, chat, and competition entries", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const ts = new Date(Date.now() - 5000);

  await assertSucceeds(aliceDb.collection("rooms").doc("room_dhk1").set(validRoom(ALICE_UID, ts)));

  // Host can start convoy, non-host cannot alter room
  await assertSucceeds(
    aliceDb.collection("rooms").doc("room_dhk1").update({
      status: "active",
      convoyProgress: 25.0,
      updatedAt: new Date(Date.now() - 1000),
    })
  );
  await assertFails(
    bobDb.collection("rooms").doc("room_dhk1").update({
      status: "finished",
      updatedAt: new Date(Date.now() - 1000),
    })
  );

  // Each player writes only their own position doc
  await assertSucceeds(
    bobDb.collection("rooms").doc("room_dhk1").collection("players").doc(BOB_UID).set(validRoomPlayer(BOB_UID, ts))
  );
  await assertFails(
    bobDb.collection("rooms").doc("room_dhk1").collection("players").doc(ALICE_UID).set(validRoomPlayer(ALICE_UID, ts))
  );

  // Chat create allowed for sender, immutable (no update)
  await assertSucceeds(
    bobDb.collection("rooms").doc("room_dhk1").collection("chat").doc("msg_1").set({
      senderUid: BOB_UID,
      senderName: "Karim",
      text: "Convoy rolling out of Dhaka!",
      createdAt: ts,
    })
  );
  await assertFails(
    bobDb.collection("rooms").doc("room_dhk1").collection("chat").doc("msg_1").update({
      text: "Edited",
    })
  );

  // Competition entries isolated by entryUid
  await assertSucceeds(
    aliceDb.collection("competitions").doc("weekly_distance").collection("entries").doc(ALICE_UID).set({
      userId: ALICE_UID,
      compId: "weekly_distance",
      displayName: "Tariq Express",
      companyName: "Padma Paribahan",
      score: 185.4,
      metricLabel: "km",
      createdAt: ts,
      updatedAt: ts,
    })
  );
  await assertFails(
    bobDb.collection("competitions").doc("weekly_distance").collection("entries").doc(ALICE_UID).update({
      score: 9999,
      updatedAt: new Date(Date.now() - 1000),
    })
  );
});
