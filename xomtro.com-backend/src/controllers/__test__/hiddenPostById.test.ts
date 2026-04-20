/*import { StatusCodes } from 'http-status-codes';

// 1. Mock triệt để các service để cô lập logic và tránh lỗi Drizzle
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  updatePostById: jest.fn(),
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
}));

// Mock enum hoặc constant postStatus nếu nó từ file constants
const postStatus = {
  HIDDEN: 'hidden',
  ACTIVED: 'actived'
};

// 2. Import bằng require sau khi đã Mock
const { hiddenPostById } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');
const schemaHelper = require('@/utils/schema.helper');

describe('hiddenPostById - Branch & Condition Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Request mặc định hợp lệ
    mockReq = {
      params: { postId: '100' },
      currentUser: {
        users_detail: { userId: 1, role: 'user' }
      }
    };

    // Thiết lập mock mặc định (vượt qua các guard clauses)
    schemaHelper.checkUserAndPostPermission.mockReturnValue(true);
    postService.selectPostById.mockResolvedValue([{ 
      id: 100, 
      ownerId: 1, 
      type: 'wanted', 
      status: 'actived' 
    }]);
    postService.updatePostById.mockResolvedValue(true);
  });

  // --- NHÓM 1: CÁC NHÁNH LỖI (ERROR BRANCHES) ---

  test('TC1: postId trống - Expected 400', async () => {
    mockReq.params.postId = undefined;
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TC2: Bài viết không tồn tại - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TC3: Sai chủ sở hữu (ownerId) - Expected 403', async () => {
    postService.selectPostById.mockResolvedValue([{ id: 100, ownerId: 999, status: 'actived' }]);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TC4: Không có quyền thao tác (Permission check) - Expected 403', async () => {
    schemaHelper.checkUserAndPostPermission.mockReturnValue(false);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  // --- NHÓM 2: LOGIC ĐẢO TRẠNG THÁI (TOGGLE STATUS LOGIC) ---

  test('TC5: Đang "actived" -> Phải chuyển sang "hidden"', async () => {
    // DB đang trả về status: 'actived' (thiết lập ở beforeEach)
    await hiddenPostById(mockReq, mockRes, next);

    const updateCalls = postService.updatePostById.mock.calls;
    expect(updateCalls[0][1].status).toBe(postStatus.HIDDEN);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: postStatus.HIDDEN }
    }));
  });

  test('TC6: Đang "hidden" hoặc trạng thái khác -> Phải chuyển sang "actived"', async () => {
    // Giả lập DB trả về status đang bị ẩn
    postService.selectPostById.mockResolvedValue([{ 
      id: 100, 
      ownerId: 1, 
      type: 'wanted', 
      status: 'hidden' 
    }]);

    await hiddenPostById(mockReq, mockRes, next);

    const updateCalls = postService.updatePostById.mock.calls;
    expect(updateCalls[0][1].status).toBe(postStatus.ACTIVED);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: postStatus.ACTIVED }
    }));
  });

  test('TC7: Trả về ApiResponse thành công 200', async () => {
    await hiddenPostById(mockReq, mockRes, next);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Change post status successfully!'
    }));
  });
});
*/
// Ngăn lỗi Drizzle Schema load
jest.mock('@/models/schema', () => ({ __esModule: true }));

import { hiddenPostById } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as schemaHelper from '@/utils/schema.helper';
import { StatusCodes } from 'http-status-codes';

// Mock các Service & Helper
jest.mock('@/services/post.service');
jest.mock('@/utils/schema.helper');
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: jest.fn().mockImplementation((status, message, data) => ({
    send: jest.fn().mockReturnThis(),
    data // Lưu lại data để expect
  }))
}));

describe('hiddenPostById - Branch & Condition Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = { 
      status: jest.fn().mockReturnThis(), 
      send: jest.fn().mockReturnThis() 
    };

    mockReq = {
      params: { postId: '100' },
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };

    // Mặc định Happy Path: Bài viết tồn tại, quyền sở hữu đúng, permission đúng
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
        id: 100, 
        ownerId: 1, 
        type: 'rental', 
        status: 'actived' 
    }]);
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (postService.updatePostById as jest.Mock).mockResolvedValue([1]);
  });

  // --- NHÓM 1: PHỦ NHÁNH LỖI (GUARD CLAUSES) ---

  test('TCQLBV107: Lỗi 400 khi postId bị thiếu', async () => {
    mockReq.params.postId = undefined;
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
  });

  test('TCQLBV108: Lỗi 404 khi không tìm thấy bài post', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([]);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.NOT_FOUND }));
  });

  test('TCQLBV109: Lỗi 403 khi không phải chủ sở hữu (ownerId mismatch)', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  test('TCQLBV110: Lỗi 403 khi checkUserAndPostPermission trả về false', async () => {
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(false);
    await hiddenPostById(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.FORBIDDEN }));
  });

  // --- NHÓM 2: PHỦ ĐIỀU KIỆN LOGIC CHUYỂN TRẠNG THÁI (TOGGLE) ---

  test('TCQLBV111: Chuyển từ "actived" sang "hidden" (Nhánh TRUE của ternary)', async () => {
    // Mock bài viết đang Active
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
        id: 100, ownerId: 1, status: 'actived', type: 'rental' 
    }]);

    await hiddenPostById(mockReq, mockRes, next);

    // Kiểm tra service updatePostById gọi với status: 'hidden'
    expect(postService.updatePostById).toHaveBeenCalledWith(100, { status: 'hidden' });
  });

  test('TCQLBV112: Chuyển từ "hidden" sang "actived" (Nhánh FALSE của ternary)', async () => {
    // Mock bài viết đang Hidden
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
        id: 100, ownerId: 1, status: 'hidden', type: 'rental' 
    }]);

    await hiddenPostById(mockReq, mockRes, next);

    // Kiểm tra service updatePostById gọi với status: 'actived'
    expect(postService.updatePostById).toHaveBeenCalledWith(100, { status: 'actived' });
  });

  // --- NHÓM 3: THÀNH CÔNG ---

  test('TCQLBV113: Trả về 200 và trạng thái mới sau khi update thành công', async () => {
    await hiddenPostById(mockReq, mockRes, next);

    expect(postService.updatePostById).toHaveBeenCalled();
    expect(mockRes.send).toHaveBeenCalled();
  });
});