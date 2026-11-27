package com.example.firebase

import android.content.Context
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.example.R
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class BusFirebaseRepository(
  private val context: Context,
  private val onEvent: (eventName: String, payload: JSONObject) -> Unit
) {
  companion object {
    private const val TAG = "BusFirebaseRepo"
  }

  private val auth: FirebaseAuth = FirebaseAuth.getInstance()
  private val db: FirebaseFirestore =
    FirebaseFirestore.getInstance(context.getString(R.string.firestore_database_id)).apply {
      try {
        firestoreSettings = firestoreSettings {
          setLocalCacheSettings(persistentCacheSettings {})
        }
      } catch (_: Exception) {
        // Ignore if settings were already configured in this process
      }
    }

  private var authListener: FirebaseAuth.AuthStateListener? = null
  private var roomDocListener: ListenerRegistration? = null
  private var roomPlayersListener: ListenerRegistration? = null
  private var roomChatListener: ListenerRegistration? = null
  private var incomingReqListener: ListenerRegistration? = null
  private var outgoingReqListener: ListenerRegistration? = null
  private var activeRoomId: String? = null

  fun startAuthListening() {
    if (authListener != null) return
    val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
      val user = firebaseAuth.currentUser
      emitAuthState(user)
      if (user != null) {
        attachFriendRequestListeners(user.uid)
      } else {
        detachAllFirestoreListeners()
      }
    }
    authListener = listener
    auth.addAuthStateListener(listener)
    emitAuthState(auth.currentUser)
  }

  fun stopListening() {
    detachAllFirestoreListeners()
    authListener?.let { auth.removeAuthStateListener(it) }
    authListener = null
  }

  private fun detachRoomListeners() {
    roomDocListener?.remove()
    roomDocListener = null
    roomPlayersListener?.remove()
    roomPlayersListener = null
    roomChatListener?.remove()
    roomChatListener = null
    activeRoomId = null
  }

  private fun detachAllFirestoreListeners() {
    detachRoomListeners()
    incomingReqListener?.remove()
    incomingReqListener = null
    outgoingReqListener?.remove()
    outgoingReqListener = null
  }

  private fun emitAuthState(user: FirebaseUser?) {
    val obj = JSONObject().apply {
      put("signedIn", user != null)
      put("uid", user?.uid ?: "")
      put("displayName", user?.displayName ?: "")
      put("email", user?.email ?: "")
    }
    onEvent("authState", obj)
  }

  fun getAuthSnapshot(): JSONObject {
    val user = auth.currentUser
    return JSONObject().apply {
      put("signedIn", user != null)
      put("uid", user?.uid ?: "")
      put("displayName", user?.displayName ?: "")
      put("email", user?.email ?: "")
    }
  }

  suspend fun tryAutoSignIn(activity: ComponentActivity) {
    if (auth.currentUser != null) {
      emitAuthState(auth.currentUser)
      return
    }
    try {
      val webClientId = context.getString(R.string.default_web_client_id)
      val credentialManager = CredentialManager.create(activity)
      val googleIdOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(true)
        .setServerClientId(webClientId)
        .setAutoSelectEnabled(true)
        .build()
      val request = GetCredentialRequest.Builder()
        .addCredentialOption(googleIdOption)
        .build()
      val result = credentialManager.getCredential(activity, request)
      val cred = result.credential
      if (cred is CustomCredential &&
        cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        val googleCred = GoogleIdTokenCredential.createFrom(cred.data)
        val firebaseCred = GoogleAuthProvider.getCredential(googleCred.idToken, null)
        auth.signInWithCredential(firebaseCred).await()
      }
    } catch (_: NoCredentialException) {
      // No pre-authorized account yet; player can tap Sign in with Google
    } catch (_: GetCredentialCancellationException) {
      // Silent ignore on startup
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      Log.d(TAG, "Silent auto sign-in skipped: ${e.message}")
    }
  }

  suspend fun signInWithGoogle(activity: ComponentActivity): JSONObject {
    return try {
      val webClientId = context.getString(R.string.default_web_client_id)
      val credentialManager = CredentialManager.create(activity)
      val signInOption = GetSignInWithGoogleOption.Builder(webClientId).build()
      val request = GetCredentialRequest.Builder()
        .addCredentialOption(signInOption)
        .build()
      val result = credentialManager.getCredential(activity, request)
      val cred = result.credential
      if (cred is CustomCredential &&
        cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        val googleCred = GoogleIdTokenCredential.createFrom(cred.data)
        val firebaseCred = GoogleAuthProvider.getCredential(googleCred.idToken, null)
        val authResult = auth.signInWithCredential(firebaseCred).await()
        val user = authResult.user
        emitAuthState(user)
        JSONObject().apply {
          put("ok", true)
          put("uid", user?.uid ?: "")
          put("displayName", user?.displayName ?: "")
        }
      } else {
        JSONObject().apply {
          put("ok", false)
          put("error", "Unsupported credential type returned by Google Sign-In.")
        }
      }
    } catch (_: GetCredentialCancellationException) {
      JSONObject().apply {
        put("ok", false)
        put("cancelled", true)
        put("error", "Sign-in cancelled.")
      }
    } catch (e: GetCredentialException) {
      JSONObject().apply {
        put("ok", false)
        put("error", e.message ?: "Google Sign-In unavailable on this device.")
      }
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      JSONObject().apply {
        put("ok", false)
        put("error", e.message ?: "Sign-in failed.")
      }
    }
  }

  suspend fun signOut(): JSONObject {
    return try {
      withContext(NonCancellable) {
        val room = activeRoomId
        val uid = auth.currentUser?.uid
        if (!room.isNullOrBlank() && !uid.isNullOrBlank()) {
          try {
            db.collection("rooms").document(room).collection("players").document(uid).delete().await()
          } catch (_: Exception) {
          }
        }
        detachAllFirestoreListeners()
        auth.signOut()
      }
      emitAuthState(null)
      JSONObject().put("ok", true)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      JSONObject().put("ok", false).put("error", e.message ?: "Sign-out failed")
    }
  }

  private fun requireUid(): String =
    auth.currentUser?.uid ?: throw IllegalStateException("Please sign in with Google first.")

  private fun defaultFriendCode(uid: String): String {
    val clean = uid.replace(Regex("[^A-Za-z0-9]"), "").uppercase()
    val suffix = (if (clean.length >= 6) clean.take(6) else clean.padEnd(6, 'X'))
    return "BD-$suffix"
  }

  suspend fun syncProfileAndCloudSave(profileJsonStr: String, saveJsonStr: String): JSONObject {
    return try {
      val uid = requireUid()
      val user = auth.currentUser ?: return JSONObject().put("ok", false).put("error", "Please sign in with Google first.")
      val p = JSONObject(profileJsonStr)
      val displayName = p.optString("displayName", user.displayName ?: "BD Driver")
        .trim().ifEmpty { "BD Driver" }.take(60)
      val companyName = p.optString("companyName", "Padma Express").trim().take(60)
      val companyColor = p.optString("companyColor", "#16A34A").trim().take(16)
      val rawFriendCode = p.optString("friendCode", defaultFriendCode(uid)).trim()
      val friendCode = if (rawFriendCode.length < 4) defaultFriendCode(uid) else rawFriendCode.take(16)
      val level = p.optInt("level", 1).coerceIn(1, 500)
      val xp = p.optDouble("xp", 0.0).coerceIn(0.0, 1_000_000_000.0)
      val taka = p.optDouble("taka", 25000.0).coerceIn(0.0, 10_000_000_000.0)
      val distanceKm = p.optDouble("distanceKm", 0.0).coerceIn(0.0, 10_000_000.0)
      val safeScore = p.optDouble("safeScore", 100.0).coerceIn(0.0, 100.0)
      val missionsCompleted = p.optInt("missionsCompleted", 0).coerceIn(0, 100_000)
      val busesOwned = p.optInt("busesOwned", 1).coerceIn(1, 100)
      val companyRevenue = p.optDouble("companyRevenue", 0.0).coerceIn(0.0, 10_000_000_000.0)
      val convoyCompleted = p.optInt("convoyCompleted", 0).coerceIn(0, 100_000)

      val friendsArr = p.optJSONArray("friends")
      val friendsList = mutableListOf<String>()
      if (friendsArr != null) {
        for (i in 0 until minOf(friendsArr.length(), 50)) {
          val f = friendsArr.optString(i, "")
          if (f.isNotBlank()) friendsList.add(f.take(128))
        }
      }

      val profileRef = db.collection("users").document(uid)
      val existingProfile = profileRef.get().await()
      if (existingProfile.exists()) {
        val updates = mapOf(
          "displayName" to displayName,
          "companyName" to companyName,
          "companyColor" to companyColor,
          "friendCode" to friendCode,
          "level" to level,
          "xp" to xp,
          "taka" to taka,
          "distanceKm" to distanceKm,
          "safeScore" to safeScore,
          "missionsCompleted" to missionsCompleted,
          "busesOwned" to busesOwned,
          "companyRevenue" to companyRevenue,
          "convoyCompleted" to convoyCompleted,
          "friends" to friendsList,
          "updatedAt" to FieldValue.serverTimestamp()
        )
        profileRef.update(updates).await()
      } else {
        val fullProfile = mapOf(
          "userId" to uid,
          "displayName" to displayName,
          "companyName" to companyName,
          "companyColor" to companyColor,
          "friendCode" to friendCode,
          "level" to level,
          "xp" to xp,
          "taka" to taka,
          "distanceKm" to distanceKm,
          "safeScore" to safeScore,
          "missionsCompleted" to missionsCompleted,
          "busesOwned" to busesOwned,
          "companyRevenue" to companyRevenue,
          "convoyCompleted" to convoyCompleted,
          "friends" to friendsList,
          "createdAt" to FieldValue.serverTimestamp(),
          "updatedAt" to FieldValue.serverTimestamp()
        )
        profileRef.set(fullProfile).await()
      }

      if (saveJsonStr.length in 2..700000) {
        val saveRef = db.collection("users").document(uid).collection("cloud_saves").document("state")
        val existingSave = saveRef.get().await()
        if (existingSave.exists()) {
          saveRef.update(
            mapOf(
              "payloadJson" to saveJsonStr,
              "version" to 5,
              "updatedAt" to FieldValue.serverTimestamp()
            )
          ).await()
        } else {
          saveRef.set(
            mapOf(
              "ownerUid" to uid,
              "payloadJson" to saveJsonStr,
              "version" to 5,
              "createdAt" to FieldValue.serverTimestamp(),
              "updatedAt" to FieldValue.serverTimestamp()
            )
          ).await()
        }
      }

      JSONObject().apply {
        put("ok", true)
        put("friendCode", friendCode)
        put("syncedAt", System.currentTimeMillis())
      }
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.WRITE, "users/cloud_saves")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun loadCloudSave(): JSONObject {
    return try {
      val uid = requireUid()
      val snap = db.collection("users").document(uid).collection("cloud_saves").document("state").get().await()
      if (!snap.exists()) {
        return JSONObject().put("ok", true).put("exists", false)
      }
      val payload = snap.getString("payloadJson") ?: ""
      val updatedTs = snap.getTimestamp("updatedAt")?.toDate()?.time ?: 0L
      JSONObject().apply {
        put("ok", true)
        put("exists", payload.isNotEmpty())
        put("payloadJson", payload)
        put("updatedAt", updatedTs)
      }
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.GET, "users/cloud_saves/state")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun fetchLeaderboard(category: String): JSONObject {
    return try {
      requireUid()
      val field = when (category) {
        "companyRevenue" -> "companyRevenue"
        "busesOwned" -> "busesOwned"
        "distanceKm" -> "distanceKm"
        "safeScore" -> "safeScore"
        "missionsCompleted" -> "missionsCompleted"
        "level" -> "level"
        "convoyCompleted" -> "convoyCompleted"
        else -> "taka"
      }
      val snap = db.collection("users")
        .orderBy(field, Query.Direction.DESCENDING)
        .limit(25)
        .get()
        .await()
      val list = JSONArray()
      for (doc in snap.documents) {
        val data = doc.data ?: continue
        list.put(docDataToUserJson(doc.id, data))
      }
      JSONObject().put("ok", true).put("category", category).put("rows", list)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.LIST, "users")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private fun docDataToUserJson(uid: String, data: Map<String, Any>): JSONObject {
    return JSONObject().apply {
      put("userId", uid)
      put("displayName", data["displayName"] as? String ?: "Driver")
      put("companyName", data["companyName"] as? String ?: "")
      put("companyColor", data["companyColor"] as? String ?: "#16A34A")
      put("friendCode", data["friendCode"] as? String ?: "")
      put("level", (data["level"] as? Number)?.toInt() ?: 1)
      put("xp", (data["xp"] as? Number)?.toDouble() ?: 0.0)
      put("taka", (data["taka"] as? Number)?.toDouble() ?: 0.0)
      put("distanceKm", (data["distanceKm"] as? Number)?.toDouble() ?: 0.0)
      put("safeScore", (data["safeScore"] as? Number)?.toDouble() ?: 100.0)
      put("missionsCompleted", (data["missionsCompleted"] as? Number)?.toInt() ?: 0)
      put("busesOwned", (data["busesOwned"] as? Number)?.toInt() ?: 1)
      put("companyRevenue", (data["companyRevenue"] as? Number)?.toDouble() ?: 0.0)
      put("convoyCompleted", (data["convoyCompleted"] as? Number)?.toInt() ?: 0)
    }
  }

  suspend fun sendFriendRequestByCode(friendCodeInput: String, myName: String): JSONObject {
    return try {
      val uid = requireUid()
      val code = friendCodeInput.trim().uppercase()
      if (code.length !in 4..16) {
        return JSONObject().put("ok", false).put("error", "Enter a valid Friend Code (e.g. BD-XXXXXX).")
      }
      val usersSnap = db.collection("users").whereEqualTo("friendCode", code).limit(1).get().await()
      val targetDoc = usersSnap.documents.firstOrNull()
        ?: return JSONObject().put("ok", false).put("error", "No player found with Friend Code $code.")
      val targetUid = targetDoc.id
      if (targetUid == uid) {
        return JSONObject().put("ok", false).put("error", "You cannot add yourself as a friend.")
      }
      val targetName = targetDoc.getString("displayName") ?: "Player"
      val senderName = myName.trim().ifEmpty { auth.currentUser?.displayName ?: "BD Driver" }.take(60)
      val reqId = "${uid}_${targetUid}".take(120)
      val reqRef = db.collection("friend_requests").document(reqId)
      val existing = reqRef.get().await()
      if (existing.exists()) {
        return JSONObject().put("ok", false).put("error", "Friend request already sent to $targetName.")
      }
      reqRef.set(
        mapOf(
          "senderUid" to uid,
          "senderName" to senderName,
          "targetUid" to targetUid,
          "targetName" to targetName.take(60),
          "status" to "pending",
          "createdAt" to FieldValue.serverTimestamp(),
          "updatedAt" to FieldValue.serverTimestamp()
        )
      ).await()
      JSONObject().put("ok", true).put("targetName", targetName)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.CREATE, "friend_requests")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun respondFriendRequest(reqId: String, accept: Boolean): JSONObject {
    return try {
      requireUid()
      val status = if (accept) "accepted" else "declined"
      db.collection("friend_requests").document(reqId).update(
        mapOf(
          "status" to status,
          "updatedAt" to FieldValue.serverTimestamp()
        )
      ).await()
      JSONObject().put("ok", true).put("status", status)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.UPDATE, "friend_requests/$reqId")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private fun attachFriendRequestListeners(uid: String) {
    incomingReqListener?.remove()
    outgoingReqListener?.remove()

    val emitCombined = {
      // Triggered on each listener update
    }

    var latestIncoming = JSONArray()
    var latestOutgoing = JSONArray()

    val pushFriendUpdate = {
      onEvent(
        "friendRequests",
        JSONObject().apply {
          put("incoming", latestIncoming)
          put("outgoing", latestOutgoing)
        }
      )
    }

    incomingReqListener = db.collection("friend_requests")
      .whereEqualTo("targetUid", uid)
      .addSnapshotListener { snap, err ->
        if (err != null) {
          FirestoreHelper.handleFirestoreError(err, OperationType.LIST, "friend_requests")
          return@addSnapshotListener
        }
        val arr = JSONArray()
        snap?.documents?.forEach { doc ->
          val d = doc.data ?: return@forEach
          arr.put(
            JSONObject().apply {
              put("id", doc.id)
              put("senderUid", d["senderUid"] as? String ?: "")
              put("senderName", d["senderName"] as? String ?: "")
              put("targetUid", d["targetUid"] as? String ?: "")
              put("targetName", d["targetName"] as? String ?: "")
              put("status", d["status"] as? String ?: "pending")
            }
          )
        }
        latestIncoming = arr
        pushFriendUpdate()
      }

    outgoingReqListener = db.collection("friend_requests")
      .whereEqualTo("senderUid", uid)
      .addSnapshotListener { snap, err ->
        if (err != null) {
          FirestoreHelper.handleFirestoreError(err, OperationType.LIST, "friend_requests")
          return@addSnapshotListener
        }
        val arr = JSONArray()
        snap?.documents?.forEach { doc ->
          val d = doc.data ?: return@forEach
          arr.put(
            JSONObject().apply {
              put("id", doc.id)
              put("senderUid", d["senderUid"] as? String ?: "")
              put("senderName", d["senderName"] as? String ?: "")
              put("targetUid", d["targetUid"] as? String ?: "")
              put("targetName", d["targetName"] as? String ?: "")
              put("status", d["status"] as? String ?: "pending")
            }
          )
        }
        latestOutgoing = arr
        pushFriendUpdate()
      }
    emitCombined()
  }

  suspend fun listRooms(): JSONObject {
    return try {
      requireUid()
      val snap = db.collection("rooms")
        .orderBy("updatedAt", Query.Direction.DESCENDING)
        .limit(20)
        .get()
        .await()
      val arr = JSONArray()
      for (doc in snap.documents) {
        val d = doc.data ?: continue
        val status = d["status"] as? String ?: "open"
        if (status == "finished") continue
        arr.put(roomDocToJson(doc.id, d))
      }
      JSONObject().put("ok", true).put("rooms", arr)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.LIST, "rooms")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private fun roomDocToJson(roomId: String, d: Map<String, Any>): JSONObject {
    return JSONObject().apply {
      put("roomId", roomId)
      put("roomCode", d["roomCode"] as? String ?: "")
      put("hostUid", d["hostUid"] as? String ?: "")
      put("hostName", d["hostName"] as? String ?: "")
      put("title", d["title"] as? String ?: "")
      put("isPrivate", d["isPrivate"] as? Boolean ?: false)
      put("mode", d["mode"] as? String ?: "free")
      put("routeId", d["routeId"] as? String ?: "dhaka_mymensingh")
      put("leaderUid", d["leaderUid"] as? String ?: "")
      put("convoyProgress", (d["convoyProgress"] as? Number)?.toDouble() ?: 0.0)
      put("maxPlayers", (d["maxPlayers"] as? Number)?.toInt() ?: 8)
      put("status", d["status"] as? String ?: "open")
    }
  }

  suspend fun createRoom(payloadJson: String): JSONObject {
    return try {
      val uid = requireUid()
      val p = JSONObject(payloadJson)
      val hostName = p.optString("hostName", auth.currentUser?.displayName ?: "BD Host")
        .trim().ifEmpty { "BD Host" }.take(60)
      val title = p.optString("title", "$hostName Highway Room").trim().ifEmpty { "BD Highway Room" }.take(60)
      val isPrivate = p.optBoolean("isPrivate", false)
      val mode = p.optString("mode", "free").let { if (it in listOf("free", "convoy", "competition")) it else "free" }
      val routeId = p.optString("routeId", "dhaka_mymensingh").trim().ifEmpty { "dhaka_mymensingh" }.take(48)
      val maxPlayers = p.optInt("maxPlayers", 8).coerceIn(2, 16)
      val roomCode = (100000..999999).random().toString()
      val roomId = "room_${UUID.randomUUID().toString().replace("-", "").take(12)}"

      val roomData = mapOf(
        "roomCode" to roomCode,
        "hostUid" to uid,
        "hostName" to hostName,
        "title" to title,
        "isPrivate" to isPrivate,
        "mode" to mode,
        "routeId" to routeId,
        "leaderUid" to uid,
        "convoyProgress" to 0.0,
        "maxPlayers" to maxPlayers,
        "status" to "open",
        "createdAt" to FieldValue.serverTimestamp(),
        "updatedAt" to FieldValue.serverTimestamp()
      )
      db.collection("rooms").document(roomId).set(roomData).await()
      val joinRes = joinRoomInternal(roomId, p)
      if (!joinRes.optBoolean("ok", false)) return joinRes
      JSONObject().apply {
        put("ok", true)
        put("roomId", roomId)
        put("roomCode", roomCode)
      }
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.CREATE, "rooms")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun joinRoomByIdOrCode(idOrCode: String, playerJson: String): JSONObject {
    return try {
      requireUid()
      val raw = idOrCode.trim()
      if (raw.isEmpty()) return JSONObject().put("ok", false).put("error", "Enter room code or choose a room.")
      val docById = db.collection("rooms").document(raw).get().await()
      val targetDoc = if (docById.exists()) {
        docById
      } else {
        db.collection("rooms").whereEqualTo("roomCode", raw).limit(1).get().await().documents.firstOrNull()
      }
      if (targetDoc == null || !targetDoc.exists()) {
        return JSONObject().put("ok", false).put("error", "Room not found.")
      }
      val p = JSONObject(playerJson)
      joinRoomInternal(targetDoc.id, p)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.GET, "rooms")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private suspend fun joinRoomInternal(roomId: String, p: JSONObject): JSONObject {
    val uid = requireUid()
    detachRoomListeners()
    val playerDoc = buildPlayerStateMap(uid, p)
    db.collection("rooms").document(roomId).collection("players").document(uid).set(playerDoc).await()
    activeRoomId = roomId
    attachRoomListeners(roomId)
    val roomSnap = db.collection("rooms").document(roomId).get().await()
    val roomJson = roomSnap.data?.let { roomDocToJson(roomId, it) } ?: JSONObject().put("roomId", roomId)
    return JSONObject().put("ok", true).put("room", roomJson)
  }

  suspend fun leaveCurrentRoom(): JSONObject {
    return try {
      val uid = auth.currentUser?.uid
      val room = activeRoomId
      withContext(NonCancellable) {
        detachRoomListeners()
        if (!room.isNullOrBlank() && !uid.isNullOrBlank()) {
          db.collection("rooms").document(room).collection("players").document(uid).delete().await()
        }
      }
      onEvent("roomLeft", JSONObject().put("roomId", room ?: ""))
      JSONObject().put("ok", true)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      JSONObject().put("ok", false).put("error", e.message ?: "Could not leave room")
    }
  }

  suspend fun updateRoomHostConfig(roomId: String, updatesJson: String): JSONObject {
    return try {
      requireUid()
      val u = JSONObject(updatesJson)
      val map = mutableMapOf<String, Any>("updatedAt" to FieldValue.serverTimestamp())
      if (u.has("title")) {
        val t = u.getString("title").trim().take(60)
        if (t.length >= 2) map["title"] = t
      }
      if (u.has("mode")) {
        val m = u.getString("mode").trim()
        if (m in listOf("free", "convoy", "competition")) map["mode"] = m
      }
      if (u.has("routeId")) {
        val r = u.getString("routeId").trim().take(48)
        if (r.isNotEmpty()) map["routeId"] = r
      }
      if (u.has("leaderUid")) {
        val l = u.getString("leaderUid").trim().take(128)
        if (l.isNotEmpty()) map["leaderUid"] = l
      }
      if (u.has("convoyProgress")) map["convoyProgress"] = u.getDouble("convoyProgress").coerceIn(0.0, 100.0)
      if (u.has("status")) {
        val s = u.getString("status").trim()
        if (s in listOf("open", "active", "finished")) map["status"] = s
      }
      db.collection("rooms").document(roomId).update(map).await()
      JSONObject().put("ok", true)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.UPDATE, "rooms/$roomId")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun pushPlayerTelemetry(roomId: String, stateJson: String): JSONObject {
    return try {
      val uid = requireUid()
      val p = JSONObject(stateJson)
      val map = buildPlayerStateMap(uid, p)
      db.collection("rooms").document(roomId).collection("players").document(uid).set(map).await()
      JSONObject().put("ok", true)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.WRITE, "rooms/$roomId/players")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private fun buildPlayerStateMap(uid: String, p: JSONObject): Map<String, Any> {
    return mapOf(
      "uid" to uid,
      "displayName" to p.optString("displayName", auth.currentUser?.displayName ?: "Driver").trim().ifEmpty { "Driver" }.take(60),
      "companyName" to p.optString("companyName", "BD Bus Co").trim().take(60),
      "companyColor" to p.optString("companyColor", "#16A34A").trim().ifEmpty { "#16A34A" }.take(16),
      "busId" to p.optString("busId", "green_line").trim().ifEmpty { "green_line" }.take(48),
      "x" to p.optDouble("x", 0.0).coerceIn(-20000.0, 20000.0),
      "y" to p.optDouble("y", 0.0).coerceIn(-500.0, 2000.0),
      "z" to p.optDouble("z", 0.0).coerceIn(-100000.0, 100000.0),
      "yaw" to p.optDouble("yaw", 0.0).coerceIn(-10.0, 10.0),
      "speedKmh" to p.optDouble("speedKmh", 0.0).coerceIn(-60.0, 220.0),
      "beamMode" to p.optInt("beamMode", 0).coerceIn(0, 2),
      "indLeft" to p.optBoolean("indLeft", false),
      "indRight" to p.optBoolean("indRight", false),
      "progressPct" to p.optDouble("progressPct", 0.0).coerceIn(0.0, 100.0),
      "safeRating" to p.optDouble("safeRating", 100.0).coerceIn(0.0, 100.0),
      "updatedAt" to FieldValue.serverTimestamp()
    )
  }

  suspend fun sendChatMessage(roomId: String, senderName: String, text: String): JSONObject {
    return try {
      val uid = requireUid()
      val cleanText = text.trim().take(200)
      if (cleanText.isEmpty()) return JSONObject().put("ok", false).put("error", "Message cannot be empty.")
      val cleanName = senderName.trim().ifEmpty { auth.currentUser?.displayName ?: "Driver" }.take(60)
      val msgId = "msg_${System.currentTimeMillis()}_${(100..999).random()}"
      db.collection("rooms").document(roomId).collection("chat").document(msgId).set(
        mapOf(
          "senderUid" to uid,
          "senderName" to cleanName,
          "text" to cleanText,
          "createdAt" to FieldValue.serverTimestamp()
        )
      ).await()
      JSONObject().put("ok", true)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.CREATE, "rooms/$roomId/chat")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  private fun attachRoomListeners(roomId: String) {
    roomDocListener = db.collection("rooms").document(roomId)
      .addSnapshotListener { snap, err ->
        if (err != null) {
          FirestoreHelper.handleFirestoreError(err, OperationType.GET, "rooms/$roomId")
          return@addSnapshotListener
        }
        val d = snap?.data
        if (d != null) {
          onEvent("roomUpdated", roomDocToJson(roomId, d))
        }
      }

    roomPlayersListener = db.collection("rooms").document(roomId).collection("players")
      .addSnapshotListener { snap, err ->
        if (err != null) {
          FirestoreHelper.handleFirestoreError(err, OperationType.LIST, "rooms/$roomId/players")
          return@addSnapshotListener
        }
        val arr = JSONArray()
        snap?.documents?.forEach { doc ->
          val d = doc.data ?: return@forEach
          arr.put(
            JSONObject().apply {
              put("uid", doc.id)
              put("displayName", d["displayName"] as? String ?: "Driver")
              put("companyName", d["companyName"] as? String ?: "")
              put("companyColor", d["companyColor"] as? String ?: "#16A34A")
              put("busId", d["busId"] as? String ?: "green_line")
              put("x", (d["x"] as? Number)?.toDouble() ?: 0.0)
              put("y", (d["y"] as? Number)?.toDouble() ?: 0.0)
              put("z", (d["z"] as? Number)?.toDouble() ?: 0.0)
              put("yaw", (d["yaw"] as? Number)?.toDouble() ?: 0.0)
              put("speedKmh", (d["speedKmh"] as? Number)?.toDouble() ?: 0.0)
              put("beamMode", (d["beamMode"] as? Number)?.toInt() ?: 0)
              put("indLeft", d["indLeft"] as? Boolean ?: false)
              put("indRight", d["indRight"] as? Boolean ?: false)
              put("progressPct", (d["progressPct"] as? Number)?.toDouble() ?: 0.0)
              put("safeRating", (d["safeRating"] as? Number)?.toDouble() ?: 100.0)
            }
          )
        }
        onEvent("roomPlayers", JSONObject().put("roomId", roomId).put("players", arr))
      }

    roomChatListener = db.collection("rooms").document(roomId).collection("chat")
      .orderBy("createdAt", Query.Direction.ASCENDING)
      .limitToLast(40)
      .addSnapshotListener { snap, err ->
        if (err != null) {
          FirestoreHelper.handleFirestoreError(err, OperationType.LIST, "rooms/$roomId/chat")
          return@addSnapshotListener
        }
        val arr = JSONArray()
        snap?.documents?.forEach { doc ->
          val d = doc.data ?: return@forEach
          val ts = (doc.getTimestamp("createdAt", DocumentSnapshot.ServerTimestampBehavior.ESTIMATE) as? Timestamp)?.toDate()?.time ?: 0L
          arr.put(
            JSONObject().apply {
              put("id", doc.id)
              put("senderUid", d["senderUid"] as? String ?: "")
              put("senderName", d["senderName"] as? String ?: "Driver")
              put("text", d["text"] as? String ?: "")
              put("createdAt", ts)
            }
          )
        }
        onEvent("roomChat", JSONObject().put("roomId", roomId).put("messages", arr))
      }
  }

  suspend fun submitCompetitionScore(compId: String, displayName: String, companyName: String, score: Double, metricLabel: String): JSONObject {
    return try {
      val uid = requireUid()
      val cleanComp = compId.trim().take(48)
      if (cleanComp.isEmpty()) {
        return JSONObject().put("ok", false).put("error", "Invalid competition ID.")
      }
      val ref = db.collection("competitions").document(cleanComp).collection("entries").document(uid)
      val existing = ref.get().await()
      val cleanScore = score.coerceIn(0.0, 10_000_000.0)
      val prevScore = (existing.get("score") as? Number)?.toDouble() ?: 0.0
      val bestScore = maxOf(cleanScore, prevScore)
      if (existing.exists()) {
        ref.update(
          mapOf(
            "displayName" to displayName.trim().ifEmpty { "Driver" }.take(60),
            "companyName" to companyName.trim().take(60),
            "score" to bestScore,
            "metricLabel" to metricLabel.trim().ifEmpty { "pts" }.take(40),
            "updatedAt" to FieldValue.serverTimestamp()
          )
        ).await()
      } else {
        ref.set(
          mapOf(
            "userId" to uid,
            "compId" to cleanComp,
            "displayName" to displayName.trim().ifEmpty { "Driver" }.take(60),
            "companyName" to companyName.trim().take(60),
            "score" to bestScore,
            "metricLabel" to metricLabel.trim().ifEmpty { "pts" }.take(40),
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp()
          )
        ).await()
      }
      JSONObject().put("ok", true).put("bestScore", bestScore)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.WRITE, "competitions/$compId/entries")
      JSONObject().put("ok", false).put("error", msg)
    }
  }

  suspend fun fetchCompetitionEntries(compId: String): JSONObject {
    return try {
      requireUid()
      val cleanComp = compId.trim().take(48)
      val snap = db.collection("competitions").document(cleanComp).collection("entries")
        .orderBy("score", Query.Direction.DESCENDING)
        .limit(25)
        .get()
        .await()
      val arr = JSONArray()
      for (doc in snap.documents) {
        val d = doc.data ?: continue
        arr.put(
          JSONObject().apply {
            put("userId", doc.id)
            put("displayName", d["displayName"] as? String ?: "Driver")
            put("companyName", d["companyName"] as? String ?: "")
            put("score", (d["score"] as? Number)?.toDouble() ?: 0.0)
            put("metricLabel", d["metricLabel"] as? String ?: "pts")
          }
        )
      }
      JSONObject().put("ok", true).put("compId", cleanComp).put("entries", arr)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      val msg = FirestoreHelper.handleFirestoreError(e, OperationType.LIST, "competitions/$compId/entries")
      JSONObject().put("ok", false).put("error", msg)
    }
  }
}
