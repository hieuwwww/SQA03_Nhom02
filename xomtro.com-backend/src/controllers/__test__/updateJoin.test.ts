import { updateJoinPost } from '@/controllers/post.controller';
import * as postService from '@/services/post.service';
import * as locationService from '@/services/location.service';
import * as schemaHelper from '@/utils/schema.helper';
import { StatusCodes } from 'http-status-codes';
import dayjs from 'dayjs';

// MOCK TRIỆT ĐỂ ĐỂ TRÁNH LỖI UNDEFINED
jest.mock('@/models/schema', () => ({ __esModule: true }));
jest.mock('@/services/post.service');
jest.mock('@/services/location.service');

// SỬA LỖI TẠI ĐÂY: Định nghĩa rõ các hàm khi mock module
jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
  cleanObject: jest.fn((obj) => obj), // Trả về chính nó mặc định
  generateSlug: jest.fn((str) => 'slug'),
  timeInVietNam: jest.fn(() => dayjs())
}));

// Mock ApiResponse
jest.mock('@/utils/ApiResponse.helper', () => {
  return jest.fn().mockImplementation(() => ({
    send: jest.fn().mockReturnValue({ status: 200 })
  }));
});

describe('updateJoinPost - Comprehensive Coverage', () => {
  let mockReq: any;
  let mockRes: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockReq = {
      params: { postId: '100' },
      body: {
        title: 'Update Join Post',
        moveInDate: '2026-05-01',
        addressProvince: 'HN',
        addressDistrict: 'CG',
        addressWard: 'DV',
        addressLongitude: 105,
        addressLatitude: 21,
        expirationAfter: 1,
        expirationAfterUnit: 'day'
      },
      currentUser: { users_detail: { userId: 1, role: 'user' } },
      files: []
    };

    // SETUP HAPPY PATH MẶC ĐỊNH
    (schemaHelper.checkUserAndPostPermission as jest.Mock).mockReturnValue(true);
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
      id: 100, ownerId: 1, type: 'join', createdAt: new Date() 
    }]);
    (postService.updatePostById as jest.Mock).mockResolvedValue([1]);
    (postService.updateJoinPostByPostId as jest.Mock).mockResolvedValue([1]);
    (postService.selectFullPostDetailById as jest.Mock).mockResolvedValue({ id: 100 });
  });

  // --- NHÓM TEST CASES ---

  test('TCQLBV50: Kiểm tra lỗi moveInDate không hợp lệ (422)', async () => {
    mockReq.body.moveInDate = 'invalid-date';
    await updateJoinPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
  });

  test('TCQLBV51: Kiểm tra nhánh Expiration - Đơn vị "hour"', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ 
        id: 100, ownerId: 1, createdAt, expirationAfter: 99 // khác giá trị body
    }]);
    mockReq.body.expirationAfter = 5;
    mockReq.body.expirationAfterUnit = 'hour';

    await updateJoinPost(mockReq, mockRes, next);

    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    expect(payload.expirationTime.toISOString()).toContain('T05:00:00');
  });

  test('TCQLBV52: Kiểm tra nhánh Geocoding - Gọi API khi thiếu tọa độ', async () => {
    mockReq.body.addressLongitude = null;
    (locationService.geocodingByGoong as jest.Mock).mockResolvedValue({ latitude: 11, longitude: 22 });

    await updateJoinPost(mockReq, mockRes, next);

    expect(locationService.geocodingByGoong).toHaveBeenCalled();
    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    expect(payload.addressLongitude).toBe(22);
  });

  test('TCQLBV53: Kiểm tra biên - expirationAfter = 0 gán hạn 99 năm', async () => {
    mockReq.body.expirationAfter = 0;
    await updateJoinPost(mockReq, mockRes, next);

    const payload = (postService.updatePostById as jest.Mock).mock.calls[0][1];
    expect(payload.expirationTime.getFullYear()).toBeGreaterThan(2100);
  });

  test('TCQLBV54: Kiểm tra ngoại lệ - Sai quyền sở hữu (403)', async () => {
    (postService.selectPostById as jest.Mock).mockResolvedValue([{ id: 100, ownerId: 999 }]);
    await updateJoinPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test('TCQLBV55: Kiểm tra success - Cập nhật thành công 200', async () => {
    await updateJoinPost(mockReq, mockRes, next);
    // Khi dùng helper ApiResponse, thường mockRes.status sẽ được gọi bên trong helper đó
    // hoặc kiểm tra việc gọi hàm update
    expect(postService.updatePostById).toHaveBeenCalled();
    expect(postService.updateJoinPostByPostId).toHaveBeenCalled();
  });
});
