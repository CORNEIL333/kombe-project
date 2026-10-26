package com.kombe.kombe_mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Canal « kombe/mise_a_jour » : version installée et installation d'une
 * nouvelle version téléchargée par l'application (pipeline GitHub Releases).
 * Android garde la main : l'installation passe toujours par l'écran système,
 * et n'est acceptée que si l'APK est signé avec la même clé.
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kombe/mise_a_jour").setMethodCallHandler { call, result ->
            when (call.method) {
                "version" -> {
                    val info = packageManager.getPackageInfo(packageName, 0)
                    @Suppress("DEPRECATION")
                    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
                    result.success(mapOf("name" to (info.versionName ?: ""), "code" to code))
                }
                "peutInstaller" -> {
                    result.success(Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls())
                }
                "autoriserInstallation" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                    result.success(null)
                }
                "installer" -> {
                    val chemin = call.argument<String>("chemin")
                    if (chemin == null || !File(chemin).exists()) {
                        result.error("FICHIER_ABSENT", "Fichier de mise à jour introuvable", null)
                    } else {
                        val uri = FileProvider.getUriForFile(this, "$packageName.mise_a_jour", File(chemin))
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                        result.success(null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
