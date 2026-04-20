import { StatusCodes, ReasonPhrases } from 'http-status-codes';

/* 1. Mock Services & Helpers
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  updatePostById: jest.fn(),
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
}));

// Mock timeInVietNam để cố định thời gian khi test
jest.mock('@/utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => {
    const dayjs = require('dayjs');
    return dayjs('2024-01-01T00:00:00Z'); // Cố định ngày 1/1/2024
  }),
}));*/

// Phải dùng dayjs thật để các hàm .add(), .toDate() hoạt động chính xác
import dayjs from 'dayjs';

// 1. Mock helper thời gian trả về một object dayjs thực
jest.mock('@/utils/time.helper', () => ({
  timeInVietNam: jest.fn(() => dayjs('2026-01-01T00:00:00Z'))
}));

// 2. Mock ApiResponse chuẩn (Hỗ trợ cả Class và Chaining)
jest.mock('@/utils/ApiResponse.helper', () => ({
  ApiResponse: class {
    constructor(public statusCode: number, public message: string, public data: any) {}
    send(res: any) {
      return res.status(this.statusCode).send({
        message: this.message,
        data: this.data
      });
    }
  }
}));

// 3. Mock ApiError
jest.mock('@/utils/ApiError.helper', () => {
  return class ApiError extends Error {
    constructor(public statusCode: number, public message: string) {
      super(message);
    }
  };
});

// 4. Mock các Service
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  updatePostById: jest.fn(),
}));

jest.mock('@/utils/schema.helper', () => ({
  checkUserAndPostPermission: jest.fn(),
}));

const { renewPost } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');
const schemaHelper = require('@/utils/schema.helper');



describe('renewPost - Fixed Regression', () => {
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
    
    // Mặc định cho Pass các Guard Clauses
    mockReq = {
      params: { postId: '123' },
      body: { expirationAfter: 1, expirationAfterUnit: 'day' },
      currentUser: { users_detail: { userId: 1, role: 'user' } }
    };

    schemaHelper.checkUserAndPostPermission.mockReturnValue(true);
    postService.selectPostById.mockResolvedValue([{ id: 123, ownerId: 1, type: 'wanted' }]);
  });


  // --- NHÓM 1: PHỦ NHÁNH LỖI (GUARD CLAUSES) ---

  test('TCQLBV94: postId không phải số nguyên an toàn (NaN hoặc Float) - Expected 400', async () => {
    mockReq.params.postId = 'abc'; // NaN
    await renewPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));

    mockReq.params.postId = '100.5'; // Float
    await renewPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('TCQLBV95: Bài viết không tồn tại - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]);
    await renewPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('TCQLBV96: Sai chủ sở hữu bài viết - Expected 403', async () => {
    postService.selectPostById.mockResolvedValue([{ id: 100, ownerId: 999, type: 'rental' }]);
    await renewPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  // --- NHÓM 2: PHỦ CÁC NHÁNH THỜI GIAN (LOGIC BRANCHES) ---

  test('TCQLBV97: expirationAfterUnit là "hour"', async () => {
    mockReq.body = { expirationAfter: 5, expirationAfterUnit: 'hour' };
    await renewPost(mockReq, mockRes, next);
    
    const payload = postService.updatePostById.mock.calls[0][1];
    // 2024-01-01 + 5 hours
    expect(payload.expirationTime.toISOString()).toContain('T05:00:00');
  });

  test('TCQLBV98: expirationAfterUnit là "week"', async () => {
    mockReq.body = { expirationAfter: 1, expirationAfterUnit: 'week' };
    await renewPost(mockReq, mockRes, next);
    
    const payload = postService.updatePostById.mock.calls[0][1];
    // 2024-01-01 + 7 days
    expect(payload.expirationTime.getDate()).toBe(8);
  });

  test('TCQLBV99: expirationAfterUnit là "month"', async () => {
    mockReq.body = { expirationAfter: 1, expirationAfterUnit: 'month' };
    await renewPost(mockReq, mockRes, next);
    
    const payload = postService.updatePostById.mock.calls[0][1];
    expect(payload.expirationTime.getMonth()).toBe(1); // Tháng 2 (index 1)
  });

  test('TCQLBV100: Không truyền Unit (Mặc định là "day")', async () => {
    mockReq.body = { expirationAfter: 10 }; // Unit undefined
    await renewPost(mockReq, mockRes, next);
    
    const payload = postService.updatePostById.mock.calls[0][1];
    expect(payload.expirationTime.getDate()).toBe(11);
  });

  test('TCQLBV101: expirationAfter không hợp lệ (ví dụ: 0 hoặc null) -> Mặc định 99 năm', async () => {
    mockReq.body = { expirationAfter: 0 };
    await renewPost(mockReq, mockRes, next);
    
    const payload = postService.updatePostById.mock.calls[0][1];
    expect(payload.expirationTime.getFullYear()).toBe(2026 + 99);
  });

  // --- NHÓM 3: TEST BIÊN & NGOẠI LỆ (EDGE CASES & RISKS) ---

  test('TCQLBV102: NGUY CƠ FAIL - currentUser bị null', async () => {
    mockReq.currentUser = null;
    await renewPost(mockReq, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });

  test('TCQLBV103: Thành công trả về đúng message và postId', async () => {
    await renewPost(mockReq, mockRes, next);
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Renew post successfully!',
      data: { postId: 123 }
    }));
  });


  // TEST CASE QUAN TRỌNG NHẤT ĐỂ CHECK FAIL
  test('TCQLBV104: Kiểm tra logic tính toán thời gian và Update', async () => {
    await renewPost(mockReq, mockRes, next);

    // Nếu vẫn fail, dòng này sẽ in ra lỗi thật sự ẩn bên trong
    if (next.mock.calls.length > 0) {
      console.log('Lỗi gây fail test:', next.mock.calls[0][0]);
    }

    expect(next).not.toHaveBeenCalled();
    expect(postService.updatePostById).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });


test('TCQLBV105: expirationAfter là chuỗi rỗng " "', async () => {
  mockReq.body.expirationAfter = " "; // Khoảng trắng
  
  await renewPost(mockReq, mockRes, next);

  // Number(" ") trong JS là 0. 
  // 0 là falsy -> Nó sẽ nhảy vào nhánh gia hạn 99 năm.
  // Đây có phải là hành vi bạn mong muốn?
  const payload = postService.updatePostById.mock.calls[0][1];
  expect(new Date(payload.expirationTime).getFullYear()).toBe(2026 + 99);
});

test('TCQLBV106: Liên kết giữa Role và Type phải đồng nhất', async () => {
  // Giả lập role hợp lệ nhưng hàm helper báo không có quyền với loại bài này
  schemaHelper.checkUserAndPostPermission.mockReturnValue(false);

  await renewPost(mockReq, mockRes, next);

  // Phải ném lỗi 403 Forbidden
  expect(next).toHaveBeenCalledWith(expect.objectContaining({
    statusCode: 403
  }));
});
});