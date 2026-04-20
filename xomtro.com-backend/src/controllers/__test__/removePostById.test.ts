// Ngăn lỗi Drizzle Schema load khi chạy test
jest.mock('@/models/schema', () => ({ __esModule: true }));

import { removePostById } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as fileUploadService from '@/services/fileUpload.service';
import * as schemaHelper from '@/utils/schema.helper';
import { StatusCodes } from 'http-status-codes';

// Mock các Service
jest.mock('@/services/post.service');
jest.mock('@/services/fileUpload.service');
jest.mock('@/utils/schema.helper');
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnThis()
  }))
}));

describe('removePostById - Branch & Condition Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };

    mockReq = {
      params: { postId: '100' },
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };

    // Mặc định Happy Path
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'rental' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (postService.selectPostAssetsByPostId as jest.Mock).mockResolvedValue([]);
    (postService.deletePostById as jest.Mock).mockResolvedValue([1]);
    (fileUploadService.deleteManyResources as jest.Mock).mockResolvedValue(true);
  });

  // --- NHÓM 1: KIỂM TRA ĐẦU VÀO & SỰ TỒN TẠI (VALIDATION) ---

  test('TCQLBV87: Lỗi 400 khi thiếu postId trong params', async () => {
    mockReq.params = {}; // postId undefined
    await removePostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV88: Lỗi 404 khi không tìm thấy bài post trong Database', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);
    await removePostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  // --- NHÓM 2: PHÂN QUYỀN (AUTHORIZATION) ---

  test('TCQLBV89: Lỗi 403 khi userId không khớp với ownerId của post', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await removePostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TCQLBV90: Lỗi 403 khi role người dùng không có quyền xóa loại post này', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'special' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(false);
    
    await removePostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  // --- NHÓM 3: LOGIC XỬ LÝ TÀI NGUYÊN & XÓA (CLEANUP) ---

  test('TCQLBV91: Phải gọi deleteManyResources với đúng danh sách ảnh hiện có', async () => {
    const mockAssets = [
      { name: 'image1.jpg' },
      { name: 'image2.png' }
    ];
    (postService.selectPostAssetsByPostId as jest.Mock).mockResolvedValue(mockAssets);

    await removePostById(mockReq, mockRes, next);

    // Kiểm tra asset được map thành mảng string tên file
    expect(fileUploadService.deleteManyResources).toHaveBeenCalledWith(
      ['image1.jpg', 'image2.png'], 
      'image'
    );
    expect(postService.deletePostById).toHaveBeenCalledWith(100);
  });

  test('TCQLBV92: Vẫn tiếp tục xóa post ngay cả khi xóa ảnh trên Cloud/Server thất bại (Promise.allSettled)', async () => {
    (fileUploadService.deleteManyResources as jest.Mock).mockRejectedValue(new Error('Cloud error'));
    
    await removePostById(mockReq, mockRes, next);

    // Vì dùng allSettled nên lỗi xóa ảnh không nhảy vào catch
    expect(postService.deletePostById).toHaveBeenCalled();
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Delete post successfully!'
    }));
  });

  // --- NHÓM 4: THÀNH CÔNG ---

  test('TCQLBV93: Xóa thành công bài post không có ảnh', async () => {
    (postService.selectPostAssetsByPostId as jest.Mock).mockResolvedValue([]);
    
    await removePostById(mockReq, mockRes, next);

    expect(fileUploadService.deleteManyResources).toHaveBeenCalledWith([], 'image');
    expect(postService.deletePostById).toHaveBeenCalledWith(100);
    expect(mockRes.send).toHaveBeenCalled();
  });
});