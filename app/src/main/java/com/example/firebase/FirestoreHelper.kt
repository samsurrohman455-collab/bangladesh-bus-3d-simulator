package com.example.firebase

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestoreException
import org.json.JSONObject

enum class OperationType {
  CREATE,
  UPDATE,
  DELETE,
  LIST,
  GET,
  WRITE
}

object FirestoreHelper {
  private const val TAG = "BusFirestore"

  fun handleFirestoreError(
    error: Exception,
    operationType: OperationType,
    path: String?
  ): String {
    val auth = FirebaseAuth.getInstance()
    val user = auth.currentUser
    val code = (error as? FirebaseFirestoreException)?.code?.name ?: "ERROR"
    val info = JSONObject().apply {
      put("error", error.message ?: "Firestore operation failed")
      put("code", code)
      put("operationType", operationType.name.lowercase())
      put("path", path ?: "")
      put("uid", user?.uid ?: "")
      put("email", user?.email ?: "")
    }
    Log.e(TAG, "Firestore failure: $info", error)
    return error.message ?: "Operation failed ($code)"
  }
}
