import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

const MAX_B64 = 400_000;

async function shrink(uri: string, width: number, compress: number) {
  return ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
}

export async function captureFieldPhoto(reason = "Camera permission is required for the photo.", facing: "front" | "back" = "back") {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error(reason);
  const shot = await ImagePicker.launchCameraAsync({
    quality: 0.5,
    exif: false,
    allowsEditing: false,
    cameraType: facing === "front" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (shot.canceled || !shot.assets[0]?.uri) return null;
  let result = await shrink(shot.assets[0].uri, 720, 0.55);
  if ((result.base64?.length ?? 0) > MAX_B64) result = await shrink(result.uri, 540, 0.4);
  if ((result.base64?.length ?? 0) > MAX_B64) result = await shrink(result.uri, 420, 0.32);
  if (!result.base64) throw new Error("Could not read the photo.");
  return `data:image/jpeg;base64,${result.base64}`;
}
