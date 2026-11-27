package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.example.firebase.BusFirebaseRepository
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException

class MainActivity : ComponentActivity() {

  private var webViewRef: WebView? = null
  private lateinit var firebaseRepo: BusFirebaseRepository

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    hideSystemBars()

    firebaseRepo = BusFirebaseRepository(this) { eventName, payload ->
      dispatchToJs("window.onNativeFirebaseEvent && window.onNativeFirebaseEvent(${JSONObject.quote(eventName)}, $payload);")
    }
    firebaseRepo.startAuthListening()
    lifecycleScope.launch {
      firebaseRepo.tryAutoSignIn(this@MainActivity)
    }

    setContent {
      GameWebViewScreen(
        activity = this,
        firebaseRepo = firebaseRepo,
        onDispatchJs = { script -> dispatchToJs(script) },
        onWebViewCreated = { webView -> webViewRef = webView },
        onExitApp = { finish() }
      )
    }
  }

  private fun dispatchToJs(script: String) {
    val wv = webViewRef ?: return
    wv.post {
      wv.evaluateJavascript(script, null)
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemBars()
    }
  }

  override fun onPause() {
    webViewRef?.evaluateJavascript("window.onAppPause && window.onAppPause();", null)
    webViewRef?.onPause()
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    webViewRef?.onResume()
    hideSystemBars()
  }

  override fun onDestroy() {
    firebaseRepo.stopListening()
    webViewRef?.destroy()
    webViewRef = null
    super.onDestroy()
  }

  private fun hideSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }
}

