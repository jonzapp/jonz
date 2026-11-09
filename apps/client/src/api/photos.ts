import { PROOF_QUALITY, proofSize } from '@app/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { putFile } from './files';
import { callV1 } from './v1';

// Photo receipts: from the camera or the library, shrunk to core's
// `proofSize` as the web shrinks them, then uploaded where /v1's
// proof_upload says. The storage policies and mark_done's path check decide
// who may put what where.

/**
 * A photo from the camera or the library, as a small JPEG ready to upload,
 * or null when the person backed out. Throws a sentence when the app may not
 * use the camera or photos.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        source === 'camera'
          ? 'Jonz needs the camera for photos. Allow it in Settings.'
          : 'Jonz needs your photos for this. Allow it in Settings.',
      );
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const { uri, width, height } = result.assets[0];
  const context = ImageManipulator.manipulate(uri);
  const size = proofSize(width, height);
  if (size.width !== width || size.height !== height) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PROOF_QUALITY });
  return saved.uri;
}

/** Upload a receipt for a John; returns its storage path for mark_done. */
export async function uploadProof(houseId: string, assignmentId: string, uri: string): Promise<string> {
  const { path, upload } = await callV1('proof_upload', { houseId, assignmentId });
  await putFile(upload, await (await fetch(uri)).arrayBuffer(), 'image/jpeg');
  return path;
}
