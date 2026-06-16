const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const PACKAGE_PATH = path.join('com', 'geniestudio', 'coonn');

function ensureServiceAndReceiver(androidManifest) {
  const app = androidManifest.manifest.application?.[0];
  if (!app) return androidManifest;

  app.service = app.service || [];
  app.receiver = app.receiver || [];

  const hasService = app.service.some(
    (s) => s.$?.['android:name'] === '.CoonnFirebaseMessagingService'
  );
  if (!hasService) {
    app.service.push({
      $: {
        'android:name': '.CoonnFirebaseMessagingService',
        'android:exported': 'false',
        'android:stopWithTask': 'false',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
        },
      ],
    });
  }

  const hasReceiver = app.receiver.some(
    (r) => r.$?.['android:name'] === '.ChatPushActionReceiver'
  );
  if (!hasReceiver) {
    app.receiver.push({
      $: {
        'android:name': '.ChatPushActionReceiver',
        'android:exported': 'false',
      },
    });
  }

  return androidManifest;
}

function ensureDependencies(src) {
  let out = src;
  if (!out.includes('com.google.firebase:firebase-messaging')) {
    out = out.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation "com.google.firebase:firebase-messaging:24.1.0"`
    );
  }
  if (!out.includes('androidx.work:work-runtime-ktx')) {
    out = out.replace(
      /dependencies\s*\{/,
      `dependencies {\n    implementation "androidx.work:work-runtime-ktx:2.10.0"`
    );
  }
  return out;
}

function copyIfExists(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const withCoonnRichPush = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureServiceAndReceiver(cfg.modResults);
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = ensureDependencies(cfg.modResults.contents);
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const nativeBase = path.join(projectRoot, 'plugins', 'native', 'android');
      const javaOut = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        PACKAGE_PATH
      );
      const resLayoutOut = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'layout'
      );

      copyIfExists(
        path.join(nativeBase, PACKAGE_PATH, 'ChatPushNotificationHelper.kt'),
        path.join(javaOut, 'ChatPushNotificationHelper.kt')
      );

      copyIfExists(
        path.join(nativeBase, PACKAGE_PATH, 'CoonnActiveChatRoomState.kt'),
        path.join(javaOut, 'CoonnActiveChatRoomState.kt')
      );

      copyIfExists(
        path.join(nativeBase, PACKAGE_PATH, 'CoonnActiveChatRoomModule.kt'),
        path.join(javaOut, 'CoonnActiveChatRoomModule.kt')
      );

      copyIfExists(
        path.join(nativeBase, PACKAGE_PATH, 'CoonnActiveChatRoomPackage.kt'),
        path.join(javaOut, 'CoonnActiveChatRoomPackage.kt')
      );

      copyIfExists(
        path.join(nativeBase, 'res', 'layout', 'chat_push_collapsed.xml'),
        path.join(resLayoutOut, 'chat_push_collapsed.xml')
      );

      copyIfExists(
        path.join(nativeBase, 'res', 'layout', 'chat_push_expanded.xml'),
        path.join(resLayoutOut, 'chat_push_expanded.xml')
      );

      return cfg;
    },
  ]);

  return config;
};

module.exports = createRunOncePlugin(
  withCoonnRichPush,
  'with-coonn-rich-push',
  '1.0.1'
);
