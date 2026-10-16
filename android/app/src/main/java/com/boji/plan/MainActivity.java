package com.boji.plan;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
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

import java.io.File;
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

        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (fileCallback == null) return;
                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Uri u = result.getData().getData();
                        if (u != null) results = new Uri[]{u};
                    }
                    if (results == null && cameraImageUri != null) {
                        results = new Uri[]{cameraImageUri};
                        cameraImageUri = null;
                    }
                    fileCallback.onReceiveValue(results);
                    fileCallback = null;
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
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            launchCamera();
        }
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
