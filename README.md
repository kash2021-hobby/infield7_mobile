# InField 7 phone app

Expo app for the field phone. It is not deployed on the VPS. Build the APK on a machine with EAS/Android tooling, then people install that APK.

It calls the same API as the website. Set `EXPO_PUBLIC_API_URL` to that public API before you build.

## Local (Expo Go)

```bash
cp .env.example .env
# For a phone on the same Wi-Fi: EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:4000
npm install
npx expo start --lan
```

## Store / APK

```bash
# EXPO_PUBLIC_API_URL=https://infieldback.ltabai.in
npx eas build --platform android --profile production
```

A production APK still uses an `https://` API URL. Expo Go uses the LAN address in `.env`.

My visits follows nearest-next unless a manager sent today's order from Tasks → Route.
