package pk.nabz.app;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;

/**
 * Native microphone capture for the Android APK.
 *
 * AudioRecord writes mono PCM directly and avoids both Android System WebView's
 * audio-only MediaRecorder failures and OEM-specific AAC MediaRecorder setup.
 * The completed clip is wrapped in a standard WAV container and sent through
 * the existing /api/voice/transcribe path.
 */
@CapacitorPlugin(
    name = "NativeVoiceRecorder",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class NativeVoiceRecorderPlugin extends Plugin {
    private static final int[] SAMPLE_RATES = { 16_000, 44_100, 48_000 };
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int WAV_HEADER_BYTES = 44;

    private final Object recorderLock = new Object();
    private AudioRecord audioRecord;
    private Thread writerThread;
    private File recordingFile;
    private volatile boolean recording;
    private volatile Throwable writerError;
    private int sampleRate;
    private int bufferSize;
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
                initialiseAudioRecord();
                recordingFile = File.createTempFile("nabz-voice-", ".wav", getContext().getCacheDir());
                try (FileOutputStream output = new FileOutputStream(recordingFile)) {
                    output.write(new byte[WAV_HEADER_BYTES]);
                }

                writerError = null;
                recording = true;
                audioRecord.startRecording();
                if (audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                    throw new IllegalStateException("Android did not enter recording state");
                }
                startedAtMs = System.currentTimeMillis();
                writerThread = new Thread(this::writePcmLoop, "nabz-audio-capture");
                writerThread.start();

                JSObject result = new JSObject();
                result.put("recording", true);
                result.put("sampleRate", sampleRate);
                call.resolve(result);
            } catch (Exception error) {
                discardRecorderLocked();
                call.reject("Could not start the phone microphone", "mic-failed", error);
            }
        }
    }

    private void initialiseAudioRecord() {
        for (int candidate : SAMPLE_RATES) {
            int minimum = AudioRecord.getMinBufferSize(candidate, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (minimum <= 0) continue;
            AudioRecord next = null;
            try {
                int requestedBuffer = Math.max(minimum * 2, candidate / 2);
                next = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    candidate,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    requestedBuffer
                );
                if (next.getState() == AudioRecord.STATE_INITIALIZED) {
                    audioRecord = next;
                    sampleRate = candidate;
                    bufferSize = requestedBuffer;
                    return;
                }
            } catch (RuntimeException ignored) {
                // Try the next sample rate supported by this phone.
            }
            if (next != null) next.release();
        }
        throw new IllegalStateException("No supported microphone sample rate");
    }

    private void writePcmLoop() {
        byte[] buffer = new byte[bufferSize];
        try (FileOutputStream output = new FileOutputStream(recordingFile, true)) {
            while (recording) {
                int count = audioRecord.read(buffer, 0, buffer.length);
                if (count > 0) {
                    output.write(buffer, 0, count);
                } else if (count < 0) {
                    throw new IOException("Android microphone read failed: " + count);
                }
            }
        } catch (Throwable error) {
            if (recording) writerError = error;
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (recorderLock) {
            if (!recording || audioRecord == null || recordingFile == null) {
                call.reject("No recording is active", "not-recording");
                return;
            }

            File completedFile = recordingFile;
            long durationMs = Math.max(0, System.currentTimeMillis() - startedAtMs);
            try {
                stopCaptureLocked();
                if (writerError != null) throw new IOException("Microphone capture failed", writerError);
                writeWavHeader(completedFile);

                byte[] audio = readFile(completedFile);
                if (audio.length <= WAV_HEADER_BYTES + 320 || durationMs < 250) {
                    call.reject("No speech was recorded", "no-speech");
                    return;
                }

                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(audio, Base64.NO_WRAP));
                result.put("mimeType", "audio/wav");
                result.put("durationMs", durationMs);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not finish the recording", "mic-failed", error);
            } finally {
                releaseRecorderLocked();
                if (completedFile.exists()) completedFile.delete();
                recordingFile = null;
                startedAtMs = 0;
                writerError = null;
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

    private void stopCaptureLocked() {
        recording = false;
        if (audioRecord != null && audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
            try {
                audioRecord.stop();
            } catch (RuntimeException ignored) {
                // Releasing below still tears down a device-invalidated session.
            }
        }
        if (writerThread != null) {
            try {
                writerThread.join(2_000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            if (writerThread.isAlive()) writerThread.interrupt();
            writerThread = null;
        }
    }

    private void releaseRecorderLocked() {
        recording = false;
        if (audioRecord != null) {
            try {
                audioRecord.release();
            } catch (RuntimeException ignored) {
                // Nothing else can be recovered from a released audio device.
            }
            audioRecord = null;
        }
    }

    private void discardRecorderLocked() {
        stopCaptureLocked();
        releaseRecorderLocked();
        if (recordingFile != null && recordingFile.exists()) recordingFile.delete();
        recordingFile = null;
        startedAtMs = 0;
        writerError = null;
    }

    private void writeWavHeader(File file) throws IOException {
        long pcmBytes = Math.max(0, file.length() - WAV_HEADER_BYTES);
        int byteRate = sampleRate * 2;
        try (RandomAccessFile wav = new RandomAccessFile(file, "rw")) {
            wav.seek(0);
            wav.writeBytes("RIFF");
            writeLittleEndian(wav, pcmBytes + 36, 4);
            wav.writeBytes("WAVEfmt ");
            writeLittleEndian(wav, 16, 4);
            writeLittleEndian(wav, 1, 2);
            writeLittleEndian(wav, 1, 2);
            writeLittleEndian(wav, sampleRate, 4);
            writeLittleEndian(wav, byteRate, 4);
            writeLittleEndian(wav, 2, 2);
            writeLittleEndian(wav, 16, 2);
            wav.writeBytes("data");
            writeLittleEndian(wav, pcmBytes, 4);
        }
    }

    private void writeLittleEndian(RandomAccessFile file, long value, int bytes) throws IOException {
        for (int index = 0; index < bytes; index += 1) {
            file.write((int) ((value >> (8 * index)) & 0xff));
        }
    }

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
