package de.gruenerator.playinappupdates

import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Only echoed back by Play; the result is not read, the install listener is.
private const val REQUEST_CODE = 0x4752

/**
 * Google Play In-App Updates, flexible flow only: Play asks, downloads in the
 * background, and the app offers the restart (`completeUpdate`) once
 * `onDownloaded` fires.
 */
class PlayInAppUpdatesModule : Module() {
  private var manager: AppUpdateManager? = null

  private val listener = InstallStateUpdatedListener { state ->
    if (state.installStatus() == InstallStatus.DOWNLOADED) {
      sendEvent("onDownloaded", emptyMap<String, Any>())
    }
  }

  private fun manager(): AppUpdateManager {
    manager?.let { return it }
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return AppUpdateManagerFactory.create(context).also {
      it.registerListener(listener)
      manager = it
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PlayInAppUpdates")

    Events("onDownloaded")

    AsyncFunction("check") { promise: Promise ->
      manager().appUpdateInfo
        .addOnSuccessListener { info ->
          promise.resolve(
            mapOf(
              "available" to (
                info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                  info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
                ),
              "downloaded" to (info.installStatus() == InstallStatus.DOWNLOADED),
              "versionCode" to info.availableVersionCode()
            )
          )
        }
        .addOnFailureListener { error ->
          promise.reject("ERR_PLAY_UPDATE_CHECK", error.message, error)
        }
    }

    AsyncFunction("startFlexibleUpdate") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_PLAY_UPDATE_START", "No current activity", null)
        return@AsyncFunction
      }
      val updates = manager()
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          try {
            val started = updates.startUpdateFlowForResult(
              info,
              activity,
              AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
              REQUEST_CODE
            )
            (updates as? FakeAppUpdateManager)?.let { fake ->
              fake.userAcceptsUpdate()
              fake.downloadStarts()
              fake.downloadCompletes()
            }
            promise.resolve(started)
          } catch (error: Exception) {
            promise.reject("ERR_PLAY_UPDATE_START", error.message, error)
          }
        }
        .addOnFailureListener { error ->
          promise.reject("ERR_PLAY_UPDATE_START", error.message, error)
        }
    }

    AsyncFunction("completeUpdate") {
      manager().completeUpdate()
      Unit
    }

    // Development only: swaps in Google's fake so the whole flow (available →
    // downloaded → restart) can be walked through on an emulator without a
    // Play release. The fake cannot install, so completeUpdate does nothing.
    AsyncFunction("simulateUpdateForTesting") { versionCode: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      manager?.unregisterListener(listener)
      manager = FakeAppUpdateManager(context).also {
        it.setUpdateAvailable(versionCode, AppUpdateType.FLEXIBLE)
        it.registerListener(listener)
      }
      Unit
    }

    OnDestroy {
      manager?.unregisterListener(listener)
    }
  }
}
