import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { pickPhoto, uploadProof } from './photos';
import { callV1 } from './v1';

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
jest.mock('./v1', () => ({ callV1: jest.fn() }));

const picker = ImagePicker as unknown as Record<string, jest.Mock>;
const context = (jest.requireMock('expo-image-manipulator') as { __context: { resize: jest.Mock; renderAsync: jest.Mock } })
  .__context;
const call = callV1 as jest.Mock;
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
  const UPLOAD = 'https://jonz.app/files/up/proofs/h1/a1/f0.jpg?token=t';

  beforeEach(() => {
    call.mockResolvedValue({ path: 'h1/a1/f0.jpg', upload: UPLOAD, link: null });
  });

  it('asks /v1 where the receipt goes, puts its bytes there, and returns its path', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(bytes) }).mockResolvedValueOnce({ ok: true, status: 204 });
    await expect(uploadProof('h1', 'a1', 'file:///small.jpg')).resolves.toBe('h1/a1/f0.jpg');
    expect(call).toHaveBeenCalledWith('proof_upload', { houseId: 'h1', assignmentId: 'a1' });
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'file:///small.jpg');
    expect(global.fetch).toHaveBeenNthCalledWith(2, UPLOAD, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: bytes });
  });

  it("fails with a sentence when the bytes don't go", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(bytes) }).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(uploadProof('h1', 'a1', 'file:///small.jpg')).rejects.toThrow('The picture didn’t upload. Try again.');
  });
});
