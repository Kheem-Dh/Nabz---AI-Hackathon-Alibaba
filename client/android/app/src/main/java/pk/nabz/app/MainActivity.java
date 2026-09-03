package pk.nabz.app;

import com.getcapacitor.BridgeActivity;

/**
 * Do NOT override the WebChromeClient here — Capacitor 7's own
 * BridgeWebChromeClient already implements onPermissionRequest correctly
 * (it uses the modern permissionLauncher and requests both RECORD_AUDIO
 * and MODIFY_AUDIO_SETTINGS at runtime). Replacing the WebChromeClient
 * with a plain WebChromeClient — as an earlier revision of this file did —
 * broke file uploads, JS dialogs, and left the mic permanently denied on
 * the first tap. The AndroidManifest declares the permissions; Capacitor
 * does the rest.
 */
public class MainActivity extends BridgeActivity {}
