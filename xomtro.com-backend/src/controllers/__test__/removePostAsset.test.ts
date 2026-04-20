// Ngăn lỗi Drizzle Schema
jest.mock('@/models/schema', () => ({ __esModule: true }));

import { removePostAssets } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as fileUploadService from '@/services/fileUpload.service';
import * as schemaHelper from '@/utils/schema.helper';
import { StatusCodes } from 'http-status-codes';

jest.mock('@/services/post.service');
jest.mock('@/services/fileUpload.service');
jest.mock('@/utils/schema.helper');
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation((status, message, data) => ({
    send: jest.fn().mockReturnThis(),
    data
  }))
}));

describe('removePostAssets - Branch & Condition Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };

    // Request mặc định
    mockReq = {
      params: { postId: '100' },
      query: { assetIds: ['1', '2'] }, // Mặc định là mảng
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };

    // Mock Happy Path
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 1, type: 'rental' }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (postService.selectPostAssetsByPostId as jest.Mock).mockResolvedValue([
      { id: 1, name: 'img1.jpg' },
      { id: 2, name: 'img2.jpg' },
      { id: 3, name: 'img3.jpg' }
    ]);
  });

  // --- NHÓM 1: CÁC CHỐT CHẶN (GUARDS) ---

  test('TCQLBV114: Lỗi 400 khi thiếu postId', async () => {
    mockReq.params.postId = undefined;
    await removePostAssets(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV115: Lỗi 404 khi không thấy bài post', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);
    await removePostAssets(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TCQLBV116: Lỗi 403 khi sai chủ sở hữu', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await removePostAssets(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TCQLBV117: Lỗi 404 khi bài post không hề có assets nào', async () => {
    (postService.selectPostAssetsByPostId as jest.Mock).mockResolvedValue([]);
    await removePostAssets(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  // --- NHÓM 2: PHỦ ĐIỀU KIỆN QUERY PARAMS (ASSET IDS) ---

  test('TCQLBV118: Nhánh assetIds là một mảng (Array.isArray)', async () => {
    mockReq.query.assetIds = ['1', '3']; // Xóa ảnh 1 và 3
    
    await removePostAssets(mockReq, mockRes, next);

    expect(fileUploadService.deleteManyResources).toHaveBeenCalledWith(['img1.jpg', 'img3.jpg'], 'image');
    expect(postService.deletePostAssets).toHaveBeenCalledWith(100, [1, 3]);
  });

  test('TCQLBV119: Nhánh assetIds là một giá trị đơn lẻ (không phải Array)', async () => {
    mockReq.query.assetIds = '2'; // Chỉ xóa ảnh 2
    
    await removePostAssets(mockReq, mockRes, next);

    expect(postService.deletePostAssets).toHaveBeenCalledWith(100, [2]);
    expect(fileUploadService.deleteManyResources).toHaveBeenCalledWith(['img2.jpg'], 'image');
  });

  test('TCQLBV120: Lọc bỏ các ID không hợp lệ hoặc không thuộc về bài post', async () => {
    // 99 không tồn tại trong postAssetsResult
    // 'abc' là NaN
    mockReq.query.assetIds = ['1', '99', 'abc']; 
    
    await removePostAssets(mockReq, mockRes, next);

    // Chỉ thực hiện xóa ID 1
    expect(postService.deletePostAssets).toHaveBeenCalledWith(100, [1]);
    const response = (mockRes.send as jest.Mock).mock.calls[0][0];
    expect(response.data.removedIds).toEqual([1]);
  });

  // --- NHÓM 3: LOGIC XỬ LÝ & THÀNH CÔNG ---

  test('TCQLBV121: Sử dụng Promise.allSettled để đảm bảo DB được cập nhật dù Cloud lỗi', async () => {
    (fileUploadService.deleteManyResources as jest.Mock).mockRejectedValue(new Error('Cloud error'));
    mockReq.query.assetIds = ['1'];

    await removePostAssets(mockReq, mockRes, next);

    // Lệnh xóa trong DB vẫn phải được gọi
    expect(postService.deletePostAssets).toHaveBeenCalled();
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Delete post assets successfully'
    }));
  });

  test('TCQLBV122: Trả về danh sách rỗng nếu không có ID nào khớp', async () => {
    mockReq.query.assetIds = ['888', '999']; 
    
    await removePostAssets(mockReq, mockRes, next);

    expect(fileUploadService.deleteManyResources).toHaveBeenCalledWith([], 'image');
    expect(postService.deletePostAssets).toHaveBeenCalledWith(100, []);
  });
});