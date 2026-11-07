import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { pickPhoto, uploadProof } from './photos';
import { supabase } from './supabase';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => {
  const mockContext = { resize: jest.fn(), renderAsync: jest.fn() };
  return { ImageManipulator: { manipulate: jest.fn(() => mockContext) }, SaveFormat: { JPEG: 'jpeg' }, __context: mockContext };
});
jest.mock('expo-crypto', () => ({ randomUUID: () => 'f0e1d2c3' }));
jest.mock('./supabase', () => {
  const mockBucket = { upload: jest.fn() };
  return { supabase: { storage: { from: jest.fn(() => mockBucket) } }, __bucket: mockBucket };
});

const picker = ImagePicker as unknown as Record<string, jest.Mock>;
const context = (jest.requireMock('expo-image-manipulator') as { __context: { resize: jest.Mock; renderAsync: jest.Mock } })
  .__context;
const bucket = (jest.requireMock('./supabase') as { __bucket: { upload: jest.Mock } }).__bucket;
const saveAsync = jest.fn();

function picked(width: number, height: number) {
  return { canceled: false, assets: [{ uri: 'file:///picked.heic', width, height }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  context.renderAsync.mockResolvedValue({ saveAsync });
  saveAsync.mockResolvedValue({ uri: 'file:///small.jpg' });
});

describe('pickPhoto', () => {
  it('takes one with the camera and saves it as a small JPEG', async () => {
    picker.launchCameraAsync.mockResolvedValue(picked(4032, 3024));
    await expect(pickPhoto('camera')).resolves.toBe('file:///small.jpg');
    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(picker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///picked.heic');
    expect(context.resize).toHaveBeenCalledWith({ width: 1600, height: 1200 });
    expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.82 });
  });

  it("chooses one from the library, and doesn't stretch a small one", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(picked(800, 600));
    await expect(pickPhoto('library')).resolves.toBe('file:///small.jpg');
    expect(picker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(context.resize).not.toHaveBeenCalled();
  });

  it('is null when the person backs out', async () => {
    picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickPhoto('camera')).resolves.toBeNull();
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('says where to allow the camera or photos when the app may not use them', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickPhoto('camera')).rejects.toThrow('Jonz needs the camera for photos. Allow it in Settings.');
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickPhoto('library')).rejects.toThrow('Jonz needs your photos for this. Allow it in Settings.');
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("leaves the asking to the browser's file chooser on the web", async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    picker.launchCameraAsync.mockResolvedValue(picked(800, 600));
    await expect(pickPhoto('camera')).resolves.toBe('file:///small.jpg');
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('uploadProof', () => {
  const bytes = new ArrayBuffer(4);

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(bytes) });
  });

  it("puts the receipt in the proofs bucket under the house and the John, and returns where", async () => {
    bucket.upload.mockResolvedValue({ data: {}, error: null });
    await expect(uploadProof('h1', 'a1', 'file:///small.jpg')).resolves.toBe('h1/a1/f0e1d2c3.jpg');
    expect(global.fetch).toHaveBeenCalledWith('file:///small.jpg');
    expect(supabase.storage.from).toHaveBeenCalledWith('proofs');
    expect(bucket.upload).toHaveBeenCalledWith('h1/a1/f0e1d2c3.jpg', bytes, { contentType: 'image/jpeg' });
  });

  it('fails when storage refuses it', async () => {
    bucket.upload.mockResolvedValue({ data: null, error: new Error('new row violates row-level security policy') });
    await expect(uploadProof('h1', 'a1', 'file:///small.jpg')).rejects.toThrow('row-level security');
  });
});
