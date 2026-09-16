// Plain app.json converted to app.config.js for exactly one reason: the
// Google Maps iOS API key can't be hardcoded into a file that's tracked in
// git. Everything else here is unchanged from the previous app.json —
// this is config-time only (runs in Node during expo prebuild/start), so
// GOOGLE_MAPS_IOS_API_KEY is read straight from process.env, the same way
// the Expo CLI already loads .env for EXPO_PUBLIC_* vars, just without
// that prefix since this never needs to reach client JS.
module.exports = {
  expo: {
    name: 'Dyarna',
    slug: 'dyarna',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'dyarna',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.anonymous.dyarna',
      infoPlist: {
        LSApplicationQueriesSchemes: ['comgooglemaps'],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0B2B21',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
      package: 'com.anonymous.dyarna',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-image',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#0B2B21',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'ديارنا بتحتاج توصل لصورك عشان تضيفهن على إعلان العقار.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'ديارنا بتحتاج موقعك عشان توريك العقارات القريبة منك على الخريطة.',
          locationAlwaysAndWhenInUsePermission: false,
          locationAlwaysPermission: false,
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: 'f33eed65-c7a1-471d-8c55-db205686fd42',
      },
    },
  },
};
