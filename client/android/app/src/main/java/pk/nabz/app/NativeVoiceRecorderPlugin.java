package pk.nabz.app;

import android.Manifest;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * Native microphone capture for the Android APK.
 *
 * Some Android System WebView releases grant RECORD_AUDIO but still fail while
 * constructing an audio-only browser MediaRecorder. Recording AAC natively
 * avoids that WebView-specific failure and returns the clip to the existing
 * /api/voice/transcribe upload path.
 */
@CapacitorPlugin(
    name = "NativeVoiceRecorder",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class NativeVoiceRecorderPlugin extends Plugin {
    private final Object recorderLock = new Object();
    private MediaRecorder recorder;
    private File recordingFile;
    private long startedAtMs;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        startRecorder(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            startRecorder(call);
        } else {
            call.reject("Microphone permission was denied", "not-allowed");
        }
    }

    private void startRecorder(PluginCall call) {
        synchronized (recorderLock) {
            discardRecorderLocked();
            try {
                recordingFile = File.createTempFile("nabz-voice-", ".m4a", getContext().getCacheDir());
                recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    ? new MediaRecorder(getContext())
                    : new MediaRecorder();
                recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                recorder.setAudioEncodingBitRate(64_000);
                recorder.setOutputFile(recordingFile.getAbsolutePath());
                recorder.prepare();
                recorder.start();
                startedAtMs = System.currentTimeMillis();

                JSObject result = new JSObject();
                result.put("recording", true);
                call.resolve(result);
            } catch (Exception error) {
                discardRecorderLocked();
                call.reject("Could not start the microphone", "mic-failed", error);
            }
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (recorderLock) {
            if (recorder == null || recordingFile == null) {
                call.reject("No recording is active", "not-recording");
                return;
            }

            File completedFile = recordingFile;
            long durationMs = Math.max(0, System.currentTimeMillis() - startedAtMs);
            try {
                recorder.stop();
                releaseRecorderLocked();

                byte[] audio = readFile(completedFile);
                if (audio.length < 500 || durationMs < 250) {
                    call.reject("No speech was recorded", "no-speech");
                    return;
                }

                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(audio, Base64.NO_WRAP));
                result.put("mimeType", "audio/mp4");
                result.put("durationMs", durationMs);
                call.resolve(result);
            } catch (RuntimeException | IOException error) {
                releaseRecorderLocked();
                call.reject("Could not finish the recording", "no-speech", error);
            } finally {
                if (completedFile.exists()) completedFile.delete();
                recordingFile = null;
                startedAtMs = 0;
            }
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        synchronized (recorderLock) {
            discardRecorderLocked();
            call.resolve();
        }
    }

    private void releaseRecorderLocked() {
        if (recorder != null) {
            try {
                recorder.reset();
            } catch (RuntimeException ignored) {
                // The device may already have invalidated the audio session.
            }
            recorder.release();
            recorder = null;
        }
    }

    private void discardRecorderLocked() {
        releaseRecorderLocked();
        if (recordingFile != null && recordingFile.exists()) recordingFile.delete();
        recordingFile = null;
        startedAtMs = 0;
    }

    // java.nio.file.Files requires Android 8. This keeps recording compatible
    // with the app's Android 6 minimum while still bounding memory to the
    // short voice clips accepted by the transcription endpoint.
    private byte[] readFile(File file) throws IOException {
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(file.length(), 1_048_576))
        ) {
            byte[] buffer = new byte[16_384];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (recorderLock) {
            discardRecorderLocked();
        }
    }
}
