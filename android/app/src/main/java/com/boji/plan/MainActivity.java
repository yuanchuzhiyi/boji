package com.boji.plan;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 薄肌计划 · 安卓壳
 * 本地 assets/www/index.html 经 WebViewAssetLoader 以 https://appassets.androidplatform.net/ 加载，
 * 页面直接请求 api.stepfun.com（该接口已允许浏览器跨域）。
 */
public class MainActivity extends AppCompatActivity {

    private static final String APP_HOST = "appassets.androidplatform.net";
    private WebView webView;
    private WebViewAssetLoader assetLoader;

    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraImageUri;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String> cameraPermissionLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        /* 语音输入：启动时申请麦克风运行时权限 */
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ android.Manifest.permission.RECORD_AUDIO }, 1001);
        }

        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (fileCallback == null) return;
                    Uri picked = null;
                    if (result.getResultCode() == RESULT_OK) {
                        if (result.getData() != null && result.getData().getData() != null) {
                            picked = result.getData().getData();
                        } else if (cameraImageUri != null) {
                            picked = cameraImageUri;
                        }
                    }
                    cameraImageUri = null;
                    if (picked != null) {
                        /* 原生读取并缩放成 base64，直接注入页面：
                           绕开部分 WebView 上 <input type=file> 的 change 事件 /
                           FileReader 不触发的问题。注入后仍回调 null 重置输入框。 */
                        final Uri uri = picked;
                        new Thread(new Runnable() {
                            @Override
                            public void run() {
                                final String b64 = uriToScaledBase64(uri);
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (b64 != null && webView != null) {
                                            String js = "window.__bojiOnNativeImage && window.__bojiOnNativeImage('" + b64 + "')";
                                            webView.evaluateJavascript(js, null);
                                        } else if (webView != null) {
                                            webView.evaluateJavascript(
                                                "window.__bojiToast && window.__bojiToast('图片读取失败，请重试')", null);
                                        }
                                        if (fileCallback != null) {
                                            fileCallback.onReceiveValue(null);
                                            fileCallback = null;
                                        }
                                    }
                                });
                            }
                        }).start();
                    } else {
                        fileCallback.onReceiveValue(null);
                        fileCallback = null;
                    }
                });

        cameraPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> {
                    if (granted) launchCamera();
                    else Toast.makeText(this, "需要相机权限才能拍照上传体检报告", Toast.LENGTH_SHORT).show();
                });

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = findViewById(R.id.webview);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage 持久化（API Key / 全部数据）
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                    // 跟随系统字号会破坏布局，固定
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " BojiPlanApp"); // 页面据此进入 App 模式

        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.bg));
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            /* WebView 里的 getUserMedia（语音输入）需要显式授权麦克风 */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean hasAudio = false;
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) hasAudio = true;
                        }
                        if (hasAudio) request.grant(request.getResources());
                        else request.deny();
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                }
                fileCallback = filePathCallback;

                Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
                gallery.addCategory(Intent.CATEGORY_OPENABLE);
                gallery.setType("image/*");

                Intent chooser = new Intent(Intent.ACTION_CHOOSER);
                chooser.putExtra(Intent.EXTRA_INTENT, gallery);
                chooser.putExtra(Intent.EXTRA_TITLE, "上传体检报告");

                // 相机入口（拍照后经 FileProvider 回传）
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (camera.resolveActivity(getPackageManager()) != null) {
                    File photo;
                    try { photo = createImageFile(); } catch (IOException e) { photo = null; }
                    if (photo != null) {
                        cameraImageUri = FileProvider.getUriForFile(
                                MainActivity.this, getPackageName() + ".fileprovider", photo);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                    }
                }
                try {
                    fileChooserLauncher.launch(chooser);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "没有可选的文件应用", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("https://" + APP_HOST + "/assets/www/index.html");
    }

    /* 读取相册/拍照 Uri，缩放到长边 1400px，JPEG 85，返回 Base64（不含 data: 前缀） */
    private String uriToScaledBase64(Uri uri) {
        InputStream is = null;
        try {
            is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(is, null, opts);
            is.close();
            is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            int max = 1400, sample = 1;
            int longEdge = Math.max(opts.outWidth, opts.outHeight);
            while (longEdge / sample > max) sample *= 2;
            BitmapFactory.Options opts2 = new BitmapFactory.Options();
            opts2.inSampleSize = sample;
            Bitmap bmp = BitmapFactory.decodeStream(is, null, opts2);
            is.close();
            if (bmp == null) return null;
            /* 二次精确缩放 */
            int w = bmp.getWidth(), h = bmp.getHeight();
            int le = Math.max(w, h);
            if (le > max) {
                float r = max / (float) le;
                bmp = Bitmap.createScaledBitmap(bmp, Math.round(w * r), Math.round(h * r), true);
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
            byte[] bytes = bos.toByteArray();
            bmp.recycle();
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        } finally {
            if (is != null) { try { is.close(); } catch (IOException ignored) {} }
        }
    }

    private File createImageFile() throws IOException {
        String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File dir = new File(getCacheDir(), "images");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "report_" + ts + ".jpg");
    }

    private void launchCamera() {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(getPackageManager()) == null) {
            Toast.makeText(this, "没有相机应用", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            File photo = createImageFile();
            cameraImageUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            fileChooserLauncher.launch(camera);
        } catch (IOException e) {
            Toast.makeText(this, "拍照启动失败", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        /* requestCode 1001 = 麦克风；授权后 WebView 的 getUserMedia 即可正常工作 */
    }

    /** 系统返回键：先让页面处理（关弹窗/切 Tab），再走 WebView 历史 */
    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("(window.__bojiBack && window.__bojiBack()) === true", handled -> {
                if ("true".equals(handled)) return;
                if (webView.canGoBack()) webView.goBack();
                else finish();
            });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
