import { StatusCodes } from 'http-status-codes';

// 1. Mock triệt để service để tránh lỗi Drizzle Schema
jest.mock('@/services/post.service', () => ({
  selectPostById: jest.fn(),
  updatePostById: jest.fn(),
}));

// 2. Import bằng require sau khi đã Mock
const { updateViewCount } = require('@/controllers/post.controller');
const postService = require('@/services/post.service');

describe('updateViewCount - Branch & Condition Coverage', () => {
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
      params: { postId: '100' }
    };

    // Mock DB mặc định trả về bài viết có viewedCount = 10
    postService.selectPostById.mockResolvedValue([{ id: 100, viewedCount: 10 }]);
    postService.updatePostById.mockResolvedValue(true);
  });

  // --- NHÓM 1: CÁC NHÁNH LỖI (ERROR BRANCHES) ---

  test('TCQLBV73: postId không tồn tại trong params - Expected 400', async () => {
    mockReq.params.postId = undefined;

    await updateViewCount(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.BAD_REQUEST
    }));
  });

  test('TCQLBV74: Không tìm thấy bài viết trong DB - Expected 404', async () => {
    postService.selectPostById.mockResolvedValue([]); // Trả về mảng rỗng

    await updateViewCount(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: StatusCodes.NOT_FOUND
    }));
  });

  // --- NHÓM 2: LOGIC CẬP NHẬT (SUCCESS & LOGIC BRANCHES) ---

  test('TCQLBV75: Cộng dồn lượt xem thành công (10 + 1) - Expected 11', async () => {
    await updateViewCount(mockReq, mockRes, next);

    // Kiểm tra hàm update được gọi với giá trị tăng thêm 1
    const updateCalls = postService.updatePostById.mock.calls;
    expect(updateCalls.length).toBe(1);
    
    const payload = updateCalls[0][1];
    expect(payload.viewedCount).toBe(11); // 10 (từ mock) + 1
  });

  test('TCQLBV76: Xử lý khi viewedCount ban đầu là 0', async () => {
    postService.selectPostById.mockResolvedValue([{ id: 100, viewedCount: 0 }]);

    await updateViewCount(mockReq, mockRes, next);

    const payload = postService.updatePostById.mock.calls[0][1];
    expect(payload.viewedCount).toBe(1);
  });

  test('TCQLBV77: Xử lý khi viewedCount là undefined/null (Dùng toán tử !)', async () => {
    // Trong code có post.viewedCount!, test xem nó có crash không nếu null
    postService.selectPostById.mockResolvedValue([{ id: 100, viewedCount: null }]);

    await updateViewCount(mockReq, mockRes, next);

    const payload = postService.updatePostById.mock.calls[0][1];
    // null + 1 trong JS là 1
    expect(payload.viewedCount).toBe(1);
  });

  test('TCQLBV78: Trả về phản hồi thành công 200', async () => {
    await updateViewCount(mockReq, mockRes, next);

    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Update view post successfully!'
    }));
  });
});