private class AndroidGameBridge(
  private val activity: ComponentActivity,
  private val firebaseRepo: BusFirebaseRepository,
  private val onDispatchJs: (String) -> Unit,
  private val onExitApp: () -> Unit
) {
  @JavascriptInterface
  fun exitApp() {
    activity.runOnUiThread { onExitApp() }
  }

  @JavascriptInterface
  fun isAndroid(): Boolean = true

  @JavascriptInterface
  fun vibrate(durationMs: Long) {
    val ms = durationMs.coerceIn(5L, 250L)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
      manager?.defaultVibrator?.vibrate(
        VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)
      )
    } else {
      @Suppress("DEPRECATION")
      val vibrator = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(ms)
      }
    }
  }

  @JavascriptInterface
  fun getAuthSnapshot(): String = firebaseRepo.getAuthSnapshot().toString()

  @JavascriptInterface
  fun fbRequest(requestId: String, action: String, payloadJson: String) {
    activity.lifecycleScope.launch {
      val result: JSONObject = try {
        val data = if (payloadJson.isBlank()) JSONObject() else JSONObject(payloadJson)
        when (action) {
          "signInGoogle" -> firebaseRepo.signInWithGoogle(activity)
          "signOut" -> firebaseRepo.signOut()
          "syncAll" -> firebaseRepo.syncProfileAndCloudSave(
            data.optString("profileJson", "{}"),
            data.optString("saveJson", "{}")
          )
          "loadSave" -> firebaseRepo.loadCloudSave()
          "leaderboard" -> firebaseRepo.fetchLeaderboard(data.optString("category", "taka"))
          "sendFriendReq" -> firebaseRepo.sendFriendRequestByCode(
            data.optString("friendCode", ""),
            data.optString("myName", "Driver")
          )
          "respondFriendReq" -> firebaseRepo.respondFriendRequest(
            data.optString("reqId", ""),
            data.optBoolean("accept", true)
          )
          "listRooms" -> firebaseRepo.listRooms()
          "createRoom" -> firebaseRepo.createRoom(data.toString())
          "joinRoom" -> firebaseRepo.joinRoomByIdOrCode(
            data.optString("idOrCode", ""),
            data.optString("playerJson", "{}")
          )
          "leaveRoom" -> firebaseRepo.leaveCurrentRoom()
          "updateRoom" -> firebaseRepo.updateRoomHostConfig(
            data.optString("roomId", ""),
            data.optString("updatesJson", "{}")
          )
          "pushTelemetry" -> firebaseRepo.pushPlayerTelemetry(
            data.optString("roomId", ""),
            data.optString("stateJson", "{}")
          )
          "sendChat" -> firebaseRepo.sendChatMessage(
            data.optString("roomId", ""),
            data.optString("senderName", "Driver"),
            data.optString("text", "")
          )
          "submitCompetition" -> firebaseRepo.submitCompetitionScore(
            data.optString("compId", ""),
            data.optString("displayName", "Driver"),
            data.optString("companyName", ""),
            data.optDouble("score", 0.0),
            data.optString("metricLabel", "pts")
          )
          "fetchCompetition" -> firebaseRepo.fetchCompetitionEntries(
            data.optString("compId", "")
          )
          else -> JSONObject().put("ok", false).put("error", "Unknown action: $action")
        }
      } catch (e: Exception) {
        JSONObject().put("ok", false).put("error", e.message ?: "Bridge call failed")
      }
      onDispatchJs(
        "window.onNativeBridgeResponse && window.onNativeBridgeResponse(${JSONObject.quote(requestId)}, $result);"
      )
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GameWebViewScreen(
  activity: ComponentActivity,
  firebaseRepo: BusFirebaseRepository,
  onDispatchJs: (String) -> Unit,
  onWebViewCreated: (WebView) -> Unit,
  onExitApp: () -> Unit
) {
  val context = LocalContext.current

  val webView = remember {
    WebView(context).apply {
      layoutParams =
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      setBackgroundColor(Color.parseColor("#07140E"))
      setLayerType(View.LAYER_TYPE_HARDWARE, null)
      isHorizontalScrollBarEnabled = false
      isVerticalScrollBarEnabled = false
      overScrollMode = View.OVER_SCROLL_NEVER

      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = true
        allowContentAccess = true
        mediaPlaybackRequiresUserGesture = false
        useWideViewPort = true
        loadWithOverviewMode = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        cacheMode = WebSettings.LOAD_DEFAULT
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      }

      addJavascriptInterface(
        AndroidGameBridge(activity, firebaseRepo, onDispatchJs, onExitApp),
        "AndroidBridge"
      )

      webChromeClient =
        object : WebChromeClient() {
          override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean = true
        }

      webViewClient =
        object : WebViewClient() {
          private val assetHost = "appassets.androidplatform.net"

          override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
          ): WebResourceResponse? {
            val uri = request?.url ?: return null
            if (uri.host != assetHost) return null
            var path = uri.path?.removePrefix("/") ?: "index.html"
            if (path.isEmpty() || path.endsWith("/")) {
              path += "index.html"
            }
            val assetPath = "www/$path"
            return try {
              val stream = context.assets.open(assetPath)
              val mimeType = guessMimeType(path)
              val headers = mapOf("Access-Control-Allow-Origin" to "*")
              WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, stream)
            } catch (_: IOException) {
              null
            }
          }
        }

      loadUrl("https://appassets.androidplatform.net/index.html")
      onWebViewCreated(this)
    }
  }

  BackHandler {
    webView.evaluateJavascript("window.onAndroidBack && window.onAndroidBack();", null)
  }

  DisposableEffect(Unit) {
    onDispose {
      webView.stopLoading()
    }
  }

  Box(
    modifier =
      Modifier.fillMaxSize()
        .background(ComposeColor(0xFF07140E))
        .testTag("game_webview_container")
  ) {
    AndroidView(
      factory = { webView },
      modifier = Modifier.fillMaxSize().testTag("game_webview")
    )
  }
}

private fun guessMimeType(path: String): String =
  when (path.substringAfterLast('.', "").lowercase()) {
    "html",
    "htm" -> "text/html"
    "js",
    "mjs" -> "application/javascript"
    "css" -> "text/css"
    "json" -> "application/json"
    "png" -> "image/png"
    "jpg",
    "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    "svg" -> "image/svg+xml"
    "woff2" -> "font/woff2"
    "ttf" -> "font/ttf"
    "wav" -> "audio/wav"
    "mp3" -> "audio/mpeg"
    else -> "application/octet-stream"
  }
