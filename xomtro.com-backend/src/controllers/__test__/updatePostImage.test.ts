// 1. NGĂN LỖI SCHEMA (LUÔN ĐẶT ĐẦU FILE)
jest.mock('@/models/schema', () => ({ __esModule: true }));

// 2. THAY ĐỔI ĐƯỜNG DẪN NÀY CHO ĐÚNG VỚI THỰC TẾ DỰ ÁN CỦA BẠN
// Ví dụ: '@/services/upload.service' hoặc '@/controllers/post.controller'
import { uploadPostImageHandler } from '@/services/upload.service'; 

import * as fileUploadService from '@/services/fileUpload.service';
import { StatusCodes } from 'http-status-codes';

// Mock service upload
jest.mock('@/services/fileUpload.service');

describe('uploadPostImageHandler - Branch & Condition Coverage', () => {
  let mockReq: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      files: []
    };
  });

  // --- NHÓM 1: KIỂM TRA ĐIỀU KIỆN BIÊN & NGOẠI LỆ ---

  test('TC1: Lỗi 422 khi files không tồn tại hoặc không phải mảng', async () => {
    mockReq.files = undefined;
    await expect(uploadPostImageHandler(mockReq)).rejects.toThrow('File is not invalid');
    
    mockReq.files = {}; // Trường hợp là object
    await expect(uploadPostImageHandler(mockReq)).rejects.toThrow('File is not invalid');
  });

  test('TC2: Mảng files rỗng - Trả về kết quả rỗng', async () => {
    mockReq.files = [];
    const result = await uploadPostImageHandler(mockReq);
    
    expect(result.success).toEqual([]);
    expect(result.error).toEqual([]);
    expect(fileUploadService.uploadImage).not.toHaveBeenCalled();
  });

  // --- NHÓM 2: PHỦ NHÁNH LOGIC FILTER (MIMETYPE) ---

  test('TC3: Chỉ upload các file là image, loại bỏ các file khác', async () => {
    mockReq.files = [
      { originalname: 'image1.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('a') },
      { originalname: 'document.pdf', mimetype: 'application/pdf', buffer: Buffer.from('b') }
    ];

    (fileUploadService.uploadImage as jest.Mock).mockResolvedValue({ public_id: 'img_id' });

    const result = await uploadPostImageHandler(mockReq);

    // Kiểm tra: uploadImage chỉ được gọi 1 lần (cho file jpg)
    expect(fileUploadService.uploadImage).toHaveBeenCalledTimes(1);
    expect(result.success).toHaveLength(1);
    expect(result.error).toHaveLength(0);
  });

  // --- NHÓM 3: PHỦ ĐIỀU KIỆN CON TRONG PROMISE.ALL (SUCCESS/ERROR MIXED) ---

  test('TC4: Xử lý khi có file upload thành công và file upload thất bại', async () => {
    mockReq.files = [
      { originalname: 'success.png', mimetype: 'image/png' },
      { originalname: 'fail.jpg', mimetype: 'image/jpeg' }
    ];

    // Mock file 1 thành công, file 2 lỗi
    (fileUploadService.uploadImage as jest.Mock)
      .mockResolvedValueOnce({ secure_url: 'http://res.com/success.png' })
      .mockRejectedValueOnce(new Error('Cloudinary error'));

    const result = await uploadPostImageHandler(mockReq);

    // Kiểm tra mảng thành công
    expect(result.success).toHaveLength(1);
    expect(result.success[0].secure_url).toBe('http://res.com/success.png');

    // Kiểm tra mảng lỗi (local catch bên trong map)
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toEqual({
      file: 'fail.jpg',
      message: 'Cloudinary error'
    });
  });

  test('TC5: Tất cả file đều upload lỗi', async () => {
    mockReq.files = [{ originalname: 'img.jpg', mimetype: 'image/jpeg' }];
    (fileUploadService.uploadImage as jest.Mock).mockRejectedValue(new Error('Network Error'));

    const result = await uploadPostImageHandler(mockReq);

    expect(result.success).toHaveLength(0);
    expect(result.error).toHaveLength(1);
    expect(result.error[0].message).toBe('Network Error');
  });
